import { afterEach, describe, expect, it, vi } from 'vitest';
const assertions = vi.hoisted(() => ({ url: vi.fn(), shell: vi.fn() }));
vi.mock('@playwright/test', () => ({ expect: () => ({ toHaveURL: assertions.url, toBeVisible: assertions.shell }) }));
import { login } from '../../tests/e2e/helpers';

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

function fixture() {
  vi.stubEnv('BSMILE_QA_EMPLOYEE_EMAIL', 'fixture@example.invalid');
  vi.stubEnv('BSMILE_QA_EMPLOYEE_PASSWORD', 'test-only');
  return {
    goto: vi.fn(), getByLabel: vi.fn(() => ({ fill: vi.fn() })),
    getByRole: vi.fn(() => ({ click: vi.fn() })), locator: vi.fn(),
    waitForLoadState: vi.fn(), waitForTimeout: vi.fn(),
  };
}

describe('release browser login readiness', () => {
  it('waits for the landing document before checking the authenticated shell', async () => {
    const page = fixture();
    let finishLoad!: () => void;
    page.waitForLoadState.mockImplementation(() => new Promise<void>(resolve => { finishLoad = resolve; }));
    let finished = false;
    const result = login(page as never, 'employee').then(() => { finished = true; });
    await vi.waitFor(() => expect(page.waitForLoadState).toHaveBeenCalled());
    expect(finished).toBe(false);
    expect(assertions.shell).not.toHaveBeenCalled();
    finishLoad();
    await result;
    expect(page.waitForLoadState).toHaveBeenCalledWith('load', { timeout: 30_000 });
    expect(page.locator).toHaveBeenCalledWith('.app-shell');
    expect(assertions.shell).toHaveBeenCalled();
  });

  it('accepts workspace URLs, not sign-in or unauthorized landing pages', async () => {
    await login(fixture() as never, 'employee');
    const pattern = assertions.url.mock.calls[0][0] as RegExp;
    expect(pattern.test('http://localhost:3100/employee/dashboard')).toBe(true);
    expect(pattern.test('http://localhost:3100/admin')).toBe(true);
    expect(pattern.test('http://localhost:3100/sign-in')).toBe(false);
    expect(pattern.test('http://localhost:3100/unauthorized')).toBe(false);
  });

  it('does not declare login successful if the authenticated shell never appears', async () => {
    assertions.shell.mockRejectedValueOnce(new Error('no shell')).mockRejectedValueOnce(new Error('no shell'));
    await expect(login(fixture() as never, 'employee')).rejects.toThrow('no shell');
  });
});
