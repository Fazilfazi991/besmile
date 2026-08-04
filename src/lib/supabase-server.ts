import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function serverSupabase() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value, options }) => {
          try {
            store.set(name, value, options);
          } catch {
            // Server Components cannot set cookies; middleware and actions can.
          }
        });
      },
    },
  });
}
