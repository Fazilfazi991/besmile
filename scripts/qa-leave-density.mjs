import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')]; }));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const viewports = { laptop: { width: 1366, height: 768 }, desktop: { width: 1440, height: 900 }, standard: { width: 1536, height: 864 }, wide: { width: 1920, height: 1080 }, mobileSmall: { width: 375, height: 812 }, mobile: { width: 390, height: 844 }, mobileWide: { width: 430, height: 932 } };
const results = {};
await mkdir('qa-screenshots/leave-density', { recursive: true });

async function signedInPage(viewport) {
  const page = await browser.newPage({ viewport });
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'bsmile.gm@gmail.com', options: { redirectTo: 'http://localhost:3000/admin/leaves' } });
  if (link.error || !link.data.properties?.action_link) throw link.error || new Error('QA sign-in link was not generated.');
  await page.goto(link.data.properties.action_link, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const auth = new URLSearchParams(new URL(page.url()).hash.slice(1));
  const cookies = [];
  const sessionClient = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [], setAll: values => cookies.push(...values) } });
  const session = await sessionClient.auth.setSession({ access_token: auth.get('access_token'), refresh_token: auth.get('refresh_token') });
  if (session.error) throw session.error;
  await page.context().addCookies(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: 'localhost', path: '/' })));
  await page.goto('http://localhost:3000/admin/leaves', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('.data-table-shell').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.module-skeleton-row').first().waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
  await page.getByRole('tab', { name: /^All/ }).click();
  return page;
}

for (const [name, viewport] of Object.entries(viewports)) {
  const page = await signedInPage(viewport);
  const desktopRows = page.locator('.module-table tbody tr:not(.module-skeleton-row)');
  const mobileRows = page.locator('.module-mobile-records article');
  const activeRows = viewport.width <= 640 ? mobileRows : desktopRows;
  const recordCount = await activeRows.count();
  const firstPrivateValue = recordCount ? await activeRows.first().locator('[data-private]').first().innerText() : '';
  if (recordCount && firstPrivateValue) {
    await page.getByRole('searchbox', { name: 'Search leave requests' }).fill(firstPrivateValue.split('\n')[0]);
    const searchCount = await activeRows.count();
    if (searchCount < 1) throw new Error(`${name}: search did not return the matching record.`);
    await page.getByRole('searchbox', { name: 'Search leave requests' }).fill('');
  }
  const typeSelect = page.getByRole('combobox', { name: 'Leave type' });
  const typeOptions = await typeSelect.locator('option').count();
  if (typeOptions > 1) { await typeSelect.selectOption({ index: 1 }); await typeSelect.selectOption(''); }
  const next = page.getByRole('button', { name: 'Next' });
  const nextEnabled = await next.isEnabled();
  if (nextEnabled) { await next.click(); await page.getByRole('button', { name: 'Previous' }).click(); }
  let drawer = { opened: false, approveVisible: false, rejectVisible: false };
  if (recordCount) {
    await activeRows.first().getByRole('button', { name: /View/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Leave request' });
    await dialog.waitFor({ state: 'visible' });
    drawer = { opened: true, approveVisible: await dialog.getByRole('button', { name: 'Approve' }).isVisible().catch(() => false), rejectVisible: await dialog.getByRole('button', { name: 'Reject' }).isVisible().catch(() => false) };
    await dialog.getByRole('button', { name: 'Close leave request details' }).click();
  }
  results[name] = await page.evaluate(() => {
    const rect = selector => { const node = document.querySelector(selector); if (!node) return null; const value = node.getBoundingClientRect(); return { top: Math.round(value.top), bottom: Math.round(value.bottom), height: Math.round(value.height) }; };
    const desktop = innerWidth > 640;
    const rows = [...document.querySelectorAll(desktop ? '.module-table tbody tr:not(.module-skeleton-row)' : '.module-mobile-records article')];
    return { viewport: { width: innerWidth, height: innerHeight }, documentHeight: document.documentElement.scrollHeight, table: rect('.data-table-shell'), pagination: rect('.module-pagination'), renderedRows: rows.length, fullyVisibleRows: rows.filter(row => row.getBoundingClientRect().bottom <= innerHeight).length, paginationVisible: Boolean(document.querySelector('.module-pagination') && document.querySelector('.module-pagination').getBoundingClientRect().top < innerHeight), horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, scrollWidth: document.documentElement.scrollWidth };
  });
  results[name].drawer = drawer;
  await page.evaluate(() => {
    document.querySelectorAll('[data-private]').forEach((node, index) => { node.textContent = `QA Employee ${String(index + 1).padStart(2, '0')}`; });
    document.querySelectorAll('.topbar-user div,.sidebar-footer>div').forEach(node => { node.textContent = 'QA Manager'; });
  });
  await page.screenshot({ path: `qa-screenshots/leave-density/${name}.png`, fullPage: false });
  await page.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
