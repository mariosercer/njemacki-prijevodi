import { createHash } from "node:crypto";
import { supabaseKljuc } from "@/lib/supabase";

/**
 * Tajni ključ za potpisivanje (kolačić prijave, oznake prijenosa).
 * SESSION_SECRET ako je postavljen; inače se izvodi iz Supabase ključa, koji je također samo na poslužitelju.
 */
export function tajniKljuc(): string | null {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const kljuc = supabaseKljuc();
  return kljuc ? createHash("sha256").update(`njemacki-prijevodi:session:${kljuc}`).digest("hex") : null;
}
