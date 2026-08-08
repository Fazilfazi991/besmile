'use client';

import { FormEvent, useEffect, useState } from 'react';
import { currentProfile } from '@/lib/auth';
import { adminRepository } from '@/lib/admin-repository';
import { FinanceEmpty, inr } from '@/components/finance-ui';
import { payrollLoadError } from '@/lib/payroll-query';
import { isPayrollEligibleEmployeeStatus } from '@/lib/employee-status';

const today = () => new Date().toISOString().slice(0, 10);

export default function SalarySettings() {
  const [settings, setSettings] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>();
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true); setNotice(null);
      const [salarySettings, employees] = await Promise.all([adminRepository.salarySettings(), adminRepository.employees('', 0, 200)]);
      setSettings(salarySettings); setStaff(employees.data.filter((employee: any) => isPayrollEligibleEmployeeStatus(employee.status)));
    } catch { setNotice({ kind: 'error', text: payrollLoadError }); }
    finally { setLoading(false); }
  };

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const profile = await currentProfile() as any;
      await adminRepository.saveSalarySetting({ ...edit, basic_salary: Number(edit.basic_salary || 0), default_allowances: Number(edit.default_allowances || 0), default_deductions: Number(edit.default_deductions || 0), updated_by: profile.id, is_active: edit.is_active !== false });
      setEdit(null); setNotice({ kind: 'success', text: 'Salary setting saved.' }); await load();
    } catch { setNotice({ kind: 'error', text: 'Salary setting could not be saved. Please try again.' }); }
  };

  return <section className="space-y-4">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Salary settings</h1><p className="text-sm text-slate-500">New payroll runs currently include active employees only. Intern and probation payroll eligibility is pending a client decision.</p></div><button disabled={loading || !staff.length} className="btn btn-primary" onClick={() => setEdit({ profile_id: staff[0]?.id || '', basic_salary: 0, default_allowances: 0, default_deductions: 0, effective_date: today(), is_active: true })}>Add setting</button></div>
    {notice && <p className={`rounded border p-3 text-sm ${notice.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-teal-200 bg-teal-50 text-teal-900'}`}>{notice.text}{notice.kind === 'error' && <button className="ml-3 font-semibold underline" onClick={() => void load()}>Retry</button>}</p>}
    <div className="card overflow-x-auto"><table className="min-w-[850px] w-full text-sm"><thead className="bg-slate-50"><tr>{['Employee', 'Department / designation', 'Basic', 'Allowances', 'Deductions', 'Net', 'Effective', 'Status', 'Action'].map(label => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{loading ? <tr><td className="p-5" colSpan={9}>Loading salary settings…</td></tr> : settings.map(setting => <tr className="border-t" key={setting.id}><td className="p-3 font-semibold">{setting.employee?.full_name}<br /><span className="font-normal text-slate-500">{setting.employee?.employee_code || '—'}</span></td><td className="p-3">{setting.employee?.department?.name || '—'}<br />{setting.employee?.designation || '—'}</td><td className="p-3">{inr(setting.basic_salary)}</td><td className="p-3">{inr(setting.default_allowances)}</td><td className="p-3">{inr(setting.default_deductions)}</td><td className="p-3 font-bold">{inr(Number(setting.basic_salary) + Number(setting.default_allowances) - Number(setting.default_deductions))}</td><td className="p-3">{setting.effective_date}</td><td className="p-3">{setting.is_active === false ? 'Inactive' : 'Active'}</td><td className="p-3"><button className="text-teal-700 underline" onClick={() => setEdit({ ...setting })}>Edit</button></td></tr>)}</tbody></table>{!loading && !settings.length && <FinanceEmpty>No salary settings configured.</FinanceEmpty>}</div>
    {edit && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={save} className="card w-full max-w-xl p-5"><div className="mb-4 flex justify-between"><h2 className="text-lg font-bold">Salary setting</h2><button type="button" onClick={() => setEdit(null)}>Close</button></div><div className="grid gap-3 md:grid-cols-2"><label>Employee<select required disabled={!!edit.id} className="input mt-1" value={edit.profile_id} onChange={event => setEdit({ ...edit, profile_id: event.target.value })}><option value="">Select an employee</option>{staff.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name} ({employee.email})</option>)}</select></label><label>Effective date<input required className="input mt-1" type="date" value={edit.effective_date || ''} onChange={event => setEdit({ ...edit, effective_date: event.target.value })} /></label>{[['basic_salary', 'Basic salary'], ['default_allowances', 'Allowances'], ['default_deductions', 'Deductions']].map(([key, label]) => <label key={key}>{label}<input required min="0" step="0.01" className="input mt-1" type="number" value={edit[key]} onChange={event => setEdit({ ...edit, [key]: event.target.value })} /></label>)}<label className="flex items-center gap-2"><input type="checkbox" checked={edit.is_active !== false} onChange={event => setEdit({ ...edit, is_active: event.target.checked })} />Active setting</label></div><div className="mt-5 flex gap-2"><button className="btn btn-primary">Save</button><button type="button" className="btn border" onClick={() => setEdit(null)}>Cancel</button></div></form></div>}
  </section>;
}
