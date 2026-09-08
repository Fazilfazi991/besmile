import { describe, expect, it, vi } from 'vitest'; import { clientSafeError, normalizeClientError } from './client-error';
describe('client-safe database errors', () => {
  it.each(['new row violates row-level security policy', "Could not find 'x' in the schema cache", 'duplicate key violates constraint tasks_pkey', 'PGRST200 PostgREST relationship error'])('replaces technical error: %s', message => expect(normalizeClientError(new Error(message), 'Action could not be completed.')).toBe('Action could not be completed.'));
  it('preserves actionable validation', () => expect(normalizeClientError(new Error('Task title is required.'), 'Failed')).toBe('Task title is required.'));
  it('logs only sanitized metadata', () => { const spy = vi.spyOn(console, 'error').mockImplementation(() => {}); clientSafeError(Object.assign(new Error('secret row-level security detail'), { code: '42501' }), 'Failed', { route: '/admin/tasks', action: 'create', role: 'general_manager' }); expect(spy).toHaveBeenCalledWith('[client-runtime-error]', expect.objectContaining({ code: '42501', category: 'database' })); expect(JSON.stringify(spy.mock.calls)).not.toContain('secret'); spy.mockRestore(); });
});
