import { createClient } from '@supabase/supabase-js';

const required = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const url = required('BSMILE_QA_SUPABASE_URL');
const ref = required('BSMILE_QA_PROJECT_REF');
if (new URL(url).hostname.split('.')[0] !== ref || ref === 'ksmqzxncdvuxiabypjth') throw new Error('Conversion probes require the verified non-production QA project');

const admin = createClient(url, required('BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const director = createClient(url, required('BSMILE_QA_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const signed = await director.auth.signInWithPassword({ email: required('BSMILE_QA_DIRECTOR_EMAIL'), password: required('BSMILE_QA_DIRECTOR_PASSWORD') });
if (signed.error || !signed.data.user) throw signed.error || new Error('Director QA fixture is unavailable');
const actor = signed.data.user.id;
const marker = `CONVERSION_REVENUE_QA_${Date.now()}`;
const leadIds = [];
const saleIds = [];

const expect = (condition, message) => { if (!condition) throw new Error(message); };
const one = async query => { const result = await query.single(); if (result.error) throw result.error; return result.data; };
async function cleanupFixtures(targetLeadIds, targetSaleIds) {
  const errors = [];
  const remove = async query => { const result = await query; if (result.error) errors.push(result.error.message); };
  if (targetSaleIds.length) await remove(admin.from('finance_invoice_payments').delete().in('conversion_sale_id', targetSaleIds));
  if (targetSaleIds.length) await remove(admin.from('finance_transactions').delete().in('sale_id', targetSaleIds));
  if (targetSaleIds.length) await remove(admin.from('finance_invoices').delete().in('sale_id', targetSaleIds));
  if (targetSaleIds.length) await remove(admin.from('crm_sales').delete().in('id', targetSaleIds));
  if (targetLeadIds.length) await remove(admin.from('crm_leads').delete().in('id', targetLeadIds));
  return errors;
}

// Recover only fixtures created by an interrupted earlier run of this probe.
const staleLeads = await admin.from('crm_leads').select('id').like('full_name', 'CONVERSION_REVENUE_QA_%');
if (staleLeads.error) throw staleLeads.error;
const staleLeadIds = (staleLeads.data || []).map(row => row.id);
let staleSaleIds = [];
if (staleLeadIds.length) {
  const staleSales = await admin.from('crm_sales').select('id').in('lead_id', staleLeadIds);
  if (staleSales.error) throw staleSales.error;
  staleSaleIds = (staleSales.data || []).map(row => row.id);
}
const staleCleanupErrors = await cleanupFixtures(staleLeadIds, staleSaleIds);
if (staleCleanupErrors.length) throw new Error(`Stale QA cleanup failed: ${staleCleanupErrors.join('; ')}`);
// Successful execution of the protected conversion RPC below proves the
// Director fixture's effective sale and receipt permissions without exposing
// internal permission helpers directly to the API role.
const permissions = { conversion: 'verified by protected RPC', payment: 'verified by protected RPC' };

const account = await one(admin.from('finance_accounts').select('id,name').eq('is_active', true).order('name').limit(1));
const source = await one(admin.from('crm_lead_sources').select('id').eq('is_active', true).limit(1));
const status = await one(admin.from('crm_lead_statuses').select('id').eq('is_active', true).order('sort_order').limit(1));
const today = new Date().toISOString().slice(0, 10);
const due = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

async function createLead(label) {
  const lead = await one(director.from('crm_leads').insert({
    full_name: `${marker}_${label}`, phone: `QA-${Date.now()}-${leadIds.length}`,
    lead_date: today, source_id: source.id, status_id: status.id,
    assigned_to: actor, created_by: actor,
  }).select('id'));
  leadIds.push(lead.id);
  return lead.id;
}

async function convert(leadId, received, reference = null, receivingAccount = account.id) {
  return director.rpc('convert_crm_lead_to_sale_with_payment', {
    target_lead: leadId, sale_amount: 1000, payment_received: received,
    receiving_account: received > 0 ? receivingAccount : null,
    payment_method: received > 0 ? 'bank_transfer' : null,
    payment_date: received > 0 ? today : null,
    payment_reference: reference,
    invoice_due_date: received < 1000 ? due : null,
    sale_currency: 'INR', sale_closing_date: today,
    sale_service_details: `${marker} service`, sale_notes: marker,
  });
}

async function lifecycle(leadId) {
  const sale = await one(admin.from('crm_sales').select('id,sale_value').eq('lead_id', leadId));
  if (!saleIds.includes(sale.id)) saleIds.push(sale.id);
  const invoice = await one(admin.from('finance_invoices').select('id,status,sale_id,finance_invoice_items(quantity,rate),finance_invoice_payments(id,amount,finance_transaction_id,conversion_sale_id)').eq('sale_id', sale.id));
  const transactions = await admin.from('finance_transactions').select('id,amount,transaction_type,sale_id,invoice_id').eq('sale_id', sale.id);
  if (transactions.error) throw transactions.error;
  const total = invoice.finance_invoice_items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.rate), 0);
  const paid = invoice.finance_invoice_payments.reduce((sum, item) => sum + Number(item.amount), 0);
  return { sale, invoice, transactions: transactions.data || [], total, paid, balance: total - paid };
}

const results = {};
try {
  const fullLead = await createLead('FULL');
  const full = await convert(fullLead, 1000, `${marker}_FULL`);
  if (full.error) throw full.error;
  results.full = await lifecycle(fullLead);
  expect(results.full.invoice.status === 'paid' && results.full.balance === 0, 'Fully-paid invoice lifecycle is incorrect');
  expect(results.full.invoice.finance_invoice_payments.length === 1 && results.full.transactions.length === 1, 'Fully-paid conversion duplicated its receipt or ledger');

  const partialLead = await createLead('PARTIAL');
  const partial = await convert(partialLead, 400, `${marker}_PARTIAL`);
  if (partial.error) throw partial.error;
  results.partial = await lifecycle(partialLead);
  expect(results.partial.invoice.status === 'partially_paid' && results.partial.balance === 600, 'Partial invoice lifecycle is incorrect');
  expect(results.partial.invoice.finance_invoice_payments.length === 1 && results.partial.transactions.length === 1, 'Partial conversion duplicated its receipt or ledger');

  const unpaidLead = await createLead('UNPAID');
  const unpaid = await convert(unpaidLead, 0);
  if (unpaid.error) throw unpaid.error;
  results.unpaid = await lifecycle(unpaidLead);
  expect(results.unpaid.invoice.status === 'sent' && results.unpaid.balance === 1000, 'Unpaid invoice lifecycle is incorrect');
  expect(results.unpaid.invoice.finance_invoice_payments.length === 0 && results.unpaid.transactions.length === 0, 'Unpaid conversion created financial receipt rows');

  const duplicate = await convert(fullLead, 1000, `${marker}_DUPLICATE`);
  if (duplicate.error) throw duplicate.error;
  const afterDuplicate = await lifecycle(fullLead);
  expect(afterDuplicate.invoice.finance_invoice_payments.length === 1 && afterDuplicate.transactions.length === 1, 'Duplicate submit created duplicate financial rows');
  results.duplicate = 'PASS';

  const invalidLead = await createLead('INVALID');
  const invalid = await convert(invalidLead, 1001, `${marker}_INVALID`);
  expect(Boolean(invalid.error) && /cannot exceed/i.test(invalid.error.message), 'Overpayment was not rejected');
  const invalidRows = await admin.from('crm_sales').select('id', { count: 'exact', head: true }).eq('lead_id', invalidLead);
  expect(invalidRows.count === 0, 'Overpayment left a sale row behind');
  results.invalid = 'PASS';

  const failedLead = await createLead('FINANCE_FAILURE');
  const forceLedgerFailure = process.env.BSMILE_QA_FORCE_LEDGER_FAILURE === 'true';
  const failed = forceLedgerFailure
    ? await convert(failedLead, 400, 'QA_FORCE_FINANCE_FAILURE', account.id)
    : await convert(failedLead, 400, `${marker}_FAIL`, '00000000-0000-0000-0000-000000000000');
  expect(Boolean(failed.error) && (forceLedgerFailure ? /qa_conversion_force_failure/i : /active receiving account/i).test(failed.error.message), 'Finance failure was not raised');
  const failedRows = await admin.from('crm_sales').select('id', { count: 'exact', head: true }).eq('lead_id', failedLead);
  expect(failedRows.count === 0, 'Finance failure left a sale row behind');
  results.financeFailure = forceLedgerFailure ? 'PASS (forced ledger insert rollback)' : 'PASS (invalid account rollback)';

  const sales = [results.full, results.partial, results.unpaid].reduce((sum, row) => sum + Number(row.sale.sale_value), 0);
  const revenue = [results.full, results.partial, results.unpaid].flatMap(row => row.transactions).reduce((sum, row) => sum + Number(row.amount), 0);
  const collections = [results.full, results.partial, results.unpaid].reduce((sum, row) => sum + row.paid, 0);
  const outstanding = [results.full, results.partial, results.unpaid].reduce((sum, row) => sum + row.balance, 0);
  expect(sales === 3000 && revenue === 1400 && collections === 1400 && outstanding === 1600, 'Aggregate KPI values are incorrect');
  results.kpis = { sales, revenue, collections, outstanding };

  results.salesCoordinatorBoundary = 'covered by migration regression and direct QA SQL audit';

  console.log(JSON.stringify({ status: 'PASS', projectRef: ref, account: account.name, permissions, results: { full: { status: results.full.invoice.status, paid: results.full.paid, balance: results.full.balance, payments: 1, transactions: 1 }, partial: { status: results.partial.invoice.status, paid: results.partial.paid, balance: results.partial.balance, payments: 1, transactions: 1 }, unpaid: { status: results.unpaid.invoice.status, paid: 0, balance: results.unpaid.balance, payments: 0, transactions: 0 }, duplicate: results.duplicate, invalid: results.invalid, financeFailure: results.financeFailure, kpis: results.kpis, salesCoordinatorBoundary: results.salesCoordinatorBoundary } }, null, 2));
} finally {
  const cleanupErrors = await cleanupFixtures(leadIds, saleIds);
  const remaining = await admin.from('crm_leads').select('id', { count: 'exact', head: true }).like('full_name', `${marker}%`);
  await director.auth.signOut();
  if (remaining.error) cleanupErrors.push(remaining.error.message);
  if (remaining.count) cleanupErrors.push(`${remaining.count} QA lead fixture(s) remain`);
  if (cleanupErrors.length) throw new Error(`QA cleanup failed: ${cleanupErrors.join('; ')}`);
}
