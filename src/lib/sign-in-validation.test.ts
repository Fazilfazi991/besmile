import { describe, expect, it } from 'vitest';
import { signInValidationMessage } from './sign-in-validation';

describe('sign-in validation', () => {
  it('rejects empty and malformed email before authentication', () => {
    expect(signInValidationMessage({ email: '', password: 'secret' })).toBe('Email is required.');
    expect(signInValidationMessage({ email: 'not-an-email', password: 'secret' })).toBe('Enter a valid email address.');
  });

  it('requires a password and accepts a valid credential shape', () => {
    expect(signInValidationMessage({ email: 'person@example.com', password: '' })).toBe('Password is required.');
    expect(signInValidationMessage({ email: ' person@example.com ', password: 'secret' })).toBeNull();
  });
});
