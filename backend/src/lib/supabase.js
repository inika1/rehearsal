import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  // Fail fast with a clear message rather than a confusing runtime error later.
  console.warn(
    '[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'API calls that touch the database will fail until these are configured.'
  );
}

// Service-role key is used because this runs server-side only and bypasses RLS.
// NEVER expose this key to the frontend.
export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: { persistSession: false },
});
