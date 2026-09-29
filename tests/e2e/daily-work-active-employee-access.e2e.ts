import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

test.describe.configure({ mode: "serial" });

const localUrl = process.env.BSMILE_LOCAL_SUPABASE_URL || "";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(localUrl);

type Fixture = { id: string; client: SupabaseClient };
let admin: SupabaseClient;
const fixtures: Fixture[] = [];

async function createFixture(
  label: string,
  departmentId: string,
  designation: string,
  role: string,
  options: { status?: string; isEmployee?: boolean; managerId?: string } = {},
) {
  const password = `${crypto.randomUUID()}Aa9!`;
  const emailLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const email = `daily-work-${emailLabel}-${crypto.randomUUID()}@local.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error || new Error("Fixture auth creation failed");
  const isEmployee = options.isEmployee ?? true;
  const profile = await admin.from("profiles").upsert({
    id: created.data.user.id,
    email,
    full_name: `Daily Work ${label}`,
    employee_code: `DW-${crypto.randomUUID().slice(0, 8)}`,
    status: options.status || "active",
    login_enabled: true,
    is_employee: isEmployee,
    workforce_visible: isEmployee,
    role,
    designation,
    department_id: departmentId,
    manager_id: options.managerId || null,
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
  const ids = fixtures.map((fixture) => fixture.id);
  if (ids.length) {
    await admin.from("profiles").update({ manager_id: null }).in("id", ids);
    await admin.from("profiles").delete().in("id", ids);
    for (const fixture of fixtures) await admin.auth.admin.deleteUser(fixture.id);
  }
});

test("active employees own their updates while manager scope remains unchanged", async () => {
  const departments = await admin.from("departments").select("id,name").in("name", ["Marketing", "Operations"]);
  if (departments.error) throw departments.error;
  const marketingId = departments.data?.find((row) => row.name === "Marketing")?.id;
  const operationsId = departments.data?.find((row) => row.name === "Operations")?.id;
  if (!marketingId || !operationsId) throw new Error("Required departments are missing");

  const manager = await createFixture("Manager", operationsId, "General Manager", "general_manager");
  const employees = [
    await createFixture("Marketing Coordinator", marketingId, "Sales Coordinator", "guest_sales"),
    await createFixture("Operations Coordinator", operationsId, "Sales Coordinator", "guest_sales"),
    await createFixture("Ordinary Staff", marketingId, "Ordinary Staff", "staff"),
    await createFixture("Psychologist", operationsId, "Psychologist", "psychologist"),
    await createFixture("Managed Staff", operationsId, "Ordinary Staff", "staff", { managerId: manager.id }),
  ];
  const workDate = new Date().toISOString().slice(0, 10);

  for (const [index, employee] of employees.entries()) {
    const summary = `Own daily update ${index}`;
    const saved = await employee.client.from("daily_work_updates").upsert({
      profile_id: employee.id,
      work_date: workDate,
      summary,
    }, { onConflict: "profile_id,work_date" }).select("profile_id,summary").single();
    expect(saved.error, summary).toBeNull();
    expect(saved.data).toEqual({ profile_id: employee.id, summary });
  }

  const ordinary = employees[2];
  const ownRows = await ordinary.client.from("daily_work_updates")
    .select("profile_id,summary").eq("work_date", workDate);
  expect(ownRows.error).toBeNull();
  expect(ownRows.data).toEqual([{ profile_id: ordinary.id, summary: "Own daily update 2" }]);

  const otherRows = await ordinary.client.from("daily_work_updates")
    .select("profile_id").eq("profile_id", employees[0].id);
  expect(otherRows.error).toBeNull();
  expect(otherRows.data).toEqual([]);

  const crossUserWrite = await ordinary.client.from("daily_work_updates").insert({
    profile_id: employees[0].id,
    work_date: "2099-01-01",
    summary: "Forbidden cross-user update",
  });
  expect(crossUserWrite.error).not.toBeNull();

  const edited = await ordinary.client.from("daily_work_updates")
    .update({ summary: "Edited own daily update" })
    .eq("profile_id", ordinary.id).eq("work_date", workDate)
    .select("summary").single();
  expect(edited.error).toBeNull();
  expect(edited.data?.summary).toBe("Edited own daily update");

  const managedStaff = employees[4];
  const managerView = await manager.client.from("daily_work_updates")
    .select("profile_id,summary").eq("profile_id", managedStaff.id).single();
  expect(managerView.error).toBeNull();
  expect(managerView.data?.profile_id).toBe(managedStaff.id);
});
