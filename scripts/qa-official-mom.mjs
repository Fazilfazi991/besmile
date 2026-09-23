// Non-production only. Uses existing role fixtures; creates and removes only
// this run's disposable MOM records/files. Run against the local built app.
import { chromium, expect } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { mkdirSync, writeFileSync } from 'node:fs';
import PDFDocument from 'pdfkit';

const env = process.env;
const url = env.BSMILE_QA_SUPABASE_URL;
const ref = new URL(url).hostname.split('.')[0];
if (ref !== env.BSMILE_QA_PROJECT_REF || ref === 'ksmqzxncdvuxiabypjth') throw Error('Verified non-production QA project required');
const baseURL = env.BSMILE_QA_BASE_URL;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseURL || '')) throw Error('Local application URL required');
mkdirSync('release-evidence/mom', { recursive: true });
const results = [];
const accounts = new Map();
async function account(role) {
  if (accounts.has(role)) return accounts.get(role);
  const cookies = new Map();
  const db = createServerClient(url, env.BSMILE_QA_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...cookies.values()], setAll: items => items.forEach(item => cookies.set(item.name, item)) },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
  });
  const { data, error } = await db.auth.signInWithPassword({ email: env[`BSMILE_QA_${role}_EMAIL`], password: env[`BSMILE_QA_${role}_PASSWORD`] });
  if (error) throw Error(`${role} login failed: ${error.message}`);
  const result = { db, uid: data.user.id, cookies };
  accounts.set(role, result); return result;
}
const browser = await chromium.launch();
let admin;
const cleanup = [];
const check = async (name, fn) => {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
};
const pdf = await new Promise(resolve => {
  const document = new PDFDocument(); const chunks = [];
  document.on('data', chunk => chunks.push(chunk)); document.on('end', () => resolve(Buffer.concat(chunks)));
  document.text('Disposable QA Minutes of Meeting'); document.end();
});
try {
  admin = await account('ADMIN');
  for (const role of ['DIRECTOR', 'GENERAL_MANAGER', 'ASSISTANT_MANAGER', 'ADMIN']) {
    await check(`${role}: real upload, history, persistence, signed view/download and security`, async () => {
      const actor = await account(role);
      const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 } });
      try {
        await context.addCookies([...actor.cookies.values()].map(({ name, value }) => ({ name, value, url: baseURL, sameSite: 'Lax' })));
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.goto(role === 'ASSISTANT_MANAGER' ? '/employee/documents/generate' : '/admin/documents/generate');
        await page.getByRole('button', { name: 'Upload Document', exact: true }).click();
        const form = page.locator('#official-mom-upload');
        await expect(form.getByLabel('Document type')).toHaveValue('minutes_of_meeting');
        for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
          await page.setViewportSize(viewport);
          for (const mode of ['standard', 'colorful']) {
            // Apply the existing persisted preference; mobile hides the topbar
            // theme controls, which are unrelated to this upload flow.
            await page.evaluate(value => { localStorage.setItem('bsmile-theme-mode', value); window.dispatchEvent(new Event('bsmile-theme-change')); }, mode);
            await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
            await form.scrollIntoViewIfNeeded();
            const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
              controls: [...document.querySelectorAll('#official-mom-upload input, #official-mom-upload select, #official-mom-upload button')].map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; }) }));
            expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
            expect(layout.controls.every(r => r.left >= 0 && r.right <= layout.width + 1)).toBe(true);
            await expect(form.getByRole('button', { name: 'Upload MOM', exact: true })).toBeVisible();
            await page.screenshot({ path: `release-evidence/mom/${role}-${viewport.width}-${mode}.png`, fullPage: true });
          }
        }
        const title = `QA_MOM_${role}_${Date.now()}`;
        await form.getByLabel('Title', { exact: true }).fill(title);
        const fileBytes = role === 'ADMIN' ? Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024 - pdf.length, 32)]) : pdf;
        await form.getByLabel('File', { exact: true }).setInputFiles({ name: 'minutes.pdf', mimeType: 'application/pdf', buffer: fileBytes });
        const savedResponse = page.waitForResponse(response => response.url().endsWith('/api/documents/official/upload') && response.request().method() === 'POST');
        await form.getByRole('button', { name: 'Upload MOM', exact: true }).click();
        const saved = await savedResponse;
        expect(saved.status(), await saved.text()).toBe(201);
        const documentId = (await saved.json()).id;
        const metadata = await actor.db.from('documents').select('*').eq('id', documentId).single();
        if (metadata.error) throw metadata.error;
        const record = metadata.data;
        cleanup.push({ actor, id: documentId, path: record.storage_path });
        expect(record.uploaded_by).toBe(actor.uid);
        expect(record.source_type).toBe('uploaded');
        expect(record.document_type).toBe('minutes_of_meeting');
        const collision = await actor.db.storage.from('employee-documents').upload(record.storage_path, pdf, { contentType: 'application/pdf', upsert: false });
        expect(collision.error).toBeTruthy();
        await expect(page.getByRole('button').filter({ hasText: title })).toBeVisible();
        await page.reload();
        const historyItem = page.getByRole('button').filter({ hasText: title });
        await expect(historyItem).toBeVisible();
        const popupPromise = page.waitForEvent('popup');
        const signedResponse = page.waitForResponse(response => response.url().includes('/storage/v1/object/sign/employee-documents/') && response.request().method() === 'POST');
        await historyItem.click();
        const popup = await popupPromise;
        // The native PDF viewer uses an internal URL in this headless Chromium.
        // Verify the UI's actual signing response and the served bytes instead.
        const signed = await signedResponse;
        expect(signed.ok()).toBe(true);
        const signedPath = (await signed.json()).signedURL;
        expect(Boolean(signedPath?.startsWith('/object/sign/employee-documents/'))).toBe(true);
        expect(popup.isClosed()).toBe(false);
        const fileResponse = await context.request.get(`${url}/storage/v1${signedPath}`);
        expect(fileResponse.ok()).toBe(true);
        expect(Buffer.compare(await fileResponse.body(), fileBytes)).toBe(0);
        await popup.close();
        const denied = await account('EMPLOYEE');
        expect((await denied.db.from('documents').select('id').eq('id', documentId)).data).toEqual([]);
        expect((await denied.db.storage.from('employee-documents').download(record.storage_path)).error).toBeTruthy();
        if (role === 'ASSISTANT_MANAGER') {
          for (const permission_code of ['documents.manage', 'documents.employee.manage', 'documents.administration.manage']) {
            expect((await actor.db.rpc('has_permission', { permission_code })).data).toBe(false);
          }
          expect((await actor.db.from('documents').delete().eq('id', documentId).select('id')).data).toEqual([]);
          expect((await actor.db.storage.from('employee-documents').remove([record.storage_path])).data).toEqual([]);
          const generalUpload = await actor.db.storage.from('employee-documents').upload(`company/${actor.uid}/${crypto.randomUUID()}-denied.pdf`, pdf, { contentType: 'application/pdf' });
          expect(generalUpload.error).toBeTruthy();
          const forged = await actor.db.from('documents').insert({ title: 'QA denied attribution', document_type: 'minutes_of_meeting', category: 'Official:Minutes of Meeting (MOM)', source_type: 'uploaded', uploaded_by: denied.uid,
            storage_path: `company/${actor.uid}/mom/${crypto.randomUUID()}-minutes.pdf`, file_name: 'minutes.pdf', mime_type: 'application/pdf', file_size: pdf.length });
          expect(forged.error).toBeTruthy();
        }
        if (role === 'ADMIN') {
          for (const documentType of ['offer_letter', 'appointment_letter', 'experience_letter', 'general_report', 'sales_report', 'custom_official_document']) {
            const generated = await context.request.post('/api/documents/official/generate', { data: { mode: 'preview', documentType, title: 'QA generated regression', customHeading: 'QA Custom Heading', issueDate: '2026-09-23', body: 'Disposable regression content.', relatedName: 'QA Candidate', position: 'QA role', joiningDate: '2026-10-01' } });
            expect(generated.status(), await generated.text()).toBe(200);
            expect((await generated.body()).subarray(0, 5).toString()).toBe('%PDF-');
          }
        }
        expect(pageErrors).toEqual([]);
      } finally { await context.close(); }
    });
  }
  await check('ordinary employee: route, direct finalize, direct MOM Storage upload blocked', async () => {
    const actor = await account('EMPLOYEE');
    const context = await browser.newContext({ baseURL });
    try {
      await context.addCookies([...actor.cookies.values()].map(({ name, value }) => ({ name, value, url: baseURL, sameSite: 'Lax' })));
      const page = await context.newPage();
      await page.goto('/employee/documents/generate');
      await expect(page.getByRole('button', { name: 'Upload Document', exact: true })).toHaveCount(0);
      const response = await context.request.post('/api/documents/official/upload', { data: { documentType: 'minutes_of_meeting', title: 'denied', storagePath: `company/${actor.uid}/mom/${crypto.randomUUID()}-denied.pdf` } });
      expect(response.status()).toBe(403);
      expect((await actor.db.storage.from('employee-documents').upload(`company/${actor.uid}/mom/${crypto.randomUUID()}-denied.pdf`, pdf, { contentType: 'application/pdf' })).error).toBeTruthy();
    } finally { await context.close(); }
  });
} finally {
  for (const item of cleanup) await check(`cleanup ${item.id}`, async () => {
    const removed = await admin.db.from('documents').delete().eq('id', item.id).select('id');
    if (removed.error || removed.data.length !== 1) throw Error('QA metadata cleanup failed');
    const files = await item.actor.db.storage.from('employee-documents').remove([item.path]);
    if (files.error || files.data.length !== 1) throw Error('QA Storage cleanup failed');
    // A recently downloaded object can remain in the HTTP cache; verify the
    // authoritative object listing instead of re-reading cached bytes.
    const slash = item.path.lastIndexOf('/');
    const remaining = await admin.db.storage.from('employee-documents').list(item.path.slice(0, slash), { search: item.path.slice(slash + 1) });
    if (remaining.error) throw remaining.error;
    expect(remaining.data).toEqual([]);
  });
  await browser.close();
  writeFileSync('release-evidence/mom/results.json', JSON.stringify({ qaProject: ref, results }, null, 2));
}
if (results.some(result => result.status !== 'PASS')) process.exitCode = 1;
