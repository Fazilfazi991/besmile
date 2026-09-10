import { appendFileSync, mkdirSync } from 'node:fs';
import { withAuthorizationTransportRetry } from '../../src/lib/authorization-transport';

export function recordFixtureLoginRetry(role: string) {
  mkdirSync('release-evidence', { recursive: true });
  appendFileSync('release-evidence/fixture-login-retries.jsonl', JSON.stringify({ action: 'fixture-login', role, attempt: 2, reason: 'transient-transport', time: new Date().toISOString() }) + '\n');
}
export function fixtureLogin<T extends { error?: unknown }>(operation: () => PromiseLike<T>, role: string) {
  return withAuthorizationTransportRetry(operation, { onRetry: () => recordFixtureLoginRetry(role) });
}
