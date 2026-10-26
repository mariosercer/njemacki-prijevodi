// Adobe PDF Services REST API: https://developer.adobe.com/document-services/docs/apis/
const BAZA =
  process.env.ADOBE_BAZA_TEST ||
  (process.env.ADOBE_REGIJA === "ew1" ? "https://pdf-services-ew1.adobe.io" : "https://pdf-services-ue1.adobe.io");

export const MJESECNI_LIMIT = Number(process.env.ADOBE_MJESECNI_LIMIT) || 500;

export function adobePostavljen(): boolean {
  return !!(process.env.ADOBE_CLIENT_ID && process.env.ADOBE_CLIENT_SECRET);
}

export class AdobeGreska extends Error {
  constructor(
    message: string,
    public kvota = false,
  ) {
    super(message);
  }
}

let token: { vrijednost: string; istek: number } | null = null;

async function pristup(): Promise<string> {
  if (token && token.istek > Date.now() + 60_000) return token.vrijednost;
  const res = await fetch(`${BAZA}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.ADOBE_CLIENT_ID ?? "",
      client_secret: process.env.ADOBE_CLIENT_SECRET ?? "",
    }),
  });
  const o = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !o?.access_token) throw new AdobeGreska("Prijava na Adobe nije uspjela – provjerite Client ID i Client Secret.");
  token = { vrijednost: o.access_token, istek: Date.now() + (o.expires_in ?? 3600) * 1000 };
  return token.vrijednost;
}

async function zaglavlja(json = true): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await pristup()}`,
    "x-api-key": process.env.ADOBE_CLIENT_ID ?? "",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function greskaIzOdgovora(status: number, o: unknown, zadano: string): AdobeGreska {
  const e = o as { error?: { code?: string; message?: string }; code?: string; message?: string } | null;
  const kod = e?.error?.code ?? e?.code ?? "";
  const poruka = e?.error?.message ?? e?.message ?? zadano;
  const kvota = status === 429 || /QUOTA|LIMIT/i.test(kod) || /quota/i.test(poruka);
  return new AdobeGreska(kvota ? "Mjesečna kvota Adobea je potrošena." : `${zadano} (${poruka})`, kvota);
}

/** Prijenos dokumenta na Adobe; vraća assetID. */
export async function prenesiNaAdobe(sadrzaj: ArrayBuffer, mediaType: string): Promise<string> {
  const res = await fetch(`${BAZA}/assets`, {
    method: "POST",
    headers: await zaglavlja(),
    body: JSON.stringify({ mediaType }),
  });
  const o = (await res.json().catch(() => null)) as { uploadUri?: string; assetID?: string } | null;
  if (!res.ok || !o?.uploadUri || !o.assetID) throw greskaIzOdgovora(res.status, o, "Adobe nije primio dokument");
  const put = await fetch(o.uploadUri, { method: "PUT", headers: { "Content-Type": mediaType }, body: sadrzaj });
  if (!put.ok) throw new AdobeGreska("Prijenos dokumenta na Adobe nije uspio.");
  return o.assetID;
}

export type Korak =
  | { op: "createpdf"; i: number }
  | { op: "combinepdf" }
  | { op: "ocr" }
  | { op: "exportpdf" };

/** Pokreće Adobe operaciju; vraća adresu za praćenje posla. */
export async function pokreni(korak: Korak, dokumenti: string[], jezik: string): Promise<string> {
  let put: string;
  let tijelo: Record<string, unknown>;
  switch (korak.op) {
    case "createpdf":
      put = "createpdf";
      tijelo = { assetID: dokumenti[korak.i] };
      break;
    case "combinepdf":
      put = "combinepdf";
      tijelo = { assets: dokumenti.map((assetID) => ({ assetID })) };
      break;
    case "ocr":
      put = "ocr";
      tijelo = { assetID: dokumenti[0], ocrLang: jezik, ocrType: "searchable_image" };
      break;
    case "exportpdf":
      put = "exportpdf";
      tijelo = { assetID: dokumenti[0], targetFormat: "docx", ocrLang: jezik };
      break;
  }
  const res = await fetch(`${BAZA}/operation/${put}`, {
    method: "POST",
    headers: await zaglavlja(),
    body: JSON.stringify(tijelo),
  });
  const lokacija = res.headers.get("location");
  if (!res.ok || !lokacija) {
    const o = await res.json().catch(() => null);
    throw greskaIzOdgovora(res.status, o, "Adobe nije pokrenuo obradu");
  }
  return lokacija;
}

export type StanjePosla =
  | { stanje: "radi" }
  | { stanje: "gotovo"; assetID: string; downloadUri: string }
  | { stanje: "greska"; greska: AdobeGreska };

export async function provjeri(lokacija: string): Promise<StanjePosla> {
  const res = await fetch(lokacija, { headers: await zaglavlja(false) });
  const o = (await res.json().catch(() => null)) as {
    status?: string;
    asset?: { assetID: string; downloadUri: string };
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok || !o) return { stanje: "greska", greska: greskaIzOdgovora(res.status, o, "Adobe ne odgovara") };
  if (o.status === "done" && o.asset) return { stanje: "gotovo", assetID: o.asset.assetID, downloadUri: o.asset.downloadUri };
  if (o.status === "failed") return { stanje: "greska", greska: greskaIzOdgovora(400, o, "Adobe nije uspio obraditi dokument") };
  return { stanje: "radi" };
}

const VRSTE: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  rtf: "text/rtf",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  bmp: "image/bmp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

/** Vrsta dokumenta za Adobe prema nastavku imena; null ako je Adobe ne podržava (npr. .odt, .webp). */
export function vrstaZaAdobe(ime: string): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(ime)?.[1].toLowerCase() ?? "";
  return VRSTE[ext] ?? null;
}
