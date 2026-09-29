import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

test.describe.configure({ mode: "serial" });

const localUrl = process.env.BSMILE_LOCAL_SUPABASE_URL || "";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(localUrl);
const localPassword = "LocalOnly9!Marketing";

type Fixture = { id: string; client: SupabaseClient };
let admin: SupabaseClient;
const fixtures: Fixture[] = [];

async function signIn(email: string) {
  const client = createClient(localUrl, process.env.BSMILE_LOCAL_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({ email, password: localPassword });
  if (login.error || !login.data.user) throw login.error || new Error(`Unable to sign in ${email}`);
  return { id: login.data.user.id, client };
}

async function createFixture(
  label: string,
  departmentId: string,
  designation: string,
  role: string,
  options: { status?: string; isEmployee?: boolean } = {},
) {
  const password = `${crypto.randomUUID()}Aa9!`;
  const email = `marketing-hotfix-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID()}@local.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error || new Error("Fixture auth creation failed");
  const isEmployee = options.isEmployee ?? true;
  const profile = await admin.from("profiles").insert({
    id: created.data.user.id,
    email,
    full_name: `Marketing Hotfix ${label}`,
    employee_code: `MO-${crypto.randomUUID().slice(0, 8)}`,
    status: options.status || "active",
    login_enabled: true,
    is_employee: isEmployee,
    workforce_visible: isEmployee,
    role,
    designation,
    department_id: departmentId,
  });
  if (profile.error) throw profile.error;
  const client = createClient(localUrl, process.env.BSMILE_LOCAL_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const fixture = { id: created.data.user.id, client };
  fixtures.push(fixture);
  return fixture;
}

async function permission(client: SupabaseClient, code: string) {
  const result = await client.rpc("has_permission", { permission_code: code });
  expect(result.error, code).toBeNull();
  return result.data === true;
}

test.beforeAll(async () => {
  test.skip(!isLocal, "This regression test is restricted to local Supabase");
  const serviceKey = process.env.BSMILE_LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.BSMILE_LOCAL_SUPABASE_ANON_KEY;
  if (!serviceKey || !anonKey) throw new Error("Local Supabase keys are required");
  admin = createClient(localUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
});

test.afterAll(async () => {
  if (!admin) return;
  const ids = fixtures.map((fixture) => fixture.id);
  if (ids.length) {
    await admin.from("profiles").delete().in("id", ids);
    for (const fixture of fixtures) await admin.auth.admin.deleteUser(fixture.id);
  }
});

test("approved Marketing staff receive full CRM and department Daily Work review only", async () => {
  const departments = await admin.from("departments").select("id,name").in("name", ["Marketing", "Operations"]);
  if (departments.error) throw departments.error;
  const marketingId = departments.data?.find((row) => row.name === "Marketing")?.id;
  const operationsId = departments.data?.find((row) => row.name === "Operations")?.id;
  if (!marketingId || !operationsId) throw new Error("Required departments are missing");

  const manager = await signIn("bdmbsmile@gmail.com");
  const coordinator = await signIn("salescobsmile@gmail.com");
  const ordinary = await createFixture("Ordinary", marketingId, "Ordinary Staff", "staff");
  const operationsStaff = await createFixture("Operations", operationsId, "Ordinary Staff", "staff");
  const salesCoordinator = await createFixture("Sales Coordinator", marketingId, "Sales Coordinator", "guest_sales");
  const inactive = await createFixture("Inactive Manager", marketingId, "Marketing Manager", "staff", { status: "inactive" });
  const external = await createFixture("External Manager", marketingId, "Marketing Manager", "staff", { isEmployee: false });

  const approved = [
    "attendance.self", "crm.import", "crm.manage_all", "daily_work.review_department",
    "dashboard.view", "leads.convert_to_patient", "leads.create", "leads.edit",
    "patients.create", "patients.view_identity", "sales.edit",
  ];
  const forbidden = [
    "attendance.manage", "attendance.view", "attendance.view_team", "crm.delete",
    "admin.shell", "finance.manage", "payroll.manage", "employees.manage",
    "clinical_notes.view", "roles.manage", "permissions.manage",
  ];
  for (const approvedUser of [manager, coordinator]) {
    for (const code of approved) expect(await permission(approvedUser.client, code), code).toBe(true);
    for (const code of forbidden) expect(await permission(approvedUser.client, code), code).toBe(false);
  }
  for (const user of [ordinary, inactive, external]) {
    expect(await permission(user.client, "crm.manage_all")).toBe(false);
    expect(await permission(user.client, "daily_work.review_department")).toBe(false);
  }
  expect(await permission(salesCoordinator.client, "attendance.self")).toBe(true);
  expect(await permission(salesCoordinator.client, "leads.create")).toBe(true);
  expect(await permission(salesCoordinator.client, "crm.manage_all")).toBe(false);
  expect(await permission(salesCoordinator.client, "daily_work.review_department")).toBe(false);

  const source = await admin.from("crm_lead_sources").select("id").eq("is_active", true).limit(1).single();
  const status = await admin.from("crm_lead_statuses").select("id").eq("is_active", true).limit(1).single();
  if (source.error || status.error) throw source.error || status.error;
  const createLead = async (client: SupabaseClient, creator: string, assignee: string, suffix: string) => {
    const created = await client.from("crm_leads").insert({
      full_name: `Marketing CRM ${suffix}`,
      phone: `9715${Date.now()}${suffix}`,
      lead_date: new Date().toISOString().slice(0, 10),
      source_id: source.data.id,
      status_id: status.data.id,
      assigned_to: assignee,
      created_by: creator,
      temperature: "cold",
    }).select("id").single();
    expect(created.error).toBeNull();
    return created.data!.id;
  };
  const saleLead = await createLead(manager.client, manager.id, ordinary.id, "sale");
  const clientLead = await createLead(coordinator.client, coordinator.id, coordinator.id, "client");

  const reassigned = await manager.client.from("crm_leads")
    .update({ assigned_to: coordinator.id, temperature: "hot", full_name: "Marketing CRM reassigned" })
    .eq("id", saleLead).select("assigned_to,temperature,full_name").single();
  expect(reassigned.error).toBeNull();
  expect(reassigned.data).toMatchObject({ assigned_to: coordinator.id, temperature: "hot", full_name: "Marketing CRM reassigned" });

  const followup = await coordinator.client.from("crm_lead_followups").insert({
    lead_id: saleLead,
    created_by: coordinator.id,
    note: "Approved local follow-up",
    followup_number: 1,
    follow_up_at: new Date(Date.now() + 86400000).toISOString(),
  }).select("id,note").single();
  expect(followup.error).toBeNull();

  const sale = await coordinator.client.rpc("convert_crm_lead_to_sale", { target_lead: saleLead, sale_amount: 1000 });
  expect(sale.error).toBeNull();
  const patient = await manager.client.rpc("convert_lead_to_patient", { target_lead: clientLead, requested_patient_number: `LOCAL-${Date.now()}` });
  expect(patient.error).toBeNull();
  const patientResult = Array.isArray(patient.data) ? patient.data[0] : patient.data;
  const patientId = typeof patientResult === "string" ? patientResult : patientResult?.patient_id;
  expect(patientId).toBeTruthy();
  const patientIdentity = await manager.client.from("patients").select("id,full_name,phone").eq("id", patientId).single();
  expect(patientIdentity.error).toBeNull();

  const settings = await admin.from("company_attendance_settings").select("office_latitude,office_longitude").eq("id", true).single();
  if (settings.error) throw settings.error;
  const workDate = new Date().toISOString().slice(0, 10);
  const clearedAttendance = await admin.from("attendance")
    .delete().in("profile_id", [manager.id, coordinator.id]).eq("work_date", workDate);
  expect(clearedAttendance.error).toBeNull();
  for (const employee of [manager, coordinator]) {
    const location = { p_latitude: settings.data.office_latitude, p_longitude: settings.data.office_longitude, p_accuracy_metres: 1 };
    expect((await employee.client.rpc("record_self_attendance_location", { p_action: "clock_in", ...location })).error).toBeNull();
    expect((await employee.client.rpc("record_self_attendance_location", { p_action: "clock_out", ...location })).error).toBeNull();
  }

  for (const [employee, summary] of [
    [manager, "Manager own update"],
    [coordinator, "Coordinator own update"],
    [ordinary, "Marketing ordinary update"],
    [operationsStaff, "Operations update"],
  ] as const) {
    const saved = await employee.client.from("daily_work_updates").upsert({ profile_id: employee.id, work_date: workDate, summary }, { onConflict: "profile_id,work_date" });
    expect(saved.error, summary).toBeNull();
  }
  const departmentReport = await manager.client.from("daily_work_updates").select("profile_id,summary").eq("profile_id", ordinary.id).single();
  expect(departmentReport.error).toBeNull();
  expect(departmentReport.data?.summary).toBe("Marketing ordinary update");
  const crossDepartment = await manager.client.from("daily_work_updates").select("profile_id").eq("profile_id", operationsStaff.id);
  expect(crossDepartment.error).toBeNull();
  expect(crossDepartment.data).toEqual([]);
  const ordinaryCannotReview = await ordinary.client.from("daily_work_updates").select("profile_id").eq("profile_id", manager.id);
  expect(ordinaryCannotReview.error).toBeNull();
  expect(ordinaryCannotReview.data).toEqual([]);
});
