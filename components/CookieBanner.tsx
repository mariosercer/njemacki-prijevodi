"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { SITE } from "@/lib/site";

const KLJUC = "kolacici-privola";
type Privola = "sve" | "nuzni";

function procitaj(): Privola | null {
  try {
    const v = localStorage.getItem(KLJUC);
    return v === "sve" || v === "nuzni" ? v : null;
  } catch {
    return null;
  }
}

export default function CookieBanner() {
  const [privola, setPrivola] = useState<Privola | null>(null);
  const [ucitano, setUcitano] = useState(false);

  useEffect(() => {
    setPrivola(procitaj());
    setUcitano(true);
    const otvori = () => setPrivola(null);
    window.addEventListener("kolacici-postavke", otvori);
    return () => window.removeEventListener("kolacici-postavke", otvori);
  }, []);

  function spremi(v: Privola) {
    try {
      localStorage.setItem(KLJUC, v);
    } catch {
      /* privatni način pregledavanja */
    }
    setPrivola(v);
  }

  return (
    <>
      {privola === "sve" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${SITE.gaId}`} strategy="afterInteractive" />
          <Script id="ga" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${SITE.gaId}',{anonymize_ip:true});`}
          </Script>
        </>
      )}
      {ucitano && privola === null && (
        <div className="cookie-banner" role="dialog" aria-label="Kolačići">
          <p>
            Koristimo kolačiće kako bismo vam pružili najbolje iskustvo na našoj web stranici. Više o kolačićima
            pročitajte u <Link href="/upotreba-kolacica/">pravilima o kolačićima</Link>.
          </p>
          <div className="cookie-actions">
            <button className="btn" onClick={() => spremi("sve")}>
              Prihvaćam
            </button>
            <button className="btn btn-light" onClick={() => spremi("nuzni")}>
              Samo neophodni
            </button>
          </div>
        </div>
      )}
    </>
  );
}
