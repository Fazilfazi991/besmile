import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseAvailabilityText } from '../../src/lib/weekly-availability-entry';

const directory = 'release-evidence/bulk-availability';
const f = JSON.parse(readFileSync(directory + '/fixtures.local.json', 'utf8'));
const example = 'Mon-Sat: 9-10 AM, 2-3 PM, 6-7 PM\nSun: 10 AM-1 PM';
const expected = parseAvailabilityText(example, 30).ranges;
async function signIn(page: Page, actor = 'faiz') {
  await page.goto('/sign-in');
  // Wait for the local development page to hydrate before interacting with its form.
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(f.users[actor].email);
  await page.getByLabel('Password', { exact: true }).fill(f.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/(admin|employee|clinician)(\/|$)/);
}
for (const [size, viewport] of [['desktop', { width: 1366, height: 768 }], ['mobile', { width: 390, height: 844 }]] as const) {
  for (const theme of ['standard', 'colorful']) test(`${size} ${theme}: grouped entry, editable confirmed preview and guarded save`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(value => localStorage.setItem('bsmile-theme-mode', value), theme);
    const saves: any[] = [];
    await page.route('**/*.supabase.co/**', async route => {
      const request = route.request();
      expect(new URL(request.url()).hostname).toBe('enylrvmjgbntkrgpqsfe.supabase.co');
      if (request.url().endsWith('/rpc/replace_clinician_availability')) {
        const payload = request.postDataJSON();
        // Abort before the request can touch any other record.
        if (payload.target_doctor !== f.doctor) { await route.abort(); throw Error('Only the task-owned QA clinician may be saved.'); }
        saves.push(payload);
      }
      await route.continue();
    });
    await signIn(page);
    await page.goto('/admin/online-clinicians');
    await page.locator('select').first().selectOption(f.doctor);
    const editor = page.getByRole('region', { name: 'Weekly availability', exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByText('Each time slot must fit a 30-minute consultation.')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(editor.getByRole('group', { name: /^Day group/ })).toHaveCount(2);
    const group1 = () => editor.getByRole('group', { name: 'Day group 1', exact: true });
    const group2 = () => editor.getByRole('group', { name: 'Day group 2', exact: true });
    await expect(group1().locator('input[type=time]')).toHaveCount(6);
    await expect(group2().locator('input[type=time]')).toHaveCount(2);
    await group1().getByRole('button', { name: 'Duplicate group' }).click();
    await editor.getByRole('button', { name: 'Review weekly schedule' }).click();
    const final = () => editor.getByLabel('Final schedule review');
    await expect(final().getByText(/19 weekday range/)).toBeVisible();
    expect(saves).toHaveLength(0);
    await final().getByRole('button', { name: 'Edit schedule' }).click();
    await editor.getByRole('group', { name: 'Day group 3', exact: true }).getByRole('button', { name: 'Remove group' }).click();
    await expect(group2().getByLabel('From', { exact: true })).toHaveValue('10:00');
    await editor.getByRole('button', { name: '+ Add another day group', exact: true }).click();
    const added = editor.getByRole('group', { name: 'Day group 3', exact: true });
    await added.getByRole('button', { name: 'Weekends', exact: true }).click();
    await expect(added.getByRole('checkbox', { name: 'Saturday', exact: true })).toBeChecked();
    await expect(added.getByRole('checkbox', { name: 'Sunday', exact: true })).toBeChecked();
    await added.getByRole('button', { name: 'Remove group', exact: true }).click();
    await expect(group2().getByLabel('From', { exact: true })).toHaveValue('10:00');
    // Add/remove a slot; invalid and too-short input cannot reach review or the RPC.
    await group1().getByRole('button', { name: '+ Add another time', exact: true }).click();
    await editor.getByRole('button', { name: 'Review weekly schedule' }).click();
    await expect(editor.getByRole('alert')).toContainText('valid time');
    await group1().getByLabel('From', { exact: true }).last().fill('09:00');
    await group1().getByLabel('To', { exact: true }).last().fill('09:10');
    await editor.getByRole('button', { name: 'Review weekly schedule' }).click();
    await expect(editor.getByRole('alert')).toContainText('consultation');
    await group1().getByLabel('To', { exact: true }).last().fill('09:45');
    await editor.getByRole('button', { name: 'Review weekly schedule' }).click();
    await expect(editor.getByRole('alert')).toContainText('overlap');
    await group1().getByRole('button', { name: 'Remove time 4 from group 1', exact: true }).click();
    await group1().getByRole('button', { name: 'Custom days', exact: true }).click();
    await group1().getByRole('checkbox', { name: 'Monday', exact: true }).check();
    await group1().getByRole('checkbox', { name: 'Wednesday', exact: true }).check();
    await group1().getByRole('button', { name: 'Apply to selected days' }).click();
    await expect(editor.getByRole('status')).toContainText('2 selected day');
    await editor.getByRole('button', { name: 'Review weekly schedule' }).click();
    await expect(final().getByText(/7 weekday range/)).toBeVisible();
    await final().getByRole('button', { name: 'Edit schedule' }).click();
    await group1().getByRole('button', { name: 'Mon–Sat', exact: true }).click();
    await editor.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/${size}-${theme}-structured.png`, fullPage: true });
    // Browser-level input and preview never trigger persistence.
    await editor.getByRole('button', { name: 'Paste/text entry', exact: true }).click();
    const textarea = editor.getByRole('textbox', { name: 'Paste availability', exact: true });
    await textarea.fill('Sunday: Anytime');
    await editor.getByRole('button', { name: 'Preview schedule', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText("'Anytime' needs a specific start and end time.");
    await textarea.fill(example);
    await editor.getByRole('button', { name: 'Preview schedule', exact: true }).click();
    const interpreted = editor.getByLabel('Interpreted schedule', { exact: true });
    await expect(interpreted.locator('li')).toHaveCount(19);
    expect(saves).toHaveLength(0);
    await page.screenshot({ path: `${directory}/${size}-${theme}-preview.png`, fullPage: true });
    await interpreted.getByRole('button', { name: 'Confirm & use schedule', exact: true }).click();
    expect(saves).toHaveLength(0);
    // Confirmed groups can be edited before saving.
    await group1().getByLabel('From', { exact: true }).first().fill('09:15');
    await editor.getByRole('button', { name: 'Review weekly schedule' }).click();
    await expect(final().getByText('9:15 AM – 10:00 AM')).toHaveCount(6);
    await final().getByRole('button', { name: 'Edit schedule' }).click();
    await group1().getByLabel('From', { exact: true }).first().fill('09:00');
    await editor.getByRole('button', { name: 'Review weekly schedule' }).click();
    await final().getByRole('button', { name: 'Save availability', exact: true }).click();
    await expect(editor.getByRole('status')).toHaveText('Availability saved.');
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual({ target_doctor: f.doctor, ranges: expected });
    // Refresh proves the canonical persisted rows load without losses.
    await page.reload();
    await page.locator('select').first().selectOption(f.doctor);
    await expect(group1().locator('input[type=time]')).toHaveCount(6);
    await editor.getByRole('button', { name: 'Review weekly schedule' }).click();
    await expect(final().getByText(/19 weekday range/)).toBeVisible();
    // Measure the editor and its controls within the viewport, in both themes.
    const overflow = await editor.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return { own: element.scrollWidth > element.clientWidth + 1, viewport: bounds.left < 0 || bounds.right > innerWidth + 1,
        controls: [...element.querySelectorAll('input,textarea,button')].some(control => { const rect = control.getBoundingClientRect(); return rect.left < bounds.left || rect.right > bounds.right + 1; }) };
    });
    expect(overflow).toEqual({ own: false, viewport: false, controls: false });
    // Re-preview invalidates an old interpretation; explicit overnight is displayed.
    await editor.getByRole('button', { name: 'Paste/text entry', exact: true }).click();
    await textarea.fill('Monday-Saturday: 1:30 PM-1 AM');
    await editor.getByRole('button', { name: 'Preview schedule', exact: true }).click();
    await expect(interpreted.getByText('Ends next day', { exact: true })).toHaveCount(6);
    await textarea.fill('Monday: 9 AM, 2 PM');
    await expect(interpreted).toHaveCount(0);
    await editor.getByRole('button', { name: 'Preview schedule', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('start times but no end times');
    expect(saves).toHaveLength(1);
  });
}
test('external psychologist views own weekly schedule without availability editing', async ({ page }) => {
  await signIn(page, 'external');
  await page.goto('/clinician/schedule');
  await expect(page.getByRole('heading', { name: 'Availability', exact: true })).toBeVisible();
  await expect(page.getByText('Your scheduling manager maintains these times.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save availability', exact: true })).toHaveCount(0);
  await page.goto('/admin/online-clinicians');
  await expect(page).toHaveURL(/\/clinician\/schedule/);
});
