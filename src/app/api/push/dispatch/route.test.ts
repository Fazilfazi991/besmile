import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendPushToUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/push-server', () => ({ sendPushToUser }));

import { POST } from './route';

const oldSecret = 'synthetic-old-push-secret';
const newSecret = 'synthetic-new-push-secret';
const notification = {
  id: 'synthetic-notification',
  profile_id: 'synthetic-profile',
  title: 'Test',
  body: 'Synthetic notification',
};

function request(secret?: string, body: unknown = { record: notification }) {
  return new Request('http://localhost/api/push/dispatch', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-push-dispatch-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('push dispatch rotation window', () => {
  beforeEach(() => {
    vi.stubEnv('PUSH_DISPATCH_SECRET', oldSecret);
    vi.stubEnv('PUSH_DISPATCH_SECRET_NEXT', newSecret);
    sendPushToUser.mockReset().mockResolvedValue({ attempted: 1, delivered: 1 });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([oldSecret, newSecret])('accepts a configured credential', async (secret) => {
    const response = await POST(request(secret));
    expect(response.status).toBe(200);
    expect(sendPushToUser).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ attempted: 1, delivered: 1 });
  });

  it.each([undefined, 'synthetic-invalid-push-secret'])('rejects a missing or incorrect credential', async (secret) => {
    const response = await POST(request(secret));
    expect(response.status).toBe(401);
    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: 'Unauthorized.' });
  });

  it('preserves payload validation for authorized requests', async () => {
    const response = await POST(request(newSecret, { record: { id: 'incomplete' } }));
    expect(response.status).toBe(400);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it('rejects the next credential when it is not configured', async () => {
    vi.stubEnv('PUSH_DISPATCH_SECRET_NEXT', '');
    const response = await POST(request(newSecret));
    expect(response.status).toBe(401);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it('does not return or log either credential, including on dispatch failure', async () => {
    const infoLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      sendPushToUser.mockRejectedValueOnce(new Error(newSecret));
      const response = await POST(request(newSecret));
      const responseText = await response.text();
      expect(response.status).toBe(500);
      expect(responseText).not.toContain(oldSecret);
      expect(responseText).not.toContain(newSecret);
      expect(JSON.stringify(infoLog.mock.calls)).not.toContain(oldSecret);
      expect(JSON.stringify(infoLog.mock.calls)).not.toContain(newSecret);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(oldSecret);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(newSecret);
    } finally {
      infoLog.mockRestore();
      errorLog.mockRestore();
    }
  });
});
