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
  const { data: entry, error } = await db.from('payroll_entries').select('*,profile:profiles(full_name,employee_code,designation,department:departments(name)),payroll_run:payroll_runs(period_start,period_end,status)').eq('id', id).maybeSingle();
  if (error || !entry) return NextResponse.json({ error: 'Payslip not found.' }, { status: 404 });
  if (!['approved', 'paid'].includes(entry.payment_status)) return NextResponse.json({ error: 'Payslip is available only after payroll is finalized.' }, { status: 409 });
  const rows = [
    ['Basic salary', entry.basic_salary], ['Allowances', entry.allowances], ['Bonus', entry.bonus], ['Incentives', entry.incentives], ['Other earnings', entry.other_earnings],
    ['Deductions', entry.deductions], ['Other deductions', entry.other_deductions],
  ].filter(([, value]) => Number(value) !== 0).map(([component, amount]) => ({ component: String(component), amount: inr(amount) }));
  const { buffer } = await generateOfficialReport({
    heading: 'SALARY SLIP', filename: `BSmile_SALARY_SLIP_${entry.profile?.employee_code || 'employee'}_${entry.payroll_run?.period_start}.pdf`,
    columns: [{ key: 'component', label: 'Salary component', weight: 2 }, { key: 'amount', label: 'Amount', align: 'right' }], rows,
    period: `Pay period: ${entry.payroll_run?.period_start} - ${entry.payroll_run?.period_end}`,
    filters: [`Employee: ${entry.profile?.full_name || 'Employee'}`, `Employee code: ${entry.profile?.employee_code || '—'}`, `Payment status: ${entry.payment_status}`, `Payment date: ${entry.payment_date || 'Pending'}`],
    totals: [{ label: 'Gross earnings', value: inr(entry.gross_earnings) }, { label: 'Net payable', value: inr(entry.net_payable) }],
  });
  const audit = await db.rpc('record_payroll_payslip_access', { target_entry: id });
  if (audit.error) return NextResponse.json({ error: 'Payslip access could not be verified.' }, { status: 403 });
  return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="BSmile_SALARY_SLIP_${entry.profile?.employee_code || 'employee'}_${entry.payroll_run?.period_start}.pdf"`, 'Cache-Control': 'private, no-store, max-age=0' } });
}
