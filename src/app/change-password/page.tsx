import { PasswordChangeForm } from '@/components/password-change-form';

export default function ChangePasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <PasswordChangeForm forced />
    </main>
  );
}
