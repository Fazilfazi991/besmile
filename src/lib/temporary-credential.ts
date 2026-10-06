import { randomBytes } from 'node:crypto';

/** Server-only call sites. The generated credential exists only in request memory. */
export function newTemporaryCredential() {
  return randomBytes(24).toString('base64url');
}

export const privateCredentialHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer',
};
