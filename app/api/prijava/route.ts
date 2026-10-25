import { NextResponse, type NextRequest } from "next/server";
import { KOLACIC, provjeriLozinku, vrijednostKolacica } from "@/lib/prevoditelj";

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const lozinka = String(fd.get("lozinka") ?? "");
  const zapamti = fd.get("zapamti") === "1";
  const natrag = new URL("/izracun-cijene/", req.url);

  const vrijednost = vrijednostKolacica();
  if (!vrijednost || !provjeriLozinku(lozinka)) {
    // Kratka odgoda otežava pogađanje lozinke.
    await new Promise((r) => setTimeout(r, 800));
    natrag.searchParams.set("greska", "1");
    return NextResponse.redirect(natrag, 303);
  }

  const res = NextResponse.redirect(natrag, 303);
  res.cookies.set(KOLACIC, vrijednost, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(zapamti ? { maxAge: 60 * 60 * 24 * 30 } : {}),
  });
  return res;
}
