import { createHmac, timingSafeEqual } from "node:crypto";

// Pristup privatnoj stranici „Izračun cijene”. Lozinka i tajni ključ dolaze iz varijabli okruženja (Vercel → Settings → Environment Variables).
export const KOLACIC = "kk_prevoditelj";

function tajna(): string | null {
  const lozinka = process.env.PREVODITELJ_LOZINKA;
  const kljuc = process.env.SESSION_SECRET;
  if (!lozinka || !kljuc) return null;
  // Promjena lozinke poništava sve postojeće prijave.
  return createHmac("sha256", kljuc).update(`prevoditelj:${lozinka}`).digest("hex");
}

function jednako(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function provjeriLozinku(unos: string): boolean {
  const lozinka = process.env.PREVODITELJ_LOZINKA;
  return !!lozinka && jednako(unos, lozinka);
}

export function vrijednostKolacica(): string | null {
  return tajna();
}

export function prijavljen(kolacic: string | undefined): boolean {
  const t = tajna();
  return !!t && !!kolacic && jednako(kolacic, t);
}
