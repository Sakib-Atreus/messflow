export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// New Supabase projects call this the "publishable" key; older ones the "anon" key. Either works.
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
