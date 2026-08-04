import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const form = readFileSync(new URL('../app/admin/employees/new/form.tsx', import.meta.url), 'utf8');
const action = readFileSync(new URL('../app/admin/employees/new/actions.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/admin/employees/new/page.tsx', import.meta.url), 'utf8');
const errorBoundary = readFileSync(new URL('../app/admin/employees/new/error.tsx', import.meta.url), 'utf8');
const browserSupabase = readFileSync(new URL('./supabase.ts', import.meta.url), 'utf8');

describe('employee create validation', () => {
  it('requires designation in the browser and on the server action', () => {
    expect(form).toContain('<Field label="Designation" required>');
    expect(form).toContain('<input name="designation" className="input" required defaultValue=');
    expect(action).toContain('const designation = String(form.get');
    expect(action).toContain('department, designation, and a valid operational role are required.');
  });

  it('normalizes joining dates before employee invitation/profile creation', () => {
    expect(action).toContain("import { normalizeDateOnly } from '@/lib/employee-edit-rules'");
    expect(action).toContain('normalizeDateOnly(rawJoiningDate)');
    expect(action.indexOf('normalizeDateOnly(rawJoiningDate)')).toBeLessThan(action.indexOf('inviteUserByEmail(email)'));
    expect(action).toContain('Joining date must be a valid calendar date.');
  });

  it('loads the add employee form safely when reference lists are empty or fail', () => {
    expect(page).toContain('referenceErrors');
    expect(page).toContain('departments.error');
    expect(page).toContain('managers.error');
    expect(page).toContain('departments.data');
    expect(form).toContain('Array.isArray(departments)');
    expect(form).toContain('Array.isArray(managers)');
    expect(form).toContain('No departments are available.');
    expect(form).toContain('Employee reference data did not load.');
    expect(form).toContain('window.location.reload()');
  });

  it('preserves form values after recoverable employee creation failures and blocks duplicate submits', () => {
    expect(action).toContain('fields?: Record<string, string>');
    expect(action).toContain("return { error: 'Enter a valid work email address.', fields }");
    expect(action).toContain("return { error: 'An employee with that email address or employee code already exists.', fields }");
    expect(form).toContain('const cannotSubmit = pending');
    expect(form).toContain('disabled={cannotSubmit}');
    expect(form).toContain("defaultValue={values.full_name || ''}");
    expect(form).toContain("defaultValue={values.email || ''}");
  });

  it('adds a route error boundary for client-side failures on add employee', () => {
    expect(errorBoundary).toContain("'use client'");
    expect(errorBoundary).toContain('Add employee could not load');
    expect(errorBoundary).toContain('onClick={reset}');
    expect(errorBoundary).toContain('Back to Employees');
    expect(errorBoundary).toContain('console.error');
  });

  it('does not instantiate the browser Supabase client with a masked or invalid URL during prerender', () => {
    expect(browserSupabase).toContain('hasValidSupabaseUrl');
    expect(browserSupabase).toContain('new URL(value');
    expect(browserSupabase).toContain('hasValidSupabaseUrl(url) && key');
  });
});
