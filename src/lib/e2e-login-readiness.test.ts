import { afterEach, describe, expect, it, vi } from 'vitest';
const assertions = vi.hoisted(() => ({ url: vi.fn(), shell: vi.fn(), retry: vi.fn() }));
vi.mock('@playwright/test', () => ({ expect: () => ({ toHaveURL: assertions.url, toBeVisible: assertions.shell }) }));
vi.mock('../../tests/e2e/fixture-auth', () => ({ recordFixtureLoginRetry: assertions.retry }));
import { login } from '../../tests/e2e/helpers';

afterEach(() => {
  assertions.url.mockReset();
  assertions.shell.mockReset();
  assertions.retry.mockReset();
  vi.unstubAllEnvs();
});

function fixture() {
  vi.stubEnv('BSMILE_QA_EMPLOYEE_EMAIL', 'fixture@example.invalid');
  vi.stubEnv('BSMILE_QA_EMPLOYEE_PASSWORD', 'test-only');
  return {
    goto: vi.fn(), getByLabel: vi.fn(() => ({ fill: vi.fn() })),
    getByRole: vi.fn(() => ({ click: vi.fn(), isDisabled: vi.fn(async () => false) })), locator: vi.fn(),
    waitForLoadState: vi.fn(), waitForTimeout: vi.fn(),
    on: vi.fn(), off: vi.fn(), url: vi.fn(() => 'http://localhost:3000/sign-in'),
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
    const page=fixture();
    await expect(login(page as never, 'employee')).rejects.toThrow('no shell');
    expect(page.goto).toHaveBeenCalledTimes(1);
  });

  it('retries one successful-token sign-in bounce before requiring the authenticated shell', async () => {
    let responseListener: ((response: { url: () => string; status: () => number }) => void) | undefined;
    const page = fixture();
    page.on.mockImplementation((event: string, listener: typeof responseListener) => {
      if (event === 'response') responseListener = listener;
    });
    page.getByRole.mockImplementation(() => ({
      click: vi.fn(async () => {
        responseListener?.({ url: () => 'https://qa.invalid/auth/v1/token', status: () => 200 });
      }),
      isDisabled: vi.fn(async () => false),
    }));
    assertions.url.mockRejectedValueOnce(new Error('bootstrap returned to sign-in'));

    await login(page as never, 'employee');

    expect(page.goto).toHaveBeenCalledTimes(2);
    expect(page.waitForTimeout).toHaveBeenCalledWith(150);
    expect(assertions.retry).toHaveBeenCalledWith('employee', 'post-auth-bootstrap');
    expect(assertions.shell).toHaveBeenCalledTimes(1);
  });

  it('retries one token request that stalls without an HTTP or browser failure', async () => {
    const page = fixture();
    page.getByRole.mockImplementation(() => ({
      click: vi.fn(),
      isDisabled: vi.fn(async () => true),
    }));
    assertions.url.mockRejectedValueOnce(new Error('token request stalled'));

    await login(page as never, 'employee');

    expect(page.goto).toHaveBeenCalledTimes(2);
    expect(page.waitForTimeout).toHaveBeenCalledWith(150);
    expect(assertions.retry).toHaveBeenCalledWith('employee', 'transient-transport');
    expect(assertions.shell).toHaveBeenCalledTimes(1);
  });
});
