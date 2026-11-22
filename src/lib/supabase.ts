import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Only intentionally public VITE_ configuration is ever read in browser code.
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

export const supabaseConfigured = Boolean(url && publishableKey);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
