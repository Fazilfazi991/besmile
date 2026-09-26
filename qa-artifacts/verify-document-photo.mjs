import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const baseURL = process.env.BSMILE_QA_BASE_URL;
const email = process.env.BSMILE_QA_DIRECTOR_EMAIL;
const password = process.env.BSMILE_QA_DIRECTOR_PASSWORD;
if (!baseURL || !email || !password) throw new Error('QA URL and Director credentials are required');
const output = join(process.cwd(), 'qa-artifacts', 'client-followup-screenshots');
const browser = await chromium.launch();
const results = {};
try {
  const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  await page.goto('/sign-in', { timeout: 90000 });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin(?:\/|$)/, { timeout: 90000 });

  await page.goto('/admin/profile');
  const chart = page.getByRole('region', { name: 'Scrollable organization chart' });
  await chart.waitFor({ timeout: 30000 });
  let triggers = page.getByRole('button', { name: /^View photo of / });
  let photoSource = 'authorized QA profile photo';
  if (!await triggers.count()) {
    photoSource = 'test-only signed photo response';
    await page.route('**/rest/v1/rpc/organization_directory', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        id: '00000000-0000-4000-8000-000000000001', full_name: 'QA Photo Person',
        designation: 'Chairman', manager_id: null, department_id: null,
        department_name: 'Executive', avatar_url: 'qa-photo.webp', status: 'active', can_edit: false,
      }]) });
    });
    await page.route('**/storage/v1/object/sign/profile-photos/qa-photo.webp', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: '/object/sign/profile-photos/qa-photo.webp?token=qa-only' }) });
    });
    await page.route('**/storage/v1/object/sign/profile-photos/qa-photo.webp?token=qa-only', async route => {
      const response = await page.request.get('/employee_demo_dps_webp/director.webp');
      await route.fulfill({ status: 200, contentType: 'image/webp', body: await response.body() });
    });
    await page.getByRole('button', { name: 'Refresh chart' }).click();
    triggers = page.getByRole('button', { name: /^View photo of / });
  }
  await triggers.first().waitFor({ timeout: 30000 });
  const trigger = triggers.first();
  const viewportBefore = await chart.locator('.react-flow__viewport').getAttribute('style');
  const scrollBefore = await chart.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }));
  await trigger.click();
  const viewer = page.locator('dialog.organization-photo-viewer');
  await viewer.waitFor();
  if (!await viewer.evaluate(node => node.open)) throw new Error('Photo viewer did not open');
  await viewer.getByRole('button', { name: 'Zoom in' }).click();
  const zoomed = await viewer.locator('img').evaluate(node => getComputedStyle(node).transform);
  if (!zoomed.includes('1.5')) throw new Error(`Photo viewer did not zoom: ${zoomed}`);
  await viewer.screenshot({ path: join(output, 'desktop-photo-preview.png') });
  await page.keyboard.press('Escape');
  await viewer.waitFor({ state: 'detached' });
  const viewportAfter = await chart.locator('.react-flow__viewport').getAttribute('style');
  const scrollAfter = await chart.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }));
  if (viewportBefore !== viewportAfter || JSON.stringify(scrollBefore) !== JSON.stringify(scrollAfter)) throw new Error('Chart position changed after closing photo');
  if (!await trigger.evaluate(node => node === document.activeElement)) throw new Error('Focus did not return to photo');
  results.photo = { photoSource, zoomed, chartPositionPreserved: true, escapeClosed: true, focusReturned: true };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/profile');
  const list = page.getByRole('region', { name: 'Organization hierarchy list' });
  await list.waitFor({ timeout: 30000 });
  const mobileTrigger = page.getByRole('button', { name: /^View photo of / }).first();
  await mobileTrigger.waitFor({ timeout: 30000 });
  await mobileTrigger.click();
  const mobileViewer = page.locator('dialog.organization-photo-viewer');
  await mobileViewer.waitFor();
  const stage = mobileViewer.locator('.organization-photo-stage');
  const bounds = await stage.boundingBox();
  if (!bounds) throw new Error('Mobile photo stage is unavailable');
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centerX - 30, y: centerY, id: 1 }, { x: centerX + 30, y: centerY, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centerX - 70, y: centerY, id: 1 }, { x: centerX + 70, y: centerY, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const pinchTransform = await mobileViewer.locator('img').evaluate(node => getComputedStyle(node).transform);
  if (pinchTransform === 'none' || pinchTransform.includes('matrix(1,')) throw new Error(`Mobile pinch did not zoom: ${pinchTransform}`);
  await mobileViewer.screenshot({ path: join(output, 'mobile-photo-preview.png') });
  await mobileViewer.getByRole('button', { name: 'Close' }).click();
  await mobileViewer.waitFor({ state: 'detached' });
  results.photo.mobileClose = true;
  results.photo.mobilePinchZoomed = pinchTransform;

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/admin/documents/generate');
  await page.getByRole('heading', { name: 'Official Document Generator' }).waitFor({ timeout: 30000 });
  const documentType = page.getByLabel('Document type');
  const options = await documentType.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
  const choice = options.includes('experience_letter') ? 'experience_letter' : options.find(value => value !== 'offer_letter');
  if (!choice) throw new Error('No non-offer document type available for preview');
  await documentType.selectOption(choice);
  await page.getByLabel('Document title').fill('QA signatory title preview');
  await page.getByLabel('Official content').fill('Test-only official document preview.');
  const signatoryTitle = page.getByLabel('Signatory title');
  const signatoryName = page.getByLabel('Authorized signatory');
  results.document = { type: choice, initialTitle: await signatoryTitle.inputValue(), signatoryName: await signatoryName.inputValue() };
  if (results.document.initialTitle !== 'Managing Director') throw new Error(`Director title was not normalized: ${results.document.initialTitle}`);
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/documents/official/generate') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Preview PDF' }).click();
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`PDF preview failed: ${response.status()} ${await response.text()}`);
  const payload = response.request().postDataJSON();
  if (payload.mode !== 'preview' || payload.signatoryTitle !== 'Managing Director') throw new Error('Incorrect preview payload');
  const directPreview = await context.request.post('/api/documents/official/generate', { data: payload });
  if (!directPreview.ok()) throw new Error(`Direct PDF preview failed: ${directPreview.status()} ${await directPreview.text()}`);
  const pdf = await directPreview.body();
  if (pdf.length < 1000 || pdf.subarray(0, 4).toString() !== '%PDF') throw new Error(`Invalid PDF response: ${pdf.length} bytes`);
  writeFileSync(join(output, 'test-only-official-document-preview.pdf'), pdf);
  await page.locator('iframe[title="Official document PDF preview"]').waitFor();
  await page.screenshot({ path: join(output, 'desktop-document-preview.png'), fullPage: true });
  results.document.previewStatus = response.status();
  results.document.pages = response.headers()['x-document-pages'];
  writeFileSync(join(output, 'document-photo-verification.json'), JSON.stringify(results, null, 2));
  await context.close();
} finally { await browser.close(); }
