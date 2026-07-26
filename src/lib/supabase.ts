import { createBrowserClient } from '@supabase/ssr';
import type {Database} from '@/types/database';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// The SSR client keeps the browser session in cookies so middleware and server
// layouts can recognize the user after navigating away from the sign-in page.
export const supabase = url && key ? createBrowserClient<Database>(url, key) : null;
