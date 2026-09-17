export const PUBLIC_DEMO_DISABLED_MESSAGE = 'This action is disabled in the public demo.';

export function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

export class PublicDemoActionError extends Error {
  constructor(action?: string) {
    super(action ? `${action} is disabled in the public demo.` : PUBLIC_DEMO_DISABLED_MESSAGE);
    this.name = 'PublicDemoActionError';
  }
}

export function assertDemoSafeAction(action?: string) {
  if (isDemoMode()) throw new PublicDemoActionError(action);
}
