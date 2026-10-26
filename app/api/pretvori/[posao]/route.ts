import { NextResponse } from "next/server";
import { AdobeGreska, pokreni, provjeri } from "@/lib/adobe";
import { MAPA, opisKoraka, prevoditeljPrijavljen, stanjeKvote, type Pretvorba } from "@/lib/pretvorbe";
import { SPREMNIK, supabase } from "@/lib/supabase";

export const maxDuration = 60;

// Praćenje pretvorbe: svaki upit provjeri Adobe posao i, kad je gotov, pokrene sljedeći korak.
export async function GET(_req: Request, { params }: { params: Promise<{ posao: string }> }) {
  if (!(await prevoditeljPrijavljen())) return NextResponse.json({ stanje: "greska", poruka: "Niste prijavljeni." }, { status: 401 });
  const db = supabase();
  const { posao: id } = await params;
  if (!db || !/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ stanje: "greska", poruka: "Nepoznata pretvorba." });

  const { data } = await db.from("pretvorbe").select("*").eq("id", id).single();
  const p = data as Pretvorba | null;
  if (!p) return NextResponse.json({ stanje: "greska", poruka: "Nepoznata pretvorba." });

  const kvota = await stanjeKvote();
  const odgovor = (o: Record<string, unknown>) => NextResponse.json({ ...o, adobe: { broj: kvota.broj, limit: kvota.limit } });
  const ukupno = p.operacije + p.koraci.length - 1;
  const napredak = (gotovo: number) => Math.min(0.95, 0.1 + (0.85 * gotovo) / Math.max(1, ukupno));

  if (p.stanje === "gotovo" && p.rezultat) return odgovor(await gotovo(p.rezultat));
  if (p.stanje === "greska") return odgovor({ stanje: "greska", poruka: p.poruka });

  const azuriraj = (promjene: Partial<Pretvorba>) =>
    db.from("pretvorbe").update({ ...promjene, updated_at: new Date().toISOString() }).eq("id", id);

  try {
    const st = await provjeri(p.posao!);
    if (st.stanje === "radi") return odgovor({ stanje: "radi", opis: opisKoraka(p.koraci[0]), napredak: napredak(p.operacije - 1) });
    if (st.stanje === "greska") throw st.greska;

    const [zavrsen, ...ostali] = p.koraci;
    let dokumenti = [...p.dokumenti];
    if (zavrsen.op === "createpdf") dokumenti[zavrsen.i] = st.assetID;
    else dokumenti = [st.assetID];

    if (zavrsen.op === "exportpdf") {
      // Gotov Word ide u Supabase, odakle ga preglednik preuzima (Vercel ne vraća odgovore veće od 4,5 MB).
      const word = await fetch(st.downloadUri);
      if (!word.ok) throw new AdobeGreska("Word se nije mogao preuzeti s Adobea.");
      const putanja = `${MAPA}/${id}/izlaz/${id}.docx`;
      const { error } = await db.storage.from(SPREMNIK).upload(putanja, await word.arrayBuffer(), {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
      if (error) throw new AdobeGreska("Word se nije mogao spremiti.");
      await azuriraj({ stanje: "gotovo", rezultat: putanja, koraci: [], dokumenti, posao: null });
      return odgovor(await gotovo(putanja));
    }

    const sljedeci = ostali[0];
    const posao = await pokreni(sljedeci, dokumenti, p.jezik);
    await azuriraj({ koraci: ostali, dokumenti, posao, operacije: p.operacije + 1 });
    return odgovor({ stanje: "radi", opis: opisKoraka(sljedeci), napredak: napredak(p.operacije) });
  } catch (e) {
    const g = e instanceof AdobeGreska ? e : new AdobeGreska("Adobe trenutno nije dostupan.");
    console.error("Adobe: pretvorba", id, e);
    await azuriraj({ stanje: "greska", poruka: g.message });
    return odgovor({ stanje: "greska", poruka: g.message, kvota: g.kvota });
  }

  async function gotovo(putanja: string) {
    const { data: url } = await db!.storage.from(SPREMNIK).createSignedUrl(putanja, 60 * 60);
    return { stanje: "gotovo", word: url?.signedUrl, napredak: 1, opis: "Word je gotov." };
  }
}
