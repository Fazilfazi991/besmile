import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { credentials, login, navigateAfterLogin } from './helpers';
import { fixtureLogin } from './fixture-auth';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

test('appointment card opens the shared lifecycle detail on desktop and mobile', async ({ page }) => {
  const qaUrl = required('BSMILE_QA_SUPABASE_URL');
  if (required('BSMILE_QA_PROJECT_REF') !== 'enylrvmjgbntkrgpqsfe' || new URL(qaUrl).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') {
    throw new Error('Appointment detail browser QA requires the verified QA project');
  }
  const db = createClient(qaUrl, required('BSMILE_QA_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: loginError } = await fixtureLogin(() => db.auth.signInWithPassword(credentials('general_manager')), 'general_manager');
  if (loginError) throw loginError;
  const appointments = await db.from('doctor_appointments').select('id,patient:patients(slug),payable:psychologist_session_payables(status)').eq('status', 'completed').is('deleted_at', null).order('start_at', { ascending: false }).limit(20);
  if (appointments.error) throw appointments.error;
  const appointment = appointments.data?.find(item => {
    const payable = Array.isArray(item.payable) ? item.payable[0] : item.payable;
    return payable?.status === 'payment_due';
  });
  const patient = Array.isArray(appointment?.patient) ? appointment.patient[0] : appointment?.patient;
  if (!patient?.slug) throw new Error('QA completed payable appointment fixture is missing');

  await login(page, 'general_manager');
  await navigateAfterLogin(page, `/admin/patients/${patient.slug}`);
  await page.getByRole('button', { name: 'Appointments', exact: true }).click();
  const card = page.locator('.patient-appointment-summary').first();
  await expect(card).toBeVisible();
  await card.focus();
  await card.press('Enter');
  const detail = page.getByRole('dialog');
  await expect(detail).toBeVisible();
  await expect(detail.getByText('Appointment status')).toBeVisible();
  await expect(detail.getByText('Session status')).toBeVisible();
  await expect(detail.getByText('Psychologist payment')).toBeVisible();
  await expect(detail.getByText('Payment due', { exact: true })).toBeVisible();
  await expect(detail.getByText(/minutes$/)).toBeVisible();
  await expect(detail.getByRole('button', { name: /mark paid/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  await navigateAfterLogin(page, '/admin/finance/psychologist-payments');
  await expect(page.getByText(appointment!.id, { exact: true })).toBeVisible();
  await expect(page.getByText(/^(payment due|overdue)$/).first()).toBeVisible();
});
