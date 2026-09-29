import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase-server';
import { PasswordOnboardingForm } from './form';

export default async function PasswordOnboardingPage() {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/sign-in');
  const { data: profile } = await db.from('profiles').select('onboarding_required').eq('id', user.id).maybeSingle();
  if (!profile?.onboarding_required) redirect('/');
  return <main className="grid min-h-screen place-items-center p-4"><PasswordOnboardingForm emailVerified={Boolean(user.email_confirmed_at)} /></main>;
}
