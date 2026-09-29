import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

test.describe.configure({ mode: "serial" });

const localUrl = process.env.BSMILE_LOCAL_SUPABASE_URL || "";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(localUrl);

type Fixture = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
};

let admin: SupabaseClient;
const fixtures: Fixture[] = [];
const createdLeadIds: string[] = [];

async function createFixture(
  label: string,
  departmentId: string,
  designation: string,
  role: string,
  status: string = "active",
) {
  const password = `${crypto.randomUUID()}Aa9!`;
  const emailLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const email = `hotfix-${emailLabel}-${crypto.randomUUID()}@local.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) throw created.error || new Error("Fixture auth creation failed");

  const profile = await admin.from("profiles").upsert({
    id: created.data.user.id,
    email,
    full_name: `Hotfix ${label}`,
    employee_code: `HF-${crypto.randomUUID().slice(0, 8)}`,
    status,
    login_enabled: true,
    is_employee: true,
    workforce_visible: true,
    role,
    designation,
    department_id: departmentId,
  });
  if (profile.error) throw profile.error;

  const client = createClient(
    localUrl,
    process.env.BSMILE_LOCAL_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const fixture = { id: created.data.user.id, email, password, client };
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
  admin = createClient(localUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

test.afterAll(async () => {
  if (!admin) return;
  if (createdLeadIds.length) {
    await admin.from("crm_lead_followups").delete().in("lead_id", createdLeadIds);
    await admin.from("audit_logs").delete().eq("entity_type", "crm_lead").in("entity_id", createdLeadIds);
    await admin.from("crm_leads").delete().in("id", createdLeadIds);
  }
  const ids = fixtures.map((fixture) => fixture.id);
  if (ids.length) {
    await admin.from("attendance_breaks").delete().in("created_by", ids);
    await admin.from("attendance").delete().in("profile_id", ids);
    await admin.from("notifications").delete().in("profile_id", ids);
    await admin.from("profiles").delete().in("id", ids);
    for (const fixture of fixtures) await admin.auth.admin.deleteUser(fixture.id);
  }
});

test("Marketing and Operations Sales Coordinators retain the approved narrow workflow", async () => {
  const departments = await admin.from("departments").select("id,name").in("name", ["Marketing", "Operations"]);
  if (departments.error) throw departments.error;
  const marketingId = departments.data?.find((row) => row.name === "Marketing")?.id;
  const operationsId = departments.data?.find((row) => row.name === "Operations")?.id;
  if (!marketingId || !operationsId) throw new Error("Required departments are missing");

  const marketingCoordinator = await createFixture("Marketing Coordinator", marketingId, "Sales Coordinator", "guest_sales");
  const operationsCoordinator = await createFixture("Operations Coordinator", operationsId, "Sales Coordinator", "guest_sales");
  const marketingOrdinary = await createFixture("Marketing Ordinary", marketingId, "Hotfix Ordinary", "staff");
  const operationsOrdinary = await createFixture("Operations Ordinary", operationsId, "Hotfix Ordinary", "staff");
  const inactiveCoordinator = await createFixture("Inactive Coordinator", marketingId, "Sales Coordinator", "guest_sales", "inactive");

  const allowed = [
    "dashboard.view", "attendance.self", "leads.view", "leads.view_all",
    "leads.create", "leads.edit", "leads.manage_status", "crm.view_assigned",
    "patients.view_identity", "leave.self", "tasks.view_self",
  ];
  const forbidden = [
    "attendance.manage", "attendance.view_team", "leads.assign", "crm.manage_all",
    "finance.manage", "payroll.manage", "employees.manage", "clinical_notes.view",
    "roles.manage", "permissions.manage", "admin.shell",
  ];

  for (const coordinator of [marketingCoordinator, operationsCoordinator]) {
    for (const code of allowed) expect(await permission(coordinator.client, code), code).toBe(true);
    for (const code of forbidden) expect(await permission(coordinator.client, code), code).toBe(false);
  }
  for (const ordinary of [marketingOrdinary, operationsOrdinary]) {
    for (const code of ["leads.view_all", "leads.create", "patients.view_identity"])
      expect(await permission(ordinary.client, code), code).toBe(false);
    for (const code of ["attendance.manage", "attendance.view_team", "crm.manage_all"])
      expect(await permission(ordinary.client, code), code).toBe(false);
  }
  for (const code of [...allowed, ...forbidden])
    expect(await permission(inactiveCoordinator.client, code), code).toBe(false);

  const lookups = await Promise.all([
    admin.from("crm_lead_sources").select("id").eq("is_active", true).limit(1).single(),
    admin.from("crm_lead_statuses").select("id").eq("is_active", true).order("sort_order").limit(1).single(),
  ]);
  for (const result of lookups) if (result.error) throw result.error;
  const [source, status] = lookups.map((result) => result.data!);

  const created = await marketingCoordinator.client.from("crm_leads").insert({
    full_name: "Hotfix Local Lead",
    phone: `9715${Date.now()}`,
    lead_date: new Date().toISOString().slice(0, 10),
    source_id: source.id,
    status_id: status.id,
    assigned_to: marketingCoordinator.id,
    created_by: marketingCoordinator.id,
    temperature: "cold",
  }).select("id,temperature").single();
  expect(created.error).toBeNull();
  createdLeadIds.push(created.data!.id);

  const updated = await marketingCoordinator.client.from("crm_leads")
    .update({ temperature: "warm" }).eq("id", created.data!.id)
    .select("temperature").single();
  expect(updated.error).toBeNull();
  expect(updated.data?.temperature).toBe("warm");

  const visibleLead = await operationsCoordinator.client.from("crm_leads")
    .select("id").eq("id", created.data!.id).single();
  expect(visibleLead.error).toBeNull();

  const visiblePatients = await marketingCoordinator.client.from("patients").select("id,full_name");
  expect(visiblePatients.error).toBeNull();
  expect(visiblePatients.data?.length).toBeGreaterThan(0);

  const hiddenPatients = await marketingOrdinary.client.from("patients").select("id,full_name");
  expect(hiddenPatients.error).toBeNull();
  expect(hiddenPatients.data).toEqual([]);

  const deniedCreate = await marketingOrdinary.client.from("crm_leads").insert({
    full_name: "Denied Local Lead",
    phone: `9716${Date.now()}`,
    lead_date: new Date().toISOString().slice(0, 10),
    source_id: source.id,
    status_id: status.id,
    assigned_to: marketingOrdinary.id,
    created_by: marketingOrdinary.id,
  });
  expect(deniedCreate.error).not.toBeNull();

  const settings = await admin.from("company_attendance_settings")
    .select("office_latitude,office_longitude").eq("id", true).single();
  if (settings.error) throw settings.error;
  const location = {
    p_latitude: settings.data.office_latitude,
    p_longitude: settings.data.office_longitude,
    p_accuracy_metres: 1,
  };
  const clockIn = await marketingCoordinator.client.rpc("record_self_attendance_location", { p_action: "clock_in", ...location });
  expect(clockIn.error).toBeNull();
  const clockOut = await marketingCoordinator.client.rpc("record_self_attendance_location", { p_action: "clock_out", ...location });
  expect(clockOut.error).toBeNull();
});
