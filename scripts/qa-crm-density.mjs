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
await mkdir('qa-screenshots/crm-density', { recursive: true });

async function signedInPage(viewport) {
  const page = await browser.newPage({ viewport });
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'bsmile.gm@gmail.com', options: { redirectTo: 'http://localhost:3000/admin/crm/leads' } });
  if (link.error || !link.data.properties?.action_link) throw link.error || new Error('QA sign-in link was not generated.');
  await page.goto(link.data.properties.action_link, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const auth = new URLSearchParams(new URL(page.url()).hash.slice(1));
  const cookies = [];
  const sessionClient = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [], setAll: values => cookies.push(...values) } });
  const session = await sessionClient.auth.setSession({ access_token: auth.get('access_token'), refresh_token: auth.get('refresh_token') });
  if (session.error) throw session.error;
  await page.context().addCookies(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: 'localhost', path: '/' })));
  await page.goto('http://localhost:3000/admin/crm/leads', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('.data-table-shell').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.module-skeleton-row').first().waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
  return page;
}

for (const [name, viewport] of Object.entries(viewports)) {
  const page = await signedInPage(viewport);
  const tabs = page.getByRole('tab');
  const tabCount = await tabs.count();
  for (let index = 0; index < tabCount; index += 1) await tabs.nth(index).click();
  await tabs.first().click();
  const desktopRows = page.locator('.crm-leads-table tbody tr:not(.module-skeleton-row)');
  const mobileRows = page.locator('.crm-mobile-records article');
  const activeRows = viewport.width <= 640 ? mobileRows : desktopRows;
  const recordCount = await activeRows.count();
  if (!recordCount) throw new Error(`${name}: no lead rows were rendered.`);
  const privateSearch = await activeRows.first().locator('[data-private]').first().innerText();
  await page.getByRole('searchbox', { name: 'Search leads' }).fill(privateSearch.split('\n')[0]);
  if (await activeRows.count() < 1) throw new Error(`${name}: search did not return the matching lead.`);
  await page.getByRole('searchbox', { name: 'Search leads' }).fill('not-a-real-lead-qa-value');
  await page.locator(viewport.width <= 640 ? '.crm-mobile-records .compact-empty-state' : '.crm-leads-table .compact-empty-state').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Reset' }).click();
  for (const label of ['Lead source', 'Assigned employee', 'Follow-up state']) {
    const select = page.getByRole('combobox', { name: label });
    if (await select.locator('option').count() > 1) { await select.selectOption({ index: 1 }); await page.getByRole('button', { name: 'Reset' }).click(); }
  }
  await page.getByText('More filters', { exact: true }).click();
  const dateVisible = await page.getByText('Created from', { exact: true }).isVisible();
  await page.getByText('More filters', { exact: true }).click();
  const next = page.getByRole('button', { name: 'Next' });
  const paginationWorks = await next.isEnabled();
  if (paginationWorks) { await next.click(); await page.getByRole('button', { name: 'Previous' }).click(); }
  await page.getByRole('combobox', { name: 'Rows' }).selectOption('20');
  await page.getByRole('combobox', { name: 'Rows' }).selectOption('10');
  await page.getByRole('button', { name: 'Add lead' }).click();
  const createFormVisible = await page.getByRole('heading', { name: 'Add lead' }).isVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  const firstHref = await activeRows.first().getByRole('link', { name: /Open/ }).getAttribute('href');
  if (!firstHref?.startsWith('/admin/crm/leads/')) throw new Error(`${name}: lead detail link is invalid.`);
  results[name] = await page.evaluate(() => {
    const rect = selector => { const node = document.querySelector(selector); if (!node) return null; const value = node.getBoundingClientRect(); return { top: Math.round(value.top), bottom: Math.round(value.bottom), height: Math.round(value.height) }; };
    const desktop = innerWidth > 640;
    const rows = [...document.querySelectorAll(desktop ? '.crm-leads-table tbody tr:not(.module-skeleton-row)' : '.crm-mobile-records article')];
    return { viewport: { width: innerWidth, height: innerHeight }, documentHeight: document.documentElement.scrollHeight, list: rect('.data-table-shell'), pagination: rect('.module-pagination'), renderedRecords: rows.length, fullyVisibleRecords: rows.filter(row => row.getBoundingClientRect().bottom <= innerHeight).length, paginationVisible: Boolean(document.querySelector('.module-pagination') && document.querySelector('.module-pagination').getBoundingClientRect().top < innerHeight), horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, scrollWidth: document.documentElement.scrollWidth, nestedScroll: [...document.querySelectorAll('*')].some(node => { const style = getComputedStyle(node); return node.scrollHeight > node.clientHeight + 1 && ['auto', 'scroll'].includes(style.overflowY); }) };
  });
  results[name].functional = { realStageTabs: tabCount - 1, paginationWorks, dateFiltersVisible: dateVisible, createFormVisible, detailLink: true };
  await page.evaluate(() => {
    document.querySelectorAll('[data-private]').forEach((node, index) => { node.textContent = `QA Lead ${String(index + 1).padStart(2, '0')}`; });
    document.querySelectorAll('.topbar-user b,.topbar-user small,.sidebar-footer b,.sidebar-footer p').forEach(node => { node.textContent = 'QA Manager'; });
  });
  await page.screenshot({ path: `qa-screenshots/crm-density/${name}.png`, fullPage: false });
  if (name === 'laptop') {
    await page.goto(`http://localhost:3000${firstHref}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByRole('heading', { name: 'Lead details' }).waitFor({ state: 'visible', timeout: 30000 });
    results[name].functional.detailWorkspace = {
      edit: await page.getByRole('button', { name: 'Save lead' }).isVisible(),
      assignment: await page.getByText('Assigned employee', { exact: true }).isVisible().catch(() => false),
      followups: await page.getByRole('heading', { name: 'Follow-ups' }).isVisible(),
      conversion: await page.getByRole('heading', { name: 'Sale conversion' }).isVisible(),
      archive: await page.getByRole('button', { name: 'Archive lead' }).isVisible(),
    };
  }
  await page.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
