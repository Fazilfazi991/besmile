'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { clinicianRpc } from '@/lib/clinician-repository';
import { employeeEditPayload } from '@/lib/employee-edit-rules';
export function EmployeeIdentityEditor({ employeeId }: { employeeId?: string }) {
  const [rows, setRows] = useState<any[]>(); const [form, setForm] = useState<Record<string, any>>({});
  const [options, setOptions] = useState<any>({ departments: [], managers: [] }); const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [directory, allowed] = await Promise.all([clinicianRpc<any[]>('employee_identity_directory'), clinicianRpc<boolean>('has_permission', { permission_code: 'employees.identity.edit' })]);
    setRows(directory); setCanEdit(allowed);
    if (employeeId) { const employee = directory.find(row => row.id === employeeId); if (!employee) throw new Error('Employee not found or access denied.');
      setForm(Object.fromEntries(['full_name', 'phone', 'gender', 'employee_code', 'department_id', 'designation', 'manager_id', 'joining_date', 'employment_type'].map(key => [key, employee[key] || ''])));
      if (allowed) setOptions(await clinicianRpc('employee_identity_options'));
    }
  }, [employeeId]);
  useEffect(() => { const timer = setTimeout(() => void load().catch(caught => setError(caught.message)), 0); return () => clearTimeout(timer); }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await clinicianRpc('edit_employee_identity', { target_profile: employeeId, patch: employeeEditPayload(form) }); await load(); setNotice('Employee identity updated.'); }
    catch (caught: any) { setError(caught.message || 'Unable to update employee identity.'); } finally { setBusy(false); }
  }
  return <section className="space-y-5"><h1 className="text-2xl font-bold">{employeeId ? 'Employee identity' : 'Employees'}</h1>{error && <p role="alert" className="rounded border border-rose-300 p-3">{error}</p>}{notice && <p role="status">{notice}</p>}{!rows && !error && <p>Loading employees…</p>}{!employeeId && rows?.map(row => <article className="card p-4" key={row.id}><Link className="font-semibold underline" href={`/admin/employees/${row.id}`}>{row.full_name}</Link><p>{row.employee_code || 'Employee Code not set'} · {row.designation}</p></article>)}
    {employeeId && rows && <form onSubmit={save} className="card grid gap-4 p-5 md:grid-cols-2">
      {['full_name', 'phone', 'employee_code', 'designation', 'joining_date', 'employment_type'].map(key => <label className="text-sm font-medium" key={key}>{({ full_name: 'Full name', employee_code: 'Employee Code', joining_date: 'Joining date', employment_type: 'Employment type', phone: 'Phone', designation: 'Designation' } as any)[key]}<input className="input mt-1" type={key === 'joining_date' ? 'date' : 'text'} required={key === 'full_name'} disabled={!canEdit || busy} value={form[key] || ''} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
      <label>Gender<select className="input mt-1" disabled={!canEdit || busy} value={form.gender || ''} onChange={event => setForm({ ...form, gender: event.target.value })}><option value="">Not provided</option><option value="male">Male</option><option value="female">Female</option></select></label>
      <label>Department<select className="input mt-1" disabled={!canEdit || busy} value={form.department_id || ''} onChange={event => setForm({ ...form, department_id: event.target.value })}><option value="">No department</option>{options.departments.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Reporting manager<select className="input mt-1" disabled={!canEdit || busy} value={form.manager_id || ''} onChange={event => setForm({ ...form, manager_id: event.target.value })}><option value="">No reporting manager</option>{options.managers.filter((row: any) => row.id !== employeeId).map((row: any) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>
      {canEdit && <div className="md:col-span-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save employee identity'}</button></div>}
    </form>}
  </section>;
}
