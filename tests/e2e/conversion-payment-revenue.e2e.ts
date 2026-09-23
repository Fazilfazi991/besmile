import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { assertNoRawDatabaseError, credentials, login, navigateAfterLogin } from './helpers';

test('Director records a fully-paid conversion once and leaves no outstanding balance', async ({ page }) => {
  test.setTimeout(90_000);
  if (process.env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe') throw new Error('Conversion browser QA requires the verified QA project');
  const url = process.env.BSMILE_QA_SUPABASE_URL!;
  const anon = process.env.BSMILE_QA_SUPABASE_ANON_KEY!;
  const director = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const fixtureAdmin = createClient(url, process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await director.auth.signInWithPassword(credentials('director'));
  if (auth.error || !auth.data.user) throw auth.error || new Error('Director QA fixture is unavailable');
  const [source, status] = await Promise.all([
    fixtureAdmin.from('crm_lead_sources').select('id').eq('is_active', true).limit(1).single(),
    fixtureAdmin.from('crm_lead_statuses').select('id').eq('is_active', true).order('sort_order').limit(1).single(),
  ]);
  if (source.error || status.error) throw source.error || status.error;
  const marker = `QA_BROWSER_CONVERSION_${crypto.randomUUID()}`;
  const lead = await director.from('crm_leads').insert({ full_name: marker, phone: `QA-${Date.now()}`, source_id: source.data.id, status_id: status.data.id, assigned_to: auth.data.user.id, created_by: auth.data.user.id }).select('id').single();
  if (lead.error) throw lead.error;
  let saleId: string | undefined;
  try {
    await login(page, 'director');
    await navigateAfterLogin(page, `/admin/crm/leads/${lead.data.id}`);
    await expect(page.getByText(marker)).toBeVisible();
    await page.getByLabel('Sale amount *').fill('1000');
    const received = page.getByLabel('Payment received');
    await received.fill('1001');
    expect(await received.evaluate(element => (element as HTMLInputElement).checkValidity())).toBe(false);
    const blockedSale = await fixtureAdmin.from('crm_sales').select('id', { count: 'exact', head: true }).eq('lead_id', lead.data.id);
    expect(blockedSale.count).toBe(0);
    await received.fill('1000');
    await page.getByLabel('Receiving account *').selectOption({ index: 1 });
    await page.getByLabel('Payment method *').selectOption('bank_transfer');
    const convertButton = page.getByRole('button', { name: 'Convert to sale' });
    await convertButton.scrollIntoViewIfNeeded();
    await convertButton.click({ force: true });
    await expect(page.getByText('Lead converted to a sale.')).toBeVisible();
    await assertNoRawDatabaseError(page);

    const sale = await fixtureAdmin.from('crm_sales').select('id,sale_value').eq('lead_id', lead.data.id).single();
    if (sale.error) throw sale.error;
    saleId = sale.data.id;
    const invoice = await fixtureAdmin.from('finance_invoices').select('id,status,finance_invoice_items(quantity,rate),finance_invoice_payments(amount,finance_transaction_id)').eq('sale_id', saleId).single();
    if (invoice.error) throw invoice.error;
    const ledger = await fixtureAdmin.from('finance_transactions').select('id,amount,transaction_type,invoice_id').eq('sale_id', saleId);
    if (ledger.error) throw ledger.error;
    expect(invoice.data.status).toBe('paid');
    expect(invoice.data.finance_invoice_payments).toHaveLength(1);
    expect(ledger.data).toHaveLength(1);
    expect(ledger.data[0]).toMatchObject({ amount: 1000, transaction_type: 'invoice_payment', invoice_id: invoice.data.id });
  } finally {
    if (saleId) {
      await fixtureAdmin.from('finance_invoice_payments').delete().eq('conversion_sale_id', saleId);
      await fixtureAdmin.from('finance_transactions').delete().eq('sale_id', saleId);
      await fixtureAdmin.from('finance_invoices').delete().eq('sale_id', saleId);
      await fixtureAdmin.from('crm_sales').delete().eq('id', saleId);
    }
    await fixtureAdmin.from('crm_leads').delete().eq('id', lead.data.id);
    await director.auth.signOut();
  }
});
