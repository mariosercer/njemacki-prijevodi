import { NextResponse } from "next/server";
import {
  greska,
  ipHash,
  MAX_DATOTEKA,
  MAX_UKUPNO,
  noviId,
  PORUKA_NEDOSTUPNO,
  potpisiPrijenos,
  previseUpita,
  provjeriTurnstile,
  sigurnoIme,
  type Izvor,
} from "@/lib/upiti";
import { SPREMNIK, supabase, supabaseKljuc } from "@/lib/supabase";
import { tajniKljuc } from "@/lib/tajna";

// 1. korak slanja: provjera i potpisane adrese za izravan prijenos datoteka u Supabase Storage
// (Vercel ne prima zahtjeve veće od 4,5 MB, pa datoteke ne idu preko ovog poslužitelja).
type Zahtjev = {
  izvor?: Izvor;
  datoteke?: { ime?: string; velicina?: number }[];
  turnstile?: string;
  web?: string;
};

export async function POST(req: Request) {
  const db = supabase();
  if (!db || !tajniKljuc()) return greska(PORUKA_NEDOSTUPNO, 503);

  const z = (await req.json().catch(() => null)) as Zahtjev | null;
  if (!z || (z.izvor !== "kontakt" && z.izvor !== "ponuda")) return greska("Neispravan zahtjev.");
  // Zamka za robote
  if (z.web) return greska("Neispravan zahtjev.");

  if (!(await provjeriTurnstile(z.turnstile ?? null, req))) {
    return greska("Provjera da niste robot nije uspjela. Osvježite stranicu i pokušajte ponovno.", 403);
  }
  if (await previseUpita(ipHash(req))) {
    return greska("Poslali ste previše upita u kratkom vremenu. Pokušajte kasnije ili nam pišite e-mailom.", 429);
  }

  const datoteke = Array.isArray(z.datoteke) ? z.datoteke : [];
  if (datoteke.length > MAX_DATOTEKA) return greska(`Može se poslati najviše ${MAX_DATOTEKA} datoteka.`);
  const ukupno = datoteke.reduce((s, d) => s + (Number(d.velicina) || 0), 0);
  if (ukupno > MAX_UKUPNO) return greska("Datoteke su ukupno veće od 24 MB. Pošaljite ih e-mailom.");

  const imena = datoteke.map((d, i) => sigurnoIme(String(d.ime ?? ""), i));
  const neispravna = datoteke.find((_, i) => !imena[i]);
  if (neispravna) return greska(`Vrsta datoteke „${neispravna.ime}” nije dopuštena.`);

  const id = noviId();
  const oznaka = potpisiPrijenos(id, z.izvor)!;
  const prijenosi: { url: string }[] = [];
  for (const ime of imena) {
    const { data, error } = await db.storage.from(SPREMNIK).createSignedUploadUrl(`${id}/${ime}`);
    if (error || !data) {
      console.error("Supabase: izrada adrese za prijenos nije uspjela", error);
      // PRIVREMENO za dijagnostiku – ukloniti nakon postavljanja
      return NextResponse.json({ ok: false, poruka: PORUKA_NEDOSTUPNO, detalj: error?.message, kljuc: vrstaKljuca(), dijagnostika: dijagnostika() }, { status: 503 });
    }
    prijenosi.push({ url: data.signedUrl });
  }
  return NextResponse.json({ ok: true, oznaka, prijenosi });
}

// PRIVREMENO za dijagnostiku – samo vrsta ključa, nikad vrijednost
function vrstaKljuca(): string {
  const k = supabaseKljuc() ?? "";
  if (k.startsWith("sb_secret_")) return "sb_secret";
  if (k.startsWith("sb_publishable_")) return "sb_publishable";
  if (k.startsWith("eyJ")) {
    try {
      return "jwt:" + JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString()).role;
    } catch {
      return "jwt:?";
    }
  }
  return k ? "nepoznato" : "prazno";
}

// PRIVREMENO: nazivi varijabli (bez vrijednosti) i oznaka Supabase projekta (javni podatak iz URL-a)
function dijagnostika() {
  const nazivi = Object.keys(process.env).filter((k) => /SUPABASE|POSTGRES/i.test(k)).sort();
  let projekt = "";
  try {
    const u = new URL((process.env.SUPABASE_URL ?? "").trim());
    projekt = u.hostname.split(".")[0] + (u.pathname !== "/" ? ` (putanja: ${u.pathname})` : "");
  } catch {
    projekt = "neispravan URL";
  }
  return { nazivi, projekt };
}
