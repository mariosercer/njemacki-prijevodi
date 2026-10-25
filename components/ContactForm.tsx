"use client";

import Link from "next/link";
import { useState } from "react";
import { prenesiDatoteke } from "@/lib/prijenos";
import { SITE } from "@/lib/site";
import DropZone from "./DropZone";
import Turnstile, { TURNSTILE_SITE_KEY } from "./Turnstile";

const DOZVOLJENO = ".pdf,.doc,.docx,.txt,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.zip,.rar";
const MAX_MB = 24;

type Stanje = { vrsta: "mir" } | { vrsta: "salje"; postotak?: number } | { vrsta: "uspjeh" } | { vrsta: "greska"; poruka: string };

export default function ContactForm() {
  const [stanje, setStanje] = useState<Stanje>({ vrsta: "mir" });
  const [tsToken, setTsToken] = useState("");
  const [tsReset, setTsReset] = useState(0);
  const [datoteke, setDatoteke] = useState<File[]>([]);

  async function posalji(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const ukupno = datoteke.reduce((s, f) => s + f.size, 0);
    if (ukupno > MAX_MB * 1024 * 1024) {
      setStanje({ vrsta: "greska", poruka: `Datoteke su ukupno veće od ${MAX_MB} MB. Pošaljite ih e-mailom na ${SITE.email}.` });
      return;
    }
    if (TURNSTILE_SITE_KEY && !tsToken) {
      setStanje({ vrsta: "greska", poruka: "Pričekajte trenutak dok se dovrši provjera da niste robot, pa pokušajte ponovno." });
      return;
    }
    setStanje({ vrsta: "salje" });
    try {
      const prijenos = await prenesiDatoteke("kontakt", datoteke, {
        turnstile: tsToken,
        web: String(fd.get("web") ?? ""),
        napredak: (postotak) => setStanje({ vrsta: "salje", postotak }),
      });
      if (!prijenos.ok) {
        setStanje({ vrsta: "greska", poruka: prijenos.poruka });
        return;
      }
      fd.set("oznaka", prijenos.oznaka);
      const res = await fetch("/api/kontakt/", { method: "POST", body: fd });
      const odg = await res.json().catch(() => null);
      if (res.ok && odg?.ok) {
        form.reset();
        setDatoteke([]);
        setStanje({ vrsta: "uspjeh" });
      } else {
        setStanje({ vrsta: "greska", poruka: odg?.poruka ?? `Poruka nije poslana. Pišite nam izravno na ${SITE.email}.` });
      }
    } catch {
      setStanje({ vrsta: "greska", poruka: "Veza s poslužiteljem nije uspjela. Pokušajte ponovno." });
    } finally {
      setTsToken("");
      setTsReset((n) => n + 1);
    }
  }

  if (stanje.vrsta === "uspjeh") {
    return (
      <div className="form-notice success" role="status">
        Hvala! Vaša poruka je poslana. Javit ćemo Vam se u najkraćem mogućem roku.
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={posalji} aria-label="Kontakt obrazac">
      <label>
        Ime i prezime *
        <input type="text" name="ime" required autoComplete="name" />
      </label>
      <label>
        E-mail *
        <input type="email" name="email" required autoComplete="email" />
      </label>
      <label>
        Poruka *
        <textarea name="poruka" rows={7} required />
      </label>
      <div className="field">
        <span className="field-label">Dokumenti za prijevod (neobavezno)</span>
        <DropZone datoteke={datoteke} onChange={setDatoteke} accept={DOZVOLJENO} maxMb={MAX_MB} />
      </div>
      {/* Zamka za robote: ljudi ovo polje ne vide. */}
      <input type="text" name="web" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
      <label className="checkbox">
        <input type="checkbox" name="privola" value="1" required />
        <span>
          Slažem se s obradom osobnih podataka u svrhu odgovora na upit (
          <Link href="/izjava-o-privatnosti/">izjava o privatnosti</Link>).
        </span>
      </label>
      <Turnstile onToken={setTsToken} resetKey={tsReset} />
      {stanje.vrsta === "greska" && (
        <div className="form-notice error" role="alert">
          {stanje.poruka}
        </div>
      )}
      <button className="btn" type="submit" disabled={stanje.vrsta === "salje"}>
        {stanje.vrsta === "salje" ? `Šaljem…${stanje.postotak ? ` ${stanje.postotak} %` : ""}` : "Pošalji"}
      </button>
    </form>
  );
}
