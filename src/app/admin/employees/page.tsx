'use client';

import Link from 'next/link';
import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminRepository } from '@/lib/admin-repository';
import {
  employeeStatuses,
  employeeStatusLabel,
  isFormerEmployeeStatus,
  isOperationalEmployeeStatus,
} from '@/lib/employee-status';

type WorkforceView = 'active' | 'removed' | 'all';
type EmployeeSuggestion = {
  id: string;
  full_name: string;
  email?: string | null;
  employee_code?: string | null;
  designation?: string | null;
  status?: string | null;
  workforce_visible?: boolean | null;
};

const normalizedEmployeeSearch = (value: string) => value.trim().replace(/[%_,]/g, '').slice(0, 80);

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<EmployeeSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [workforceView, setWorkforceView] = useState<WorkforceView>('active');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (value = query) => {
    setLoading(true);
    try {
      const result = await adminRepository.employees(normalizedEmployeeSearch(value), 0, 150, 'all');
      setEmployees(result.data);
      setError('');
    } catch {
      setError('Employees could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(''), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const term = normalizedEmployeeSearch(query);
    if (term.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      setSuggestionsError('');
      try {
        const result = await adminRepository.employees(term, 0, workforceView === 'removed' ? 30 : 8, workforceView === 'active' ? 'current' : 'all');
        if (cancelled) return;
        const candidates = result.data as EmployeeSuggestion[];
        const matches = workforceView === 'removed'
          ? candidates.filter((employee) => isFormerEmployeeStatus(employee.status) || employee.workforce_visible === false).slice(0, 8)
          : candidates.slice(0, 8);
        setSuggestions(matches);
        setActiveSuggestion(matches.length ? 0 : -1);
        setSuggestionsOpen(true);
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setActiveSuggestion(-1);
          setSuggestionsError('Employee suggestions are temporarily unavailable.');
          setSuggestionsOpen(true);
        }
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, workforceView]);

  const chooseSuggestion = (employee: EmployeeSuggestion) => {
    setQuery(employee.full_name);
    setSuggestionsOpen(false);
    router.push(`/admin/employees/${employee.id}`);
  };

  const employeeSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setSuggestionsOpen(false);
      return;
    }
    if (!suggestionsOpen || !suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestion((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestion((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && activeSuggestion >= 0) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestion]);
    }
  };

  const departments = [...new Set(employees.map((employee) => employee.department?.name).filter(Boolean))];
  const roles = [...new Set(employees.map((employee) => employee.role).filter(Boolean))];
  const shown = useMemo(
    () => employees.filter((employee) => {
      const inWorkforceView = workforceView === 'all'
        || (workforceView === 'active'
          ? !isFormerEmployeeStatus(employee.status) && employee.workforce_visible !== false
          : isFormerEmployeeStatus(employee.status) || employee.workforce_visible === false);
      return inWorkforceView
        && (!role || employee.role === role)
        && (!status || employee.status === status)
        && (!department || employee.department?.name === department);
    }),
    [employees, role, status, workforceView, department],
  );
  const operational = employees.filter((employee) => isOperationalEmployeeStatus(employee.status) && employee.workforce_visible !== false).length;
  const former = employees.filter((employee) => isFormerEmployeeStatus(employee.status)).length;

  return (
    <section className="mx-auto max-w-[1320px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">People</p>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="mt-1 text-sm text-slate-600">Manage employee profiles, status, access, and work activity.</p>
        </div>
        <Link className="btn btn-primary" href="/admin/employees/new">Add employee</Link>
      </div>
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Total employees" value={String(employees.length)} hint="Visible in your current scope" />
        <Metric label="Operational workforce" value={String(operational)} hint="Active, intern, and probation" />
        <Metric label="Former / inactive" value={String(former)} hint="Inactive, resigned, and terminated" />
      </div>
      <div className="card grid gap-2 p-3 md:grid-cols-[150px_minmax(220px,1fr)_150px_150px_170px_auto]">
        <select className="input" aria-label="Workforce view" value={workforceView} onChange={(event) => setWorkforceView(event.target.value as WorkforceView)}>
          <option value="active">Active</option>
          <option value="removed">Removed / inactive</option>
          <option value="all">All</option>
        </select>
        <div
          className="employee-search-picker"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSuggestionsOpen(false);
          }}
        >
          <input
            className="input"
            role="combobox"
            aria-label="Search employees"
            aria-autocomplete="list"
            aria-expanded={suggestionsOpen}
            aria-controls="employee-search-suggestions"
            aria-activedescendant={activeSuggestion >= 0 ? `employee-search-suggestion-${suggestions[activeSuggestion]?.id}` : undefined}
            autoComplete="off"
            placeholder="Search name, email, phone, or employee ID"
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              setSuggestions([]);
              setActiveSuggestion(-1);
              setSuggestionsError('');
              setSuggestionsOpen(normalizedEmployeeSearch(value).length >= 2);
            }}
            onFocus={() => {
              if (normalizedEmployeeSearch(query).length >= 2) setSuggestionsOpen(true);
            }}
            onKeyDown={employeeSearchKeyDown}
          />
          {suggestionsOpen && (
            <div id="employee-search-suggestions" className="employee-search-suggestions" role="listbox" aria-label="Matching employees">
              {suggestionsLoading ? (
                <p role="status">Searching employees…</p>
              ) : suggestionsError ? (
                <p role="status">{suggestionsError}</p>
              ) : suggestions.length ? suggestions.map((employee, index) => (
                <button
                  id={`employee-search-suggestion-${employee.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeSuggestion}
                  className={index === activeSuggestion ? 'is-active' : ''}
                  key={employee.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveSuggestion(index)}
                  onClick={() => chooseSuggestion(employee)}
                >
                  <span>{employee.full_name}</span>
                  <small>{[employee.designation, employee.employee_code, employee.email].filter(Boolean).join(' · ') || employeeStatusLabel(employee.status)}</small>
                </button>
              )) : (
                <p role="status">No matching employees.</p>
              )}
            </div>
          )}
        </div>
        <select className="input" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="">All roles</option>
          {roles.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select className="input" value={department} onChange={(event) => setDepartment(event.target.value)}>
          <option value="">All departments</option>
          {departments.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          {employeeStatuses.map((value) => <option value={value} key={value}>{employeeStatusLabel(value)}</option>)}
        </select>
        <button className="btn border" onClick={() => void load()}>Search</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{['Employee', 'Employee ID', 'Role', 'Department', 'Designation', 'Joined', 'Status', 'Action'].map((label) => <th className="px-4 py-3 text-left" key={label}>{label}</th>)}</tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, index) => <tr className="border-t" key={index}><td colSpan={8} className="px-4 py-5"><div className="h-4 animate-pulse rounded bg-slate-100" /></td></tr>)
              : shown.map((employee) => (
                <tr className="border-t border-slate-100" key={employee.id}>
                  <td className="px-4 py-3"><b>{employee.full_name}</b><small className="block text-slate-500">{employee.email}</small></td>
                  <td className="px-4 py-3">{employee.employee_code || '—'}</td>
                  <td className="px-4 py-3 capitalize">{employee.role}</td>
                  <td className="px-4 py-3">{employee.department?.name || '—'}</td>
                  <td className="px-4 py-3">{employee.designation || '—'}</td>
                  <td className="px-4 py-3">{employee.joining_date || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={employee.status} />
                    {employee.removed_at && <small className="mt-1 block text-slate-500">Removed {new Date(employee.removed_at).toLocaleDateString()}{employee.remover?.full_name ? ` by ${employee.remover.full_name}` : ''}</small>}
                  </td>
                  <td className="px-4 py-3"><Link className="font-semibold text-teal-700 hover:underline" href={`/admin/employees/${employee.id}`}>Open profile</Link></td>
                </tr>
              ))}
          </tbody>
        </table>
        {!loading && !shown.length && <p className="p-8 text-center text-sm text-slate-500">No employees match this directory view.</p>}
      </div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="card p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>;
}

function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-800',
    intern: 'bg-sky-50 text-sky-800',
    probation: 'bg-violet-50 text-violet-800',
    on_leave: 'bg-amber-50 text-amber-800',
    inactive: 'bg-slate-100 text-slate-700',
    resigned: 'bg-orange-50 text-orange-800',
    terminated: 'bg-rose-50 text-rose-800',
  };
  return <span className={`rounded-full px-2 py-1 text-xs font-bold ${tone[status] || 'bg-slate-100 text-slate-700'}`}>{employeeStatusLabel(status)}</span>;
}
