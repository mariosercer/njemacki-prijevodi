import { cookies } from "next/headers";
import { MJESECNI_LIMIT, type Korak } from "@/lib/adobe";
import { KOLACIC, prijavljen } from "@/lib/prevoditelj";
import { supabase } from "@/lib/supabase";

export const MAPA = "pretvorbe";

export async function prevoditeljPrijavljen(): Promise<boolean> {
  return prijavljen((await cookies()).get(KOLACIC)?.value);
}

/** Broj Adobe operacija pokrenutih ovaj mjesec (približno ono što Adobe broji u kvotu). */
export async function potrosenoOvajMjesec(): Promise<number> {
  const db = supabase();
  if (!db) return 0;
  const d = new Date();
  const pocetak = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  const { data } = await db.from("pretvorbe").select("operacije").gte("created_at", pocetak);
  return (data ?? []).reduce((s, r) => s + (r.operacije ?? 0), 0);
}

export async function stanjeKvote() {
  const broj = await potrosenoOvajMjesec();
  return { broj, limit: MJESECNI_LIMIT, iscrpljeno: broj >= MJESECNI_LIMIT };
}

export type Pretvorba = {
  id: string;
  stanje: "radi" | "gotovo" | "greska";
  ime: string;
  jezik: string;
  koraci: Korak[];
  dokumenti: string[];
  posao: string | null;
  operacije: number;
  rezultat: string | null;
  poruka: string | null;
};

export function opisKoraka(k: Korak | undefined): string {
  switch (k?.op) {
    case "createpdf":
      return "Adobe pretvara datoteku u PDF…";
    case "combinepdf":
      return "Adobe spaja datoteke u jedan dokument…";
    case "ocr":
      return "Adobe prepoznaje tekst (OCR)…";
    case "exportpdf":
      return "Adobe izrađuje Word…";
    default:
      return "Obrađujem…";
  }
}
