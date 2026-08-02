'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createEmployee, type CreateEmployeeState } from './actions';

const initial: CreateEmployeeState = {};
const roles = [
  ['staff', 'Staff'],
  ['psychologist', 'Psychologist'],
  ['social_worker', 'Social Worker'],
  ['intern', 'Intern'],
  ['guest_sales', 'Guest Sales'],
  ['general_manager', 'General Manager'],
  ['director', 'Director'],
  ['chairman', 'Chairman'],
];

export function EmployeeCreateForm({
  departments,
  managers,
}: {
  departments: { id: string; name: string }[];
  managers: { id: string; full_name: string; role: string }[];
}) {
  const [state, action, pending] = useActionState(createEmployee, initial);

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
        <Link className="btn border" href="/admin/employees">
          Back to employees
        </Link>
      </div>

      {state.error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{state.success}</p>
      )}

      <form action={action} className="card grid gap-4 p-5 md:grid-cols-2">
        <Field label="Full name" required>
          <input name="full_name" className="input" required />
        </Field>
        <Field label="Work email" required>
          <input name="email" type="email" className="input" required />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" className="input" />
        </Field>
        <Field label="Employee code" required>
          <input name="employee_code" className="input" required />
        </Field>
        <Field label="Department" required>
          <select name="department_id" className="input" required defaultValue="">
            <option value="" disabled>
              Select department
            </option>
            {departments.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Designation" required>
          <input name="designation" className="input" required />
        </Field>
        <Field label="Role" required>
          <select name="role" className="input" defaultValue="staff">
            {roles.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reporting manager">
          <select name="manager_id" className="input" defaultValue="">
            <option value="">No manager assigned</option>
            {managers.map((item) => (
              <option value={item.id} key={item.id}>
                {item.full_name} ({item.role.replace('_', ' ')})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Joining date">
          <input name="joining_date" type="date" className="input" />
        </Field>
        <Field label="Employment type">
          <input name="employment_type" className="input" placeholder="Full-time, contract, intern..." />
        </Field>
        <Field label="Status">
          <select name="status" className="input" defaultValue="active">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <div className="flex items-end">
          <button className="btn btn-primary w-full" disabled={pending}>
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
