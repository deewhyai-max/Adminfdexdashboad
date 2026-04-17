import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yqruprxxnfpxzduvfrfd.supabase.co';
const supabaseKey = 'sb_publishable_LjUXXjzUgp1tegR_hrXVfg_8duAXn12';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
