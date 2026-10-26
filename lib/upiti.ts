import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { SITE } from "@/lib/site";
import { SPREMNIK, supabase } from "@/lib/supabase";
import { tajniKljuc } from "@/lib/tajna";

export type Izvor = "kontakt" | "ponuda" | "pretvorba";

export const MAX_DATOTEKA = 20;
export const MAX_UKUPNO = 24 * 1024 * 1024;
const DOZVOLJENE = new Set(
  "pdf doc docx docm dotx dot odt ott xls xlsx xlsm ods csv txt rtf jpg jpeg png gif webp bmp heic zip rar".split(" "),
);
const ROK_PRIJENOSA_MS = 60 * 60 * 1000;
const UPITA_PO_SATU = 10;

export function greska(poruka: string, status = 400) {
  return NextResponse.json({ ok: false, poruka }, { status });
}

export const PORUKA_NEDOSTUPNO = `Slanje trenutno nije moguće. Pošaljite nam upit izravno na ${SITE.email}.`;

function tajna(): string | null {
  return tajniKljuc();
}

/* ---------- Oznaka prijenosa: dokazuje da je upit prošao provjeru u /api/prijenos ---------- */

export function potpisiPrijenos(id: string, izvor: Izvor): string | null {
  const t = tajna();
  if (!t) return null;
  const istek = Date.now() + ROK_PRIJENOSA_MS;
  const potpis = createHmac("sha256", t).update(`${id}.${izvor}.${istek}`).digest("hex");
  return `${id}.${istek}.${potpis}`;
}

export function provjeriPrijenos(oznaka: string, izvor: Izvor): string | null {
  const t = tajna();
  const [id, istek, potpis] = oznaka.split(".");
  if (!t || !id || !istek || !potpis || Number(istek) < Date.now()) return null;
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const ocekivano = createHmac("sha256", t).update(`${id}.${izvor}.${istek}`).digest("hex");
  const a = Buffer.from(potpis);
  const b = Buffer.from(ocekivano);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export function noviId() {
  return randomUUID();
}

/* ---------- Provjere ---------- */

export function sigurnoIme(ime: string, i: number): string | null {
  const m = /\.([a-z0-9]{1,5})$/i.exec(ime);
  const ext = m?.[1].toLowerCase();
  if (!ext || !DOZVOLJENE.has(ext)) return null;
  const osnova = ime
    .slice(0, -(ext.length + 1))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${String(i + 1).padStart(2, "0")}-${osnova || "datoteka"}.${ext}`;
}

export function ispravanEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 200;
}

export function ipHash(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "nepoznato";
  return createHash("sha256").update(`${tajna() ?? ""}:${ip}`).digest("hex").slice(0, 32);
}

export async function previseUpita(hash: string): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const od = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await db.from("upiti").select("id", { count: "exact", head: true }).eq("ip_hash", hash).gte("created_at", od);
  if (error) console.error("Supabase: provjera broja upita nije uspjela", error);
  return (count ?? 0) >= UPITA_PO_SATU;
}

/** Cloudflare Turnstile – provjerava se samo ako je postavljen tajni ključ. */
export async function provjeriTurnstile(token: string | null, req: Request): Promise<boolean> {
  const kljuc = process.env.TURNSTILE_SECRET_KEY;
  if (!kljuc) return true;
  if (!token) return false;
  const fd = new FormData();
  fd.append("secret", kljuc);
  fd.append("response", token);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (ip) fd.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd });
    const o = (await r.json()) as { success?: boolean };
    return !!o.success;
  } catch {
    return false;
  }
}

/* ---------- Spremanje i obavijest ---------- */

type Upit = {
  id: string;
  izvor: Izvor;
  ime: string;
  email: string;
  poruka: string;
  podaci?: unknown;
  ipHash: string;
};

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Sprema upit, uz popis datoteka koje su stvarno prenesene u mapu upita. */
export async function spremiUpit(u: Upit): Promise<{ datoteke: { ime: string; url: string }[] } | null> {
  const db = supabase();
  if (!db) return null;

  const { data: popis } = await db.storage.from(SPREMNIK).list(u.id, { limit: MAX_DATOTEKA + 5 });
  const imena = (popis ?? []).filter((f) => f.id).map((f) => f.name).slice(0, MAX_DATOTEKA);
  const putanje = imena.map((n) => `${u.id}/${n}`);

  const { error } = await db.from("upiti").insert({
    id: u.id,
    izvor: u.izvor,
    ime: u.ime,
    email: u.email,
    poruka: u.poruka || null,
    podaci: u.podaci ?? null,
    datoteke: putanje,
    ip_hash: u.ipHash,
  });
  if (error) {
    console.error("Spremanje upita nije uspjelo", error);
    return null;
  }

  let datoteke: { ime: string; url: string }[] = [];
  if (putanje.length) {
    // Poveznice za preuzimanje vrijede 30 dana.
    const { data } = await db.storage.from(SPREMNIK).createSignedUrls(putanje, 60 * 60 * 24 * 30);
    datoteke = (data ?? []).map((d, i) => ({ ime: imena[i], url: d.signedUrl ?? "" })).filter((d) => d.url);
  }
  return { datoteke };
}

export async function posaljiObavijest(
  u: Upit,
  naslov: string,
  tekst: string,
  datoteke: { ime: string; url: string }[],
): Promise<boolean> {
  const kljuc = process.env.RESEND_API_KEY;
  if (!kljuc) return false;
  const resend = new Resend(kljuc);
  const popis = datoteke.length
    ? `<p><strong>Privitci</strong> (poveznice vrijede 30 dana):</p><ul>${datoteke
        .map((d) => `<li><a href="${escape(d.url)}">${escape(d.ime)}</a></li>`)
        .join("")}</ul>`
    : "<p>Bez privitaka.</p>";
  const { error } = await resend.emails.send({
    from: process.env.OBAVIJEST_POSILJATELJ || "Web stranica <onboarding@resend.dev>",
    to: process.env.OBAVIJEST_EMAIL || SITE.email,
    replyTo: u.email,
    subject: naslov,
    text: `${tekst}\n\n${datoteke.map((d) => `${d.ime}: ${d.url}`).join("\n") || "Bez privitaka."}`,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${escape(tekst)}</pre>${popis}`,
  });
  if (error) console.error("Slanje e-maila nije uspjelo", error);
  return !error;
}
