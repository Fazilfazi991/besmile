import { describe, expect, it } from 'vitest';
import { passwordChangeValidationMessage, temporaryPasswordValidationMessage } from './password-rules';

describe('password rules', () => {
  it('requires the current password and matching secure new password', () => {
    expect(passwordChangeValidationMessage({ newPassword: 'Bsmile@1234', confirmNewPassword: 'Bsmile@1234' })).toBe('Current password is required.');
    expect(passwordChangeValidationMessage({ currentPassword: 'old', newPassword: 'lowercase1', confirmNewPassword: 'lowercase1' })).toBe('New password must include uppercase, lowercase, and a number.');
    expect(passwordChangeValidationMessage({ currentPassword: 'old', newPassword: 'Bsmile@1234', confirmNewPassword: 'different' })).toBe('New password and confirmation must match.');
    expect(passwordChangeValidationMessage({ currentPassword: 'old', newPassword: 'Bsmile@1234', confirmNewPassword: 'Bsmile@1234' })).toBeNull();
  });

  it('allows an omitted temporary password and validates a supplied one', () => {
    expect(temporaryPasswordValidationMessage('')).toBeNull();
    expect(temporaryPasswordValidationMessage('short')).toBe('New password must be at least 8 characters.');
  });
});
