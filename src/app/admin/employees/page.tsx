'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminRepository } from '@/lib/admin-repository';
import { EmployeeBanner, EmployeeEmptyState, EmployeeLoading, EmployeePageHeader, EmployeeSection, EmployeeStatusBadge } from '@/components/employee-ui';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async (value = query) => { setLoading(true); try { const result = await adminRepository.employees(value, 0, 100); setEmployees(result.data); setError(''); } catch (caught: any) { setError(caught.message || 'Unable to load employees.'); } finally { setLoading(false); } };
  useEffect(() => { const timer = setTimeout(() => void load(''), 0); return () => clearTimeout(timer); }, []);
  return <section className="space-y-4"><EmployeePageHeader title="Employees" subtitle="View the active employee directory and open individual records." action={<div className="flex gap-2"><input className="input w-52" placeholder="Search name or email" value={query} onChange={event => setQuery(event.target.value)} /><button className="btn border" onClick={() => void load()}>Search</button></div>} />{error && <EmployeeBanner>{error}</EmployeeBanner>}{loading ? <EmployeeLoading cards={3} /> : <EmployeeSection title="Employee directory" description={`${employees.length} matching employees.`}><div className="divide-y divide-slate-100">{employees.map(employee => <article className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" key={employee.id}><div><b>{employee.full_name}</b><p className="mt-1 text-sm text-slate-600">{employee.email} · {employee.designation || 'Employee'}</p></div><div className="flex items-center gap-3"><EmployeeStatusBadge tone={employee.status === 'active' ? 'success' : 'danger'}>{employee.status}</EmployeeStatusBadge><Link className="btn border" href={`/admin/employees/${employee.id}`}>View</Link></div></article>)}{!employees.length && <EmployeeEmptyState title="No employees found" detail="Try a different employee name or work email." />}</div></EmployeeSection>}</section>;
}
