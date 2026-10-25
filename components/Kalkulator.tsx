"use client";

import Script from "next/script";
import { useEffect } from "react";
import "./kalkulator.css";
import { KALKULATOR_HTML } from "./kalkulator-markup";

declare global {
  interface Window {
    kkPokreni?: () => void;
  }
}

// Postavke cjenika – iste vrijednosti kao u postavkama WordPress plugina.
const CJENIK = {
  "data-znakova": "1500",
  "data-decimale": "2",
  "data-jezici": "hrv+deu+eng",
  "data-valuta": "€",
  "data-cijena-neovjereno": "12",
  "data-cijena-ovjereno": "16",
  "data-dostava-sken": "0.2",
  "data-dostava-hr": "4",
  "data-dostava-ino": "9.5",
  "data-mnozitelj-stranica": "2",
  "data-dodatne-stranice": "3",
  "data-strucno-postotak": "20",
  "data-eovjera-kartice": "0.5",
  "data-epotpis-kartice": "0.5",
  "data-min-kartica": "1",
  "data-zaokruzivanje": "0.5",
  "data-adresa": "Varaždinska 3, 40305 Nedelišće",
  "data-napomena-pdv":
    "Navedene cijene ne sadrže PDV.\nObveznik nije u sustavu PDV-a, PDV nije obračunat temeljem čl. 90. st. 1. Zakona o PDV-u.",
  "data-doc-skripta": "/kalkulator/word-doc.min.js",
  "data-ponuda-email": "mario.sercer@gmail.com",
  "data-ponuda-max-mb": "24",
  "data-ponuda-privatnost": "/izjava-o-privatnosti/",
};

type Props =
  | {
      prikaz: "javni";
      /** Prazno = testni način: upit se prikaže, ali se ne šalje. */
      ponudaUrl: string;
      ponudaToken: string;
      turnstileSiteKey?: string;
    }
  | {
      prikaz: "prevoditelj";
      /** Adobe PDF Services (pretvaranje u Word s izgledom izvornika); bez njega radi jednostavno pretvaranje u pregledniku. */
      pretvaranjeUrl?: string;
      adobe?: { broj: number; limit: number; iscrpljeno: boolean };
    };

export default function Kalkulator(props: Props) {
  useEffect(() => {
    window.kkPokreni?.();
  }, []);

  const data: Record<string, string> = { ...CJENIK, "data-prikaz": props.prikaz };
  if (props.prikaz === "javni") {
    data["data-ponuda"] = "da";
    data["data-ponuda-url"] = props.ponudaUrl;
    data["data-ponuda-token"] = props.ponudaToken;
    data["data-ponuda-turnstile"] = props.turnstileSiteKey ?? "";
  } else {
    data["data-ponuda"] = "ne";
    data["data-pretvaranje-url"] = props.pretvaranjeUrl ?? "";
    data["data-adobe"] = props.adobe ? "1" : "0";
    if (props.adobe) {
      data["data-adobe-broj"] = String(props.adobe.broj);
      data["data-adobe-limit"] = String(props.adobe.limit);
      data["data-adobe-iscrpljeno"] = props.adobe.iscrpljeno ? "1" : "0";
    }
    data["data-adobe-jezik"] = "hr-HR";
    data["data-adobe-jezici"] = JSON.stringify({
      "hr-HR": "hrvatski",
      "de-DE": "njemački",
      "en-US": "engleski",
      "sl-SI": "slovenski",
      "it-IT": "talijanski",
      "fr-FR": "francuski",
    });
  }

  return (
    <>
      <div
        className="kk"
        id="kk-1"
        style={{ "--kk-boja": "#24456b" } as React.CSSProperties}
        {...data}
        dangerouslySetInnerHTML={{ __html: KALKULATOR_HTML }}
      />
      <Script src="/kalkulator/kalkulator.js" strategy="afterInteractive" onReady={() => window.kkPokreni?.()} />
    </>
  );
}
