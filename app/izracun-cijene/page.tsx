import type { Metadata } from "next";
import { cookies } from "next/headers";
import Kalkulator from "@/components/Kalkulator";
import PageShell from "@/components/PageShell";
import { adobePostavljen } from "@/lib/adobe";
import { stanjeKvote } from "@/lib/pretvorbe";
import { KOLACIC, prijavljen } from "@/lib/prevoditelj";

export const metadata: Metadata = {
  title: "Izračun cijene",
  robots: { index: false, follow: false },
};

export default async function IzracunCijene({ searchParams }: { searchParams: Promise<{ greska?: string }> }) {
  const { greska } = await searchParams;
  const ok = prijavljen((await cookies()).get(KOLACIC)?.value);
  const adobe = ok && adobePostavljen() ? await stanjeKvote() : undefined;

  return (
    <PageShell title="Izračun cijene" sidebar={false}>
      {ok ? (
        <>
          <form action="/api/odjava/" method="post" className="logout">
            <button type="submit" className="link-button">
              Odjava
            </button>
          </form>
          <Kalkulator prikaz="prevoditelj" pretvaranjeUrl="/api/pretvori/" adobe={adobe} />
        </>
      ) : (
        <form action="/api/prijava/" method="post" className="login-box">
          <p className="login-title">Stranica prevoditelja</p>
          {greska && (
            <p className="form-notice error" role="alert">
              Pogrešna lozinka.
            </p>
          )}
          <label htmlFor="lozinka">Lozinka</label>
          <input type="password" id="lozinka" name="lozinka" required autoComplete="current-password" />
          <label className="checkbox">
            <input type="checkbox" name="zapamti" value="1" defaultChecked /> Zapamti me na ovom uređaju (30 dana)
          </label>
          <button type="submit" className="btn">
            Otvori
          </button>
        </form>
      )}
    </PageShell>
  );
}
