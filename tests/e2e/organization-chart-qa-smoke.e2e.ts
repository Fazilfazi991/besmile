import { expect, test, type Page } from '@playwright/test';
import { credentials, login, type QaRole } from './helpers';

async function loginForBrowser(page: Page, role: QaRole, browserName: string) {
  if (browserName !== 'webkit') return login(page, role, { reuseState: false });
  const account = credentials(role);
  await page.goto('/sign-in');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await expect(page.getByLabel('Email')).toHaveValue(account.email);
  await expect(page.getByLabel('Password')).toHaveValue(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(role === 'admin' ? /\/admin(?:\/|$)/ : /\/employee\/dashboard/, { timeout: 30_000 });
}

test('real QA directory, photo fallback, and server-provided editing permissions', async ({ browser, browserName }) => {
  const employeeContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3100', viewport: { width: 1366, height: 768 } });
  const adminContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3100', viewport: { width: 1366, height: 768 } });
  try {
    const employee = await employeeContext.newPage();
    await loginForBrowser(employee, 'employee', browserName);
    const employeeDirectory = employee.waitForResponse(response => response.url().includes('/rpc/organization_directory'));
    await employee.goto('/employee/profile');
    const employeeResponse = await employeeDirectory;
    expect(employeeResponse.ok()).toBe(true);
    const employeeRows = await employeeResponse.json() as Array<{ id: string; can_edit: boolean }>;
    expect(employeeRows.length).toBeGreaterThan(0);
    await expect(employee.getByRole('heading', { name: 'Organization chart' })).toBeVisible();
    await expect(employee.locator('[data-org-edit-id]')).toHaveCount(0);
    await employee.getByRole('button', { name: 'Find me' }).click();
    const currentAvatar = employee.locator('.organization-person-card.is-current .organization-person-avatar');
    await expect(currentAvatar).toBeVisible();
    await expect.poll(() => currentAvatar.evaluate(element => {
      const photo = element.querySelector('img');
      if (photo) return photo.complete && photo.naturalWidth > 0 ? 'photo' : 'pending';
      return element.querySelector('span')?.textContent?.trim() ? 'fallback' : 'pending';
    })).toMatch(/photo|fallback/);

    const admin = await adminContext.newPage();
    await loginForBrowser(admin, 'admin', browserName);
    const adminDirectory = admin.waitForResponse(response => response.url().includes('/rpc/organization_directory'));
    await admin.goto(`/admin/employees/${employeeRows[0].id}`);
    const adminResponse = await adminDirectory;
    expect(adminResponse.ok()).toBe(true);
    const adminRows = await adminResponse.json() as Array<{ id: string; full_name: string; manager_id: string | null; can_edit: boolean }>;
    const editable = adminRows.find(row => row.can_edit && !row.manager_id) || adminRows.find(row => row.can_edit);
    expect(editable).toBeDefined();
    await expect(admin.getByRole('heading', { name: 'Organization chart' })).toBeVisible();
    await admin.getByRole('button', { name: 'List', exact: true }).click();
    const edit = admin.getByRole('button', { name: `Edit organization details for ${editable!.full_name}` });
    await expect(edit).toBeVisible();
    await edit.click();
    await expect(admin.getByRole('dialog', { name: 'Edit organization details' })).toBeVisible();
    await admin.getByRole('button', { name: 'Cancel' }).click();
    await expect(admin.getByRole('dialog', { name: 'Edit organization details' })).toHaveCount(0);
  } finally {
    await employeeContext.close();
    await adminContext.close();
  }
});
