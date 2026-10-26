import { NextResponse } from "next/server";
import { prevoditeljPrijavljen, MAPA } from "@/lib/pretvorbe";
import { SPREMNIK, supabase } from "@/lib/supabase";
import { greska, MAX_DATOTEKA, noviId, PORUKA_NEDOSTUPNO, potpisiPrijenos, sigurnoIme } from "@/lib/upiti";

// Adrese za izravan prijenos dokumenata koje prevoditelj pretvara u Word (samo za prijavljenog prevoditelja).
export async function POST(req: Request) {
  if (!(await prevoditeljPrijavljen())) return greska("Niste prijavljeni.", 401);
  const db = supabase();
  if (!db) return greska(PORUKA_NEDOSTUPNO, 503);

  const z = (await req.json().catch(() => null)) as { datoteke?: { ime?: string }[] } | null;
  const datoteke = Array.isArray(z?.datoteke) ? z.datoteke : [];
  if (!datoteke.length || datoteke.length > MAX_DATOTEKA) return greska("Neispravan broj datoteka.");
  const imena = datoteke.map((d, i) => sigurnoIme(String(d.ime ?? ""), i));
  if (imena.some((i) => !i)) return greska("Vrsta datoteke nije podržana.");

  const id = noviId();
  const prijenosi: { url: string }[] = [];
  for (const ime of imena) {
    const { data, error } = await db.storage.from(SPREMNIK).createSignedUploadUrl(`${MAPA}/${id}/ulaz/${ime}`);
    if (error || !data) {
      console.error("Supabase: adresa za prijenos (pretvorba)", error);
      return greska(PORUKA_NEDOSTUPNO, 503);
    }
    prijenosi.push({ url: data.signedUrl });
  }
  return NextResponse.json({ ok: true, oznaka: potpisiPrijenos(id, "pretvorba"), prijenosi });
}
