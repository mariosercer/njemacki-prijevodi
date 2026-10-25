import { NextResponse } from "next/server";
import { SITE } from "@/lib/site";

// Korak 2: spremanje upita u Supabase (tablica + Storage za privitke) i obavijest e-mailom.
export async function POST() {
  return NextResponse.json(
    { ok: false, poruka: `Obrazac još nije povezan. Pišite nam izravno na ${SITE.email}.` },
    { status: 503 },
  );
}
