import { NextResponse } from "next/server";
import { SPREMNIK, supabase } from "@/lib/supabase";

export const maxDuration = 60;

const DANA = 90;

// Dnevno čišćenje (Vercel Cron, vidi vercel.json): briše upite, pretvorbe i dokumente starije od 90 dana.
// Vercel šalje zaglavlje "Authorization: Bearer <CRON_SECRET>" ako je varijabla CRON_SECRET postavljena.
export async function GET(req: Request) {
  const tajna = process.env.CRON_SECRET;
  if (!tajna || req.headers.get("authorization") !== `Bearer ${tajna}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const db = supabase();
  if (!db) return NextResponse.json({ ok: false, poruka: "Supabase nije postavljen." }, { status: 503 });

  const granica = new Date(Date.now() - DANA * 24 * 60 * 60 * 1000);
  const rezultat = { upiti: 0, pretvorbe: 0, datoteke: 0 };

  // Sve datoteke u spremniku: mape upita (<id>/…) i pretvorbi (pretvorbe/<id>/ulaz|izlaz/…).
  // Briše se svaka datoteka starija od granice, pa i one iz upita koji nikad nisu poslani.
  const zaBrisanje: string[] = [];
  async function obidi(mapa: string) {
    for (let od = 0; ; od += 1000) {
      const { data, error } = await db!.storage.from(SPREMNIK).list(mapa, { limit: 1000, offset: od });
      if (error) throw error;
      for (const f of data ?? []) {
        const put = mapa ? `${mapa}/${f.name}` : f.name;
        if (!f.id) await obidi(put); // mapa
        else if (f.created_at && new Date(f.created_at) < granica) zaBrisanje.push(put);
      }
      if (!data || data.length < 1000) break;
    }
  }

  try {
    await obidi("");
    for (let i = 0; i < zaBrisanje.length; i += 100) {
      const { error } = await db.storage.from(SPREMNIK).remove(zaBrisanje.slice(i, i + 100));
      if (error) throw error;
    }
    rezultat.datoteke = zaBrisanje.length;

    const { count: u, error: e1 } = await db.from("upiti").delete({ count: "exact" }).lt("created_at", granica.toISOString());
    if (e1) throw e1;
    rezultat.upiti = u ?? 0;
    const { count: p, error: e2 } = await db.from("pretvorbe").delete({ count: "exact" }).lt("created_at", granica.toISOString());
    if (e2) throw e2;
    rezultat.pretvorbe = p ?? 0;
  } catch (e) {
    console.error("Čišćenje nije uspjelo", e);
    return NextResponse.json({ ok: false, ...rezultat }, { status: 500 });
  }

  console.log("Čišćenje starih podataka", rezultat);
  return NextResponse.json({ ok: true, ...rezultat });
}
