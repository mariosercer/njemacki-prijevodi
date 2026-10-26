import { NextResponse } from "next/server";
import { AdobeGreska, adobePostavljen, pokreni, prenesiNaAdobe, vrstaZaAdobe, type Korak } from "@/lib/adobe";
import { MAPA, opisKoraka, prevoditeljPrijavljen, stanjeKvote } from "@/lib/pretvorbe";
import { SPREMNIK, supabase } from "@/lib/supabase";
import { provjeriPrijenos } from "@/lib/upiti";

export const maxDuration = 60;

const odbij = (poruka: string, status = 400, kvota = false) => NextResponse.json({ poruka, kvota }, { status });

// Pokretanje pretvorbe u Word preko Adobea (dokumenti su već preneseni preko /api/pretvori/prijenos).
export async function POST(req: Request) {
  if (!(await prevoditeljPrijavljen())) return odbij("Niste prijavljeni.", 401);
  const db = supabase();
  if (!db || !adobePostavljen()) return odbij("Adobe nije postavljen.", 503);

  const z = (await req.json().catch(() => null)) as { oznaka?: string; ocr?: boolean; jezik?: string; ime?: string } | null;
  const id = provjeriPrijenos(String(z?.oznaka ?? ""), "pretvorba");
  if (!id) return odbij("Prijenos je istekao. Pokušajte ponovno.");
  const jezik = /^[a-z]{2}-[A-Z]{2}$/.test(z?.jezik ?? "") ? z!.jezik! : "hr-HR";
  const ime = String(z?.ime ?? "dokument").slice(0, 200);

  const kvota = await stanjeKvote();
  if (kvota.iscrpljeno) return odbij("Mjesečna kvota Adobea je potrošena.", 429, true);

  const { data: popis } = await db.storage.from(SPREMNIK).list(`${MAPA}/${id}/ulaz`, { sortBy: { column: "name", order: "asc" } });
  const datoteke = (popis ?? []).filter((f) => f.id);
  if (!datoteke.length) return odbij("Dokumenti nisu preneseni.");

  try {
    const dokumenti: string[] = [];
    const koraci: Korak[] = [];
    for (const [i, f] of datoteke.entries()) {
      const vrsta = vrstaZaAdobe(f.name);
      if (!vrsta) return odbij(`Adobe ne podržava datoteku „${f.name.replace(/^\d+-/, "")}”.`);
      const { data, error } = await db.storage.from(SPREMNIK).download(`${MAPA}/${id}/ulaz/${f.name}`);
      if (error || !data) return odbij("Dokument se nije mogao pročitati iz spremnika.", 503);
      dokumenti.push(await prenesiNaAdobe(await data.arrayBuffer(), vrsta));
      if (vrsta !== "application/pdf") koraci.push({ op: "createpdf", i });
    }
    if (dokumenti.length > 1) koraci.push({ op: "combinepdf" });
    if (z?.ocr) koraci.push({ op: "ocr" });
    koraci.push({ op: "exportpdf" });

    const [prvi, ...ostali] = koraci;
    const posao = await pokreni(prvi, dokumenti, jezik);
    const { error } = await db.from("pretvorbe").insert({
      id,
      ime,
      jezik,
      ocr: !!z?.ocr,
      koraci: [prvi, ...ostali],
      dokumenti,
      posao,
      operacije: 1,
    });
    if (error) {
      console.error("Supabase: spremanje pretvorbe", error);
      return odbij("Pretvorba se nije mogla spremiti.", 503);
    }
    return NextResponse.json({
      posao: id,
      opis: opisKoraka(prvi),
      napredak: 0.1,
      adobe: { broj: kvota.broj + 1, limit: kvota.limit },
    });
  } catch (e) {
    const g = e instanceof AdobeGreska ? e : new AdobeGreska("Adobe trenutno nije dostupan.");
    console.error("Adobe: pokretanje pretvorbe", e);
    return odbij(g.message, g.kvota ? 429 : 502, g.kvota);
  }
}
