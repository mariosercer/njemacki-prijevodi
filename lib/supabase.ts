import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SPREMNIK = "privitci";

let klijent: SupabaseClient | null = null;

/** Supabase s ključem service role – samo na poslužitelju, nikad u pregledniku. */
export function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const kljuc = supabaseKljuc();
  if (!url || !kljuc) return null;
  klijent ??= createClient(url, kljuc, { auth: { persistSession: false } });
  return klijent;
}

/** Tajni ključ (sb_secret_…); SUPABASE_SECRET_KEY ima prednost pred starijim nazivom SUPABASE_SERVICE_ROLE_KEY. */
export function supabaseKljuc(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}
