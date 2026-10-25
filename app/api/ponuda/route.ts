import { NextResponse } from "next/server";
import {
  greska,
  ipHash,
  ispravanEmail,
  PORUKA_NEDOSTUPNO,
  posaljiObavijest,
  provjeriPrijenos,
  spremiUpit,
} from "@/lib/upiti";

type Sazetak = {
  vrsta?: string;
  dostava?: string;
  kartice?: string;
  podjela?: string;
  strucno?: string;
  dokumenti?: { naziv: string; stranice: string; kartice: string; znakova: number; strucno?: string; napomene?: string[] }[];
  obracun?: [string, string][];
};

// Isti sadržaj kao tekstPonude() u kalkulator.js
function tekstPonude(ime: string, email: string, napomena: string, s: Sazetak): string {
  const r: string[] = [`Naručitelj: ${ime} <${email}>`];
  if (napomena) r.push(`Napomena: ${napomena}`);
  r.push("", `Vrsta prijevoda: ${s.vrsta ?? ""}`, `Dostava: ${s.dostava ?? ""}`, `Ukupno: ${s.kartice ?? ""}${s.podjela ? ` (${s.podjela})` : ""}`);
  if (s.strucno) r.push(s.strucno);
  r.push("", "DOKUMENTI");
  (s.dokumenti ?? []).forEach((d, i) => {
    r.push(
      `${i + 1}. ${d.naziv} – ${d.stranice} str., ${d.kartice} kart., ${Number(d.znakova || 0).toLocaleString("hr-HR")} znakova${d.strucno ? `, stručni tekst (${d.strucno})` : ""}`,
    );
    (d.napomene ?? []).forEach((n) => r.push(`   ${n}`));
  });
  r.push("", "OBRAČUN");
  (s.obracun ?? []).forEach((o) => r.push(o[0] + (o[1] ? `: ${o[1]}` : "")));
  return r.join("\n");
}

// 2. korak: upit za ponudu iz kalkulatora na početnoj (datoteke su već prenesene preko /api/prijenos).
export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  if (!fd) return greska("Neispravan zahtjev.");
  if (fd.get("web")) return greska("Neispravan zahtjev.");

  const id = provjeriPrijenos(String(fd.get("oznaka") ?? ""), "ponuda");
  if (!id) return greska("Obrazac je istekao. Osvježite stranicu i pokušajte ponovno.");

  const ime = String(fd.get("ime") ?? "").trim().slice(0, 200);
  const email = String(fd.get("email") ?? "").trim();
  const napomena = String(fd.get("napomena") ?? "").trim().slice(0, 5000);
  if (ime.length < 2) return greska("Upišite ime i prezime.");
  if (!ispravanEmail(email)) return greska("E-mail adresa nije ispravna.");
  if (fd.get("privola") !== "1") return greska("Za slanje upita potrebna je Vaša suglasnost.");

  let podaci: Sazetak = {};
  try {
    podaci = JSON.parse(String(fd.get("podaci") ?? "{}")) as Sazetak;
  } catch {
    return greska("Neispravan zahtjev.");
  }
  if (JSON.stringify(podaci).length > 100_000) return greska("Neispravan zahtjev.");

  const upit = { id, izvor: "ponuda" as const, ime, email, poruka: napomena, podaci, ipHash: ipHash(req) };
  const spremljeno = await spremiUpit(upit);
  if (!spremljeno) return greska(PORUKA_NEDOSTUPNO, 503);

  const tekst = tekstPonude(ime, email, napomena, podaci);
  await posaljiObavijest(upit, `Upit za ponudu: ${ime} (${podaci.kartice ?? ""})`, tekst, spremljeno.datoteke);
  return NextResponse.json({ ok: true });
}
