import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')]; }));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const viewports = { laptop: { width: 1366, height: 768 }, desktop: { width: 1440, height: 900 }, standard: { width: 1536, height: 864 }, wide: { width: 1920, height: 1080 }, mobile: { width: 390, height: 844 } };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = {};
const employeeOnly = process.argv.includes('--employee-only');
await mkdir('qa-screenshots/dashboard-density', { recursive: true });

if (!employeeOnly) {
for (const [name, viewport] of Object.entries(viewports)) {
  const page = await browser.newPage({ viewport });
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'bsmile.gm@gmail.com', options: { redirectTo: 'http://localhost:3000/admin' } });
  if (link.error || !link.data.properties?.action_link) throw link.error || new Error('QA sign-in link was not generated.');
  await page.goto(link.data.properties.action_link, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const auth = new URLSearchParams(new URL(page.url()).hash.slice(1));
  const cookies = [];
  const sessionClient = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [], setAll: values => cookies.push(...values) } });
  const session = await sessionClient.auth.setSession({ access_token: auth.get('access_token'), refresh_token: auth.get('refresh_token') });
  if (session.error) throw session.error;
  await page.context().addCookies(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: 'localhost', path: '/' })));
  await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForURL(/\/admin/, { timeout: 30000 });
  await page.locator('.executive-kpis-primary').waitFor({ state: 'visible', timeout: 30000 });
  results[name] = await page.evaluate(() => {
    const rect = selector => { const node = document.querySelector(selector); if (!node) return null; const value = node.getBoundingClientRect(); return { x: Math.round(value.x), y: Math.round(value.y), width: Math.round(value.width), height: Math.round(value.height), bottom: Math.round(value.bottom) }; };
    const visible = selector => [...document.querySelectorAll(selector)].filter(node => { const value = node.getBoundingClientRect(); return value.width > 0 && value.height > 0; });
    const root = document.documentElement;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      sidebar: rect('.app-shell>.app-sidebar'),
      header: rect('.executive-header'),
      kpiGrid: rect('.executive-kpis-primary'),
      kpiHeights: visible('.executive-kpis-primary .executive-kpi').map(node => Math.round(node.getBoundingClientRect().height)),
      attention: rect('.standard-needs-attention'),
      primaryPanels: rect('.executive-grid-primary'),
      moreInsights: rect('.dashboard-more-insights'),
      moreInsightsOpen: document.querySelector('.dashboard-more-insights')?.open || false,
      aboveFoldPrimaryPanels: visible('.executive-grid-primary').some(node => node.getBoundingClientRect().top < innerHeight && node.getBoundingClientRect().bottom <= innerHeight + 24),
      horizontalOverflow: root.scrollWidth > innerWidth + 1,
      scrollWidth: root.scrollWidth,
      pageHeight: root.scrollHeight,
    };
  });
  if (viewport.width > 900) {
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    results[name].collapsedSidebarWidth = await page.locator('.app-shell>.app-sidebar').evaluate(node => Math.round(node.getBoundingClientRect().width));
    await page.getByRole('button', { name: 'Expand navigation' }).click();
  }
  await page.screenshot({ path: `qa-screenshots/dashboard-density/${name}.png`, fullPage: false });
  await page.screenshot({ path: `qa-screenshots/dashboard-density/${name}-full.png`, fullPage: true });
  await page.close();
}
}

const employeeChecks = {};
const profiles = await admin.from('profiles').select('id,role,status').eq('status', 'active');
const authUsers = await admin.auth.admin.listUsers({ perPage: 1000 });
if (profiles.error || authUsers.error) throw profiles.error || authUsers.error;
const managementRoles = new Set(['super_admin', 'chairman', 'director', 'general_manager', 'admin']);
const employeeProfile = profiles.data.find(profile => !managementRoles.has(String(profile.role || '').toLowerCase()) && authUsers.data.users.some(user => user.id === profile.id && user.email));
const employeeEmail = authUsers.data.users.find(user => user.id === employeeProfile?.id)?.email;
if (!employeeEmail) throw new Error('No active employee QA profile is available.');
for (const [name, viewport, route] of [['desktop-home', viewports.desktop, '/employee/dashboard'], ['desktop-list', viewports.desktop, '/employee/tasks'], ['mobile-home', viewports.mobile, '/employee/dashboard']]) {
  const page = await browser.newPage({ viewport });
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: employeeEmail, options: { redirectTo: `http://localhost:3000${route}` } });
  if (link.error || !link.data.properties?.action_link) throw link.error || new Error('Employee QA sign-in link was not generated.');
  await page.goto(link.data.properties.action_link, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const auth = new URLSearchParams(new URL(page.url()).hash.slice(1));
  const cookies = [];
  const sessionClient = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [], setAll: values => cookies.push(...values) } });
  const session = await sessionClient.auth.setSession({ access_token: auth.get('access_token'), refresh_token: auth.get('refresh_token') });
  if (session.error) throw session.error;
  await page.context().addCookies(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: 'localhost', path: '/' })));
  await page.goto(`http://localhost:3000${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });
  employeeChecks[name] = await page.evaluate(() => ({ path: location.pathname, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, sidebarWidth: Math.round(document.querySelector('.app-shell>.app-sidebar')?.getBoundingClientRect().width || 0), mainVisible: Boolean(document.querySelector('main')) }));
  await page.screenshot({ path: `qa-screenshots/dashboard-density/employee-${name}.png`, fullPage: false });
  await page.close();
}

console.log(JSON.stringify({ dashboard: results, employeeChecks }, null, 2));
await browser.close();
