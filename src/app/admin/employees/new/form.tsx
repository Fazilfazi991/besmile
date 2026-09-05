'use client';

import Link from 'next/link';
import { useActionState, useMemo } from 'react';
import { createEmployee, type CreateEmployeeState } from './actions';
import { genderOptions } from '@/lib/gender';
import { employeeStatuses, employeeStatusLabel } from '@/lib/employee-status';

const initial: CreateEmployeeState = {};
type DepartmentOption = { id: string; name: string };
type ManagerOption = { id: string; full_name: string; role: string | null };
const roles = [
  ['staff', 'Staff'],
  ['psychologist', 'Psychologist'],
  ['intern', 'Intern'],
  ['guest_sales', 'Guest Sales'],
];
const protectedRoles = [
  ['general_manager', 'General Manager'],
  ['director', 'Director'],
  ['chairman', 'Chairman'],
];

export function EmployeeCreateForm({
  departments,
  managers,
  referenceError,
  canCreateProtectedRoles = false,
}: {
  departments?: DepartmentOption[] | null;
  managers?: ManagerOption[] | null;
  referenceError?: string;
  canCreateProtectedRoles?: boolean;
}) {
  const [state, action, pending] = useActionState(createEmployee, initial);
  const departmentOptions = useMemo(() => Array.isArray(departments) ? departments.filter((item) => item?.id && item?.name) : [], [departments]);
  const managerOptions = useMemo(() => Array.isArray(managers) ? managers.filter((item) => item?.id && item?.full_name) : [], [managers]);
  const values = state.fields || {};
  const roleOptions = canCreateProtectedRoles ? [...roles, ...protectedRoles] : roles;
  const cannotSubmit = pending || !!referenceError || departmentOptions.length === 0;

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">People</p>
          <h1 className="text-2xl font-bold">Add employee</h1>
          <p className="mt-1 text-sm text-slate-600">
            Creates an employee profile and sends a secure password-setup invitation.
          </p>
        </div>
      </div>

      {state.error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">{state.error}</p>
      )}
      {referenceError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Employee reference data did not load.</b>
          <p className="mt-1">{referenceError}</p>
          <button className="mt-2 font-bold text-amber-950 underline" type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}
      {!referenceError && departmentOptions.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <b>No departments are available.</b>
          <p className="mt-1">Create at least one department before adding an employee.</p>
          <Link className="mt-2 inline-block font-bold text-amber-950 underline" href="/admin/access">
            Open access settings
          </Link>
        </div>
      )}
      {state.success && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{state.success}</p>
      )}

      <form action={action} className="card grid gap-4 p-5 md:grid-cols-2">
        <Field label="Full name" required>
          <input name="full_name" className="input" required defaultValue={values.full_name || ''} />
        </Field>
        <Field label="Work email" required>
          <input name="email" type="email" className="input" required defaultValue={values.email || ''} />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" className="input" defaultValue={values.phone || ''} />
        </Field>
        <Field label="Gender" required>
          <select name="gender" className="input" required defaultValue={values.gender || ''}>
            <option value="" disabled>Select gender</option>
            {genderOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Employee code" required>
          <input name="employee_code" className="input" required defaultValue={values.employee_code || ''} />
        </Field>
        <Field label="Department" required>
          <select name="department_id" className="input" required defaultValue={values.department_id || ''} disabled={!!referenceError || departmentOptions.length === 0}>
            <option value="" disabled={departmentOptions.length > 0}>
              {departmentOptions.length ? 'Select department' : 'No departments available'}
            </option>
            {departmentOptions.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Designation" required>
          <input name="designation" className="input" required defaultValue={values.designation || ''} />
        </Field>
        <Field label="Role" required>
          <select name="role" className="input" defaultValue={values.role || 'staff'}>
            {roleOptions.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reporting manager">
          <select name="manager_id" className="input" defaultValue={values.manager_id || ''} disabled={!!referenceError}>
            <option value="">No manager assigned</option>
            {managerOptions.map((item) => (
              <option value={item.id} key={item.id}>
                {item.full_name} ({String(item.role || 'management').replaceAll('_', ' ')})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Joining date">
          <input name="joining_date" type="date" className="input" defaultValue={values.joining_date || ''} />
        </Field>
        <Field label="Employment type">
          <input name="employment_type" className="input" placeholder="Full-time, contract, intern..." defaultValue={values.employment_type || ''} />
        </Field>
        <Field label="Status">
          <select name="status" className="input" defaultValue={values.status || 'active'}>
            {employeeStatuses.map((status) => <option value={status} key={status}>{employeeStatusLabel(status)}</option>)}
          </select>
        </Field>
        <div className="flex items-end">
          <button className="btn btn-primary w-full" disabled={cannotSubmit}>
            {pending ? 'Creating employee...' : 'Create employee and send invitation'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="text-sm font-medium">
      {label}
      {required && <span className="text-rose-600"> *</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
