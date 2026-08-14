import { NextResponse } from 'next/server';
import { generateOfficialReport } from '@/lib/official-document-engine';
import { serverSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
const inr = (value: unknown) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(value || 0));

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const permission = await Promise.all(['payroll.view', 'payroll.manage'].map(permission_code => db.rpc('has_permission', { permission_code })));
  if (!permission.some(result => result.data === true)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  const { data: run, error } = await db.from('payroll_runs').select('*,payroll_entries(*,profile:profiles(full_name,employee_code))').eq('id', id).maybeSingle();
  if (error || !run) return NextResponse.json({ error: 'Payroll run not found.' }, { status: 404 });
  if (run.status === 'draft') return NextResponse.json({ error: 'Finalize payroll before generating the official report.' }, { status: 409 });
  const entries = run.payroll_entries || [];
  const rows = entries.map((entry: any) => ({ employee: `${entry.profile?.full_name || 'Employee'}\n${entry.profile?.employee_code || '—'}`, gross: inr(entry.gross_earnings), deductions: inr(Number(entry.deductions) + Number(entry.other_deductions)), net: inr(entry.net_payable), payment: entry.payment_status }));
  const gross = entries.reduce((sum: number, entry: any) => sum + Number(entry.gross_earnings), 0);
  const deductions = entries.reduce((sum: number, entry: any) => sum + Number(entry.deductions) + Number(entry.other_deductions), 0);
  const net = entries.reduce((sum: number, entry: any) => sum + Number(entry.net_payable), 0);
  const { buffer, pageCount } = await generateOfficialReport({ heading: 'PAYROLL REPORT', filename: `BSmile_PAYROLL_REPORT_${run.period_start}.pdf`, columns: [{ key: 'employee', label: 'Employee', weight: 1.8 }, { key: 'gross', label: 'Gross', align: 'right' }, { key: 'deductions', label: 'Deductions', align: 'right' }, { key: 'net', label: 'Net', align: 'right' }, { key: 'payment', label: 'Payment' }], rows, period: `Period: ${run.period_start} - ${run.period_end}`, filters: [`Status: ${run.status}`], totals: [{ label: 'Gross payroll', value: inr(gross) }, { label: 'Deductions', value: inr(deductions) }, { label: 'Net payroll', value: inr(net) }] });
  await db.rpc('record_official_report_generation', { report_type: 'payroll', report_context: { payroll_run_id: id, period_start: run.period_start, period_end: run.period_end }, generated_pages: pageCount, generated_rows: rows.length });
  return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="BSmile_PAYROLL_REPORT_${run.period_start}.pdf"`, 'Cache-Control': 'private, no-store, max-age=0' } });
}
