import { createBrowserClient } from '@supabase/ssr';
import type {Database} from '@/types/database';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hasValidSupabaseUrl = (value?: string) => {
  try {
    const parsed = new URL(value || '');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// The SSR client keeps the browser session in cookies so middleware and server
// layouts can recognize the user after navigating away from the sign-in page.
// The schema is expanded incrementally through SQL migrations; keep the browser
// client permissive until generated Supabase types are refreshed.
export const supabase: any = hasValidSupabaseUrl(url) && key ? createBrowserClient<Database>(url!, key) : null;
