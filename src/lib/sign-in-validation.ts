export type SignInFields = { email: string; password: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function signInValidationMessage({ email, password }: SignInFields) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) return 'Email is required.';
  if (!emailPattern.test(normalizedEmail)) return 'Enter a valid email address.';
  if (!password) return 'Password is required.';
  return null;
}
