import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const baseURL = process.env.BSMILE_QA_BASE_URL;
const email = process.env.BSMILE_QA_DIRECTOR_EMAIL;
const password = process.env.BSMILE_QA_DIRECTOR_PASSWORD;
if (!baseURL || !email || !password) throw new Error('Local QA URL and Director credentials are required');

const output = join(process.cwd(), 'qa-artifacts', 'photo-viewer-fit-screenshots');
mkdirSync(output, { recursive: true });
const photos = {
  chairman: await sharp(join(process.cwd(), 'public', 'employee_demo_dps_webp', 'chairman.webp')).extend({ top: 313, bottom: 313, left: 0, right: 0, background: '#383838' }).webp().toBuffer(),
  director: readFileSync(join(process.cwd(), 'public', 'employee_demo_dps_webp', 'director.webp')),
};
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
const results = {};
let directorId = '';

async function verifyFitted(viewer, expectedName) {
  await viewer.waitFor();
  const result = await viewer.evaluate(element => {
    const stage = element.querySelector('.organization-photo-stage');
    const image = stage.querySelector('img');
    const box = stage.getBoundingClientRect();
    const imageBox = image.getBoundingClientRect();
    const dialogBox = element.getBoundingClientRect();
    return {
      open: element.open,
      name: element.getAttribute('aria-label'),
      natural: [image.naturalWidth, image.naturalHeight],
      stage: [box.width, box.height],
      imageBox: [imageBox.width, imageBox.height],
      gap: [imageBox.left - box.left, imageBox.top - box.top, box.right - imageBox.right, box.bottom - imageBox.bottom],
      modalGap: [dialogBox.left, dialogBox.top, innerWidth - dialogBox.right, innerHeight - dialogBox.bottom],
      objectFit: getComputedStyle(image).objectFit,
      transform: getComputedStyle(image).transform,
      overflow: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight],
    };
  });
  if (!result.open || result.name !== `Photo of ${expectedName}` || result.natural.some(value => !value)) throw new Error(`Viewer failed: ${JSON.stringify(result)}`);
  if (result.objectFit !== 'contain' || result.transform !== 'matrix(1, 0, 0, 1, 0, 0)' || result.gap.some(value => value < 12) || result.modalGap.some(value => value < -1)) throw new Error(`Image not initially fitted: ${JSON.stringify(result)}`);
  if (result.overflow[0] > 1) throw new Error(`Horizontal overflow: ${JSON.stringify(result)}`);
  return result;
}

try {
  await page.goto('/sign-in', { timeout: 90_000, waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin(?:\/|$)/, { timeout: 90_000 });

  await page.route('**/rest/v1/profiles?*', async route => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const body = await response.json().catch(() => null);
    if (!body) return route.fulfill({ response });
    if (body && !Array.isArray(body) && body.role === 'director') {
      directorId = body.id;
      body.avatar_url = 'qa-director.webp';
    }
    await route.fulfill({ response, json: body });
  });
  await page.route('**/rest/v1/rpc/organization_directory', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
    { id: 'qa-chairman', full_name: 'Chairman', designation: 'Chairman', manager_id: null, department_id: null, department_name: 'Executive', avatar_url: 'qa-chairman.webp', status: 'active', can_edit: false },
    { id: 'qa-director', full_name: 'QA Managing Director', designation: 'Director', manager_id: 'qa-chairman', department_id: null, department_name: 'Executive', avatar_url: 'qa-director.webp', status: 'active', can_edit: false },
  ]) }));
  await page.route('**/storage/v1/object/sign/profile-photos/qa-*.webp', route => {
    const name = route.request().url().includes('qa-chairman.webp') ? 'chairman' : 'director';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: `/object/sign/profile-photos/qa-${name}.webp?token=qa-only` }) });
  });
  await page.route('**/storage/v1/object/sign/profile-photos/qa-*.webp?token=qa-only', route => {
    const name = route.request().url().includes('qa-chairman.webp') ? 'chairman' : 'director';
    return route.fulfill({ status: 200, contentType: 'image/webp', body: photos[name] });
  });

  await page.goto('/admin/profile');
  await page.getByRole('region', { name: 'Scrollable organization chart' }).waitFor({ timeout: 30_000 });
  const chairman = page.getByRole('button', { name: 'View photo of Chairman' });
  await chairman.waitFor({ timeout: 30_000 });
  const chart = page.getByRole('region', { name: 'Scrollable organization chart' });
  const chartBefore = await chart.locator('.react-flow__viewport').getAttribute('style');
  await chairman.click();
  let viewer = page.locator('dialog.organization-photo-viewer');
  results.desktopChairman = await verifyFitted(viewer, 'Chairman');
  await viewer.screenshot({ path: join(output, 'desktop-chairman-chart.png') });
  await viewer.getByRole('button', { name: 'Zoom in' }).click();
  if (!await viewer.locator('img').evaluate(node => getComputedStyle(node).transform.includes('1.5'))) throw new Error('Zoom in failed');
  await viewer.getByRole('button', { name: 'Reset' }).click();
  await verifyFitted(viewer, 'Chairman');
  await page.keyboard.press('Escape');
  await viewer.waitFor({ state: 'detached' });
  if (chartBefore !== await chart.locator('.react-flow__viewport').getAttribute('style')) throw new Error('Chart position changed');
  if (!await chairman.evaluate(node => node === document.activeElement)) throw new Error('Chart focus did not return');

  const profilePhoto = page.getByRole('button', { name: /^View photo of QA Director/ });
  await profilePhoto.waitFor({ timeout: 30_000 });
  await profilePhoto.click();
  viewer = page.locator('dialog.organization-photo-viewer');
  results.desktopDirector = await verifyFitted(viewer, 'QA Director');
  await viewer.screenshot({ path: join(output, 'desktop-managing-director-profile.png') });
  await viewer.getByRole('button', { name: 'Close' }).click();
  await viewer.waitFor({ state: 'detached' });
  if (!await profilePhoto.evaluate(node => node === document.activeElement)) throw new Error('Profile focus did not return');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole('region', { name: 'Organization hierarchy list' }).waitFor({ timeout: 30_000 });
  const mobileChairman = page.getByRole('button', { name: 'View photo of Chairman' });
  await mobileChairman.click();
  viewer = page.locator('dialog.organization-photo-viewer');
  results.mobileChairman = await verifyFitted(viewer, 'Chairman');
  await viewer.screenshot({ path: join(output, 'mobile-chairman-chart.png') });
  const bounds = await viewer.locator('.organization-photo-stage').boundingBox();
  const cdp = await context.newCDPSession(page);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centerX - 30, y: centerY, id: 1 }, { x: centerX + 30, y: centerY, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centerX - 70, y: centerY, id: 1 }, { x: centerX + 70, y: centerY, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  results.pinch = await viewer.locator('img').evaluate(node => getComputedStyle(node).transform);
  if (results.pinch === 'matrix(1, 0, 0, 1, 0, 0)') throw new Error('Pinch zoom failed');
  await viewer.getByRole('button', { name: 'Reset' }).click();
  await verifyFitted(viewer, 'Chairman');
  await viewer.getByRole('button', { name: 'Close' }).click();
  await viewer.waitFor({ state: 'detached' });

  const mobileProfile = page.getByRole('button', { name: /^View photo of QA Director/ });
  await mobileProfile.click();
  viewer = page.locator('dialog.organization-photo-viewer');
  results.mobileDirector = await verifyFitted(viewer, 'QA Director');
  await viewer.screenshot({ path: join(output, 'mobile-managing-director-profile.png') });
  await page.keyboard.press('Escape');
  await viewer.waitFor({ state: 'detached' });
  if (!await mobileProfile.evaluate(node => node === document.activeElement)) throw new Error('Mobile profile focus did not return');

  if (!directorId) throw new Error('QA Managing Director profile ID was not observed');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`/admin/employees/${directorId}`);
  const employeeDetailPhoto = page.getByRole('button', { name: 'View photo of QA Director' }).first();
  await employeeDetailPhoto.waitFor({ timeout: 30_000 });
  await employeeDetailPhoto.click();
  viewer = page.locator('dialog.organization-photo-viewer');
  results.employeeDetailDirector = await verifyFitted(viewer, 'QA Director');
  await viewer.screenshot({ path: join(output, 'desktop-managing-director-employee-detail.png') });
  await viewer.getByRole('button', { name: 'Close' }).click();
  await viewer.waitFor({ state: 'detached' });
  if (!await employeeDetailPhoto.evaluate(node => node === document.activeElement)) throw new Error('Employee detail focus did not return');

  writeFileSync(join(output, 'verification.json'), JSON.stringify(results, null, 2));
  console.log('Photo viewer desktop/mobile fit, zoom, pinch, reset, close, Escape, and focus checks passed.');
} finally {
  await context.close();
  await browser.close();
}
