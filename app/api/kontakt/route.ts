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

// 2. korak: spremanje poruke s kontakt obrasca (datoteke su već prenesene preko /api/prijenos).
export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  if (!fd) return greska("Neispravan zahtjev.");
  if (fd.get("web")) return greska("Neispravan zahtjev.");

  const id = provjeriPrijenos(String(fd.get("oznaka") ?? ""), "kontakt");
  if (!id) return greska("Obrazac je istekao. Osvježite stranicu i pokušajte ponovno.");

  const ime = String(fd.get("ime") ?? "").trim().slice(0, 200);
  const email = String(fd.get("email") ?? "").trim();
  const poruka = String(fd.get("poruka") ?? "").trim().slice(0, 10000);
  if (ime.length < 2) return greska("Upišite ime i prezime.");
  if (!ispravanEmail(email)) return greska("E-mail adresa nije ispravna.");
  if (!poruka) return greska("Upišite poruku.");
  if (fd.get("privola") !== "1") return greska("Za slanje je potrebna Vaša suglasnost.");

  const upit = { id, izvor: "kontakt" as const, ime, email, poruka, ipHash: ipHash(req) };
  const spremljeno = await spremiUpit(upit);
  if (!spremljeno) return greska(PORUKA_NEDOSTUPNO, 503);

  const tekst = `Nova poruka s kontakt obrasca\n\nIme: ${ime}\nE-mail: ${email}\n\n${poruka}`;
  await posaljiObavijest(upit, `Kontakt obrazac: ${ime}`, tekst, spremljeno.datoteke);
  return NextResponse.json({ ok: true });
}
