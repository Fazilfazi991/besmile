import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { assertNoRawDatabaseError, credentials, login, navigateAfterLogin } from './helpers';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

async function generalManagerDb() {
  const url = required('BSMILE_QA_SUPABASE_URL');
  if (!url.includes('enylrvmjgbntkrgpqsfe')) throw new Error('Appointment fixture requires QA Supabase');
  const db = createClient(url, required('BSMILE_QA_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.auth.signInWithPassword(credentials('general_manager'));
  if (error) throw error;
  return db;
}

test('scheduler creates and edits an appointment with an hourly slot and saved manual fee', async ({ page }) => {
  test.setTimeout(150_000);
  const db = await generalManagerDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('General Manager fixture missing');
  const marker = `RELEASE_GATE_APPOINTMENT_${Date.now()}`;
  const patientNumber = `RG-${Date.now()}`;
  const createdPatient = await db.from('patients').insert({
    patient_number: patientNumber, full_name: marker, status: 'active', source: 'Other',
    tags: ['Release Gate'], is_demo: true, created_by: user.id,
  }).select('id,slug').single();
  if (createdPatient.error || !createdPatient.data) throw createdPatient.error || new Error('QA patient fixture was not created');
  const clinicians = await db.from('outsourced_doctors').select('id,consultation_duration_minutes,availability:doctor_weekly_availability(day_of_week,start_time,end_time)').eq('status', 'active').is('archived_at', null);
  if (clinicians.error) throw clinicians.error;
  const clinician = clinicians.data?.find(item => item.availability?.length);
  if (!clinician) throw new Error('QA clinician availability fixture missing');
  let appointmentDate = '';
  for (let day = 30; day < 45 && !appointmentDate; day += 1) {
    const candidate = new Date(Date.now() + day * 86_400_000);
    if (clinician.availability.some(range => range.day_of_week === candidate.getUTCDay())) appointmentDate = candidate.toISOString().slice(0, 10);
  }
  if (!appointmentDate) throw new Error('No QA appointment date matches clinician availability');

  let appointmentId: string | undefined;
  try {
    await login(page, 'general_manager');
    await navigateAfterLogin(page, '/admin/doctor-scheduling');
    await page.getByRole('button', { name: 'Appointments', exact: true }).click();
    const form = page.locator('.appointment-form');
    await form.locator('select').nth(0).selectOption(createdPatient.data.id);
    await form.locator('input[type="date"]').fill(appointmentDate);
    await form.locator('select').nth(1).selectOption(clinician.id);
    const firstSlot = form.locator('.slot-picker button').first();
    await expect(firstSlot).toBeVisible();
    await firstSlot.click();
    await form.getByLabel('Appointment Fee (INR)').fill('1250');
    await form.getByRole('button', { name: 'Confirm Appointment' }).click();
    await expect(page.getByText('Appointment scheduled.')).toBeVisible();

    const createdAppointment = await db.from('doctor_appointments').select('id,psychologist_fee_snapshot').eq('patient_id', createdPatient.data.id).single();
    if (createdAppointment.error || !createdAppointment.data) throw createdAppointment.error || new Error('Appointment was not persisted');
    appointmentId = createdAppointment.data.id;
    expect(Number(createdAppointment.data.psychologist_fee_snapshot)).toBe(1250);

    await navigateAfterLogin(page, `/admin/patients/${createdPatient.data.slug}`);
    await page.getByRole('button', { name: 'Appointments', exact: true }).click();
    const card = page.locator('.patient-appointment-card').filter({ hasText: '₹1,250' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Edit', exact: true }).click();
    const editForm = page.locator('.patient-appointment-form');
    await expect(editForm.getByLabel('Appointment Fee (INR)')).toHaveValue('1250');
    const editSlot = editForm.locator('.slot-picker button').first();
    await expect(editSlot).toBeVisible();
    if (test.info().project.name === 'mobile-390') {
      await editSlot.focus();
      await editSlot.press('Enter');
    } else await editSlot.click();
    await editForm.getByLabel('Appointment Fee (INR)').fill('1350');
    const saveButton = editForm.getByRole('button', { name: 'Save', exact: true });
    if (test.info().project.name === 'mobile-390') {
      await saveButton.focus();
      await saveButton.press('Enter');
    } else await saveButton.click();
    await expect(page.getByText('Appointment updated.')).toBeVisible();
    const updated = await db.from('doctor_appointments').select('psychologist_fee_snapshot').eq('id', appointmentId).single();
    if (updated.error) throw updated.error;
    expect(Number(updated.data.psychologist_fee_snapshot)).toBe(1350);
    await assertNoRawDatabaseError(page);
  } finally {
    if (appointmentId) await db.rpc('delete_doctor_appointment', { target_appointment: appointmentId, delete_remarks: 'Release gate cleanup' });
    const deleted = await db.from('patients').delete().eq('id', createdPatient.data.id);
    if (deleted.error) await db.from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', createdPatient.data.id);
  }
});

test('Total employees KPI keeps its chart legend inside the mobile card', async ({ page }) => {
  await login(page, 'general_manager');
  await navigateAfterLogin(page, '/admin');
  const card = page.locator('a.executive-kpi[href="/admin/employees"]').first();
  const legend = card.locator('.kpi-chart-legend');
  await expect(legend).toBeVisible();
  await expect(legend.locator('span')).toHaveCount(3);
  const clipped = await legend.evaluate(element => {
    const box = element.getBoundingClientRect();
    // Font ink can extend beyond its line box without being clipped when overflow is visible.
    const clipsVertically = getComputedStyle(element).overflowY !== 'visible';
    return [...element.querySelectorAll('small, b')].some(child => {
      const childBox = child.getBoundingClientRect();
      return childBox.top < box.top - 1 || childBox.bottom > box.bottom + 1;
    }) || (clipsVertically && element.scrollHeight > element.clientHeight + 1);
  });
  expect(clipped, 'All legend labels and values must fit without clipping').toBe(false);
  const [cardBox, legendBox] = await Promise.all([card.boundingBox(), legend.boundingBox()]);
  expect(cardBox && legendBox).toBeTruthy();
  expect(legendBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
  expect(legendBox!.x + legendBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
  expect(legendBox!.y + legendBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
