import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

test.describe.configure({ mode: 'serial' });

let admin: SupabaseClient;
let salesCoordinatorId = '';
let salesCoordinatorEmail = '';
let salesCoordinatorPassword = '';
let outsideLeadId = '';
let officeLocation = { latitude: 0, longitude: 0 };
let patient: { id: string; slug: string | null; full_name: string; phone: string | null; email: string | null };
const marker = `QA Sales Access ${crypto.randomUUID().slice(0, 8)}`;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const url = process.env.BSMILE_QA_SUPABASE_URL!;
  if (process.env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe' || new URL(url).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') {
    throw new Error('Sales Coordinator qualification requires the verified QA project');
  }
  admin = createClient(url, process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

  const gm = createClient(url, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const gmLogin = await gm.auth.signInWithPassword({
    email: process.env.BSMILE_QA_GENERAL_MANAGER_EMAIL!,
    password: process.env.BSMILE_QA_GENERAL_MANAGER_PASSWORD!,
  });
  if (gmLogin.error || !gmLogin.data.user) throw gmLogin.error || new Error('QA General Manager account unavailable');

  const [operations, source, status, patientResult, assignee, attendanceSettings] = await Promise.all([
    admin.from('departments').select('id').eq('name', 'Operations').single(),
    admin.from('crm_lead_sources').select('id').eq('name', 'Outdoor Marketing').single(),
    admin.from('crm_lead_statuses').select('id').eq('is_active', true).order('sort_order').limit(1).single(),
    admin.from('patients').select('id,slug,full_name,phone,email').is('deleted_at', null).limit(1).single(),
    admin.from('profiles').select('id').eq('id', gmLogin.data.user.id).single(),
    admin.from('company_attendance_settings').select('office_latitude,office_longitude').eq('id', true).single(),
  ]);
  for (const result of [operations, source, status, patientResult, assignee, attendanceSettings]) if (result.error) throw result.error;
  if (!operations.data || !source.data || !status.data || !patientResult.data || !assignee.data || attendanceSettings.data?.office_latitude == null || attendanceSettings.data.office_longitude == null) {
    throw new Error('Required QA qualification records are unavailable');
  }
  const operationsId = operations.data.id;
  const sourceId = source.data.id;
  const statusId = status.data.id;
  const assigneeId = assignee.data.id;
  officeLocation = {
    latitude: attendanceSettings.data.office_latitude,
    longitude: attendanceSettings.data.office_longitude,
  };
  patient = patientResult.data;

  salesCoordinatorEmail = `qa-sales-access-${crypto.randomUUID()}@qa.bsmile.local`;
  salesCoordinatorPassword = `${crypto.randomUUID()}Aa9!`;
  const created = await admin.auth.admin.createUser({ email: salesCoordinatorEmail, password: salesCoordinatorPassword, email_confirm: true });
  if (created.error || !created.data.user) throw created.error || new Error('Could not create Sales Coordinator QA fixture');
  salesCoordinatorId = created.data.user.id;
  const profile = await admin.from('profiles').upsert({
    id: salesCoordinatorId,
    email: salesCoordinatorEmail,
    full_name: 'QA Sales Access Coordinator',
    status: 'active',
    login_enabled: true,
    is_employee: true,
    workforce_visible: true,
    role: 'staff',
    designation: 'Sales Coordinator',
    department_id: operationsId,
  });
  if (profile.error) throw profile.error;

  const lead = await gm.from('crm_leads').insert({
    full_name: marker,
    phone: `9715${Date.now()}`,
    lead_date: new Date().toISOString().slice(0, 10),
    source_id: sourceId,
    status_id: statusId,
    assigned_to: assigneeId,
    created_by: assigneeId,
    converted_patient_id: patient.id,
    converted_at: new Date().toISOString(),
    remarks: 'Outside-assignment qualification fixture',
  }).select('id').single();
  if (lead.error) throw lead.error;
  outsideLeadId = lead.data.id;
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  if (admin && marker) {
    const leads = await admin.from('crm_leads').select('id').ilike('full_name', `${marker}%`);
    const ids = (leads.data || []).map((row) => row.id);
    if (ids.length) {
      await admin.from('crm_sales').delete().in('lead_id', ids);
      await admin.from('crm_lead_followups').delete().in('lead_id', ids);
      await admin.from('audit_logs').delete().eq('entity_type', 'crm_lead').in('entity_id', ids);
      await admin.from('crm_leads').delete().in('id', ids);
    }
  }
  if (admin && salesCoordinatorId) {
    const leaveRequests = await admin.from('leave_requests').select('id').eq('profile_id', salesCoordinatorId);
    if (leaveRequests.error) throw leaveRequests.error;
    const leaveRequestIds = (leaveRequests.data || []).map((row) => row.id);
    if (leaveRequestIds.length) {
      const events = await admin.from('leave_approval_events').delete().in('leave_request_id', leaveRequestIds);
      if (events.error) throw events.error;
      const requests = await admin.from('leave_requests').delete().in('id', leaveRequestIds);
      if (requests.error) throw requests.error;
    }
    const actorEvents = await admin.from('leave_approval_events').delete().eq('actor_id', salesCoordinatorId);
    if (actorEvents.error) throw actorEvents.error;
    const notifications = await admin.from('notifications').delete().eq('profile_id', salesCoordinatorId);
    if (notifications.error) throw notifications.error;
    const profile = await admin.from('profiles').delete().eq('id', salesCoordinatorId);
    if (profile.error) throw profile.error;
    const user = await admin.auth.admin.deleteUser(salesCoordinatorId);
    if (user.error) throw user.error;
  }
});

test('Sales Coordinator can operate all leads and open identity-only clients', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(salesCoordinatorEmail);
  await page.getByLabel('Password').fill(salesCoordinatorPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/employee(?:\/|$)/, { timeout: 20_000 });
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 30_000 });

  const scoped = createClient(process.env.BSMILE_QA_SUPABASE_URL!, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await scoped.auth.signInWithPassword({ email: salesCoordinatorEmail, password: salesCoordinatorPassword });
  if (login.error) throw login.error;
  for (const allowed of ['leads.view_all', 'patients.view_identity', 'dashboard.view', 'attendance.self', 'leave.self', 'tasks.view_self']) {
    const result = await scoped.rpc('has_permission', { permission_code: allowed });
    expect(result.error, allowed).toBeNull();
    expect(result.data, allowed).toBe(true);
  }

  for (const theme of ['standard', 'colorful'] as const) {
    await page.evaluate((value) => {
      localStorage.setItem('bsmile-theme-mode', value);
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.goto('/employee/dashboard');
    await expect(page).toHaveURL(/\/employee\/dashboard$/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.attendance-card')).toBeVisible({ timeout: 30_000 });
    await page.goto('/employee/attendance');
    await expect(page.getByRole('button', { name: /Punch-In|Punch-Out/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('table', { name: 'Personal attendance records' }).getByText('Punch-In', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('table', { name: 'Personal attendance records' }).getByText('Punch-Out', { exact: true }).first()).toBeVisible();
    await page.goto('/employee/leaves');
    await expect(page.getByRole('heading', { name: /leave/i }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Leave balance', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New leave request' })).toBeVisible();
    const overflow = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    expect(overflow.document, `${theme} mode horizontal overflow`).toBeLessThanOrEqual(overflow.viewport);
  }

  await page.context().grantPermissions(['geolocation'], { origin: process.env.BSMILE_QA_BASE_URL });
  await page.context().setGeolocation({ ...officeLocation, accuracy: 5 });
  await page.goto('/employee/attendance');
  await page.getByRole('button', { name: 'Punch-In', exact: true }).click();
  await expect(page.getByText('Attendance updated.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Start break', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start break', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End break', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'End break', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Punch-Out', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Punch-Out', exact: true }).click();
  await expect(page.getByText('Attendance updated.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Punch-Out', exact: true })).toHaveCount(0);

  await page.goto('/employee/leaves');
  const leaveDate = new Date();
  leaveDate.setUTCDate(leaveDate.getUTCDate() + 45);
  const leaveDateValue = leaveDate.toISOString().slice(0, 10);
  await page.getByLabel('Start date').fill(leaveDateValue);
  await page.getByLabel('End date').fill(leaveDateValue);
  await page.getByPlaceholder('Briefly describe why you need leave.').fill('Disposable Sales Coordinator self-service qualification');
  await page.getByRole('button', { name: 'Submit request', exact: true }).click();
  await expect(page.getByText('Leave request submitted successfully.')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Cancel request', exact: true }).first().click();
  await expect(page.getByText('Pending leave request cancelled.')).toBeVisible({ timeout: 30_000 });

  await page.goto('/employee/holidays');
  await expect(page.locator('.holiday-calendar')).toBeVisible({ timeout: 30_000 });
  await page.goto('/employee/tasks');
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
  await page.goto('/employee/profile');
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });

  await page.goto('/employee/crm/leads');
  await expect(page.getByRole('heading', { name: 'All Leads' })).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder('Search name or phone').fill(marker);
  await expect(page.getByRole('link', { name: marker, exact: true })).toBeVisible();
  await page.getByRole('link', { name: marker, exact: true }).click();
  await expect(page.getByRole('heading', { name: marker })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Convert to client' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open client' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit details' }).click();
  await page.getByLabel('Remarks').fill('Updated by Sales Coordinator QA');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Lead details updated.')).toBeVisible();
  const updated = await admin.from('crm_leads').select('remarks').eq('id', outsideLeadId).single();
  expect(updated.data?.remarks).toBe('Updated by Sales Coordinator QA');

  await page.goto('/employee/crm/leads');
  await page.getByRole('button', { name: 'Add lead' }).click();
  const createForm = page.locator('form').filter({ has: page.getByPlaceholder('Lead name') });
  await createForm.getByPlaceholder('Lead name').fill(`${marker} Created`);
  await createForm.getByPlaceholder('Phone').fill(`9716${Date.now()}`);
  await createForm.locator('select').first().selectOption({ label: 'Outdoor Marketing' });
  await createForm.getByRole('button', { name: 'Save lead' }).click();
  await expect(page.getByRole('link', { name: `${marker} Created`, exact: true })).toBeVisible({ timeout: 30_000 });

  await page.goto(`/employee/crm/leads/${outsideLeadId}`);
  await page.getByRole('link', { name: 'Open client' }).click();
  await expect(page.getByRole('heading', { name: patient.full_name })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible();
  for (const protectedTab of ['Appointments', 'Sessions', 'Documents', 'Notes', 'Activity']) {
    await expect(page.getByRole('button', { name: protectedTab, exact: true })).toHaveCount(0);
  }
  if (patient.phone) await expect(page.getByText(patient.phone, { exact: true })).toBeVisible();
  if (patient.email) await expect(page.getByText(patient.email, { exact: true })).toBeVisible();

  await page.goto('/employee/patients');
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();
  await page.getByPlaceholder('Name, ID, phone or email').fill(patient.full_name);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText(patient.full_name, { exact: true })).toBeVisible({ timeout: 30_000 });

  const [leads, clients, sessions, notes, documents, activity] = await Promise.all([
    scoped.from('crm_leads').select('id').limit(1),
    scoped.from('patients').select('id').limit(1),
    scoped.from('patient_sessions').select('id').limit(1),
    scoped.from('patient_notes').select('id').limit(1),
    scoped.from('patient_documents').select('id').limit(1),
    scoped.from('patient_activity_logs').select('id').limit(1),
  ]);
  expect(leads.error).toBeNull();
  expect(clients.error).toBeNull();
  expect(leads.data?.length).toBeGreaterThan(0);
  expect(clients.data?.length).toBeGreaterThan(0);
  for (const protectedResult of [sessions, notes, documents, activity]) {
    expect(protectedResult.data ?? []).toEqual([]);
    expect(protectedResult.error?.code, protectedResult.error?.message).not.toBe('42P17');
  }

  for (const forbidden of ['admin.shell', 'crm.manage_all', 'leads.assign', 'leads.convert_to_patient', 'finance.manage', 'payroll.manage', 'psychologist_payments.settle', 'clinical_notes.view', 'attendance.manage', 'attendance.view_team', 'leave.approve', 'leave.review', 'leave.manage', 'employees.manage']) {
    const result = await scoped.rpc('has_permission', { permission_code: forbidden });
    expect(result.data, forbidden).toBe(false);
  }

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/unauthorized(?:[/?#]|$)/, { timeout: 20_000 });
});
