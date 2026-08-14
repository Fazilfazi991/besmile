export type PasswordChangeFields = {
  currentPassword?: string;
  newPassword?: string;
  confirmNewPassword?: string;
};

export function passwordChangeValidationMessage({ currentPassword, newPassword, confirmNewPassword }: PasswordChangeFields) {
  if (!currentPassword) return 'Current password is required.';
  if (!newPassword) return 'New password is required.';
  if (!confirmNewPassword) return 'Please confirm your new password.';
  if (newPassword !== confirmNewPassword) return 'New password and confirmation must match.';
  if (newPassword.length < 8) return 'New password must be at least 8 characters.';
  if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return 'New password must include uppercase, lowercase, and a number.';
  }
  return null;
}

export function temporaryPasswordValidationMessage(password: string) {
  if (!password) return null;
  return passwordChangeValidationMessage({ currentPassword: 'verified', newPassword: password, confirmNewPassword: password });
}
