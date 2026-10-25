"use client";

import { useRef, useState } from "react";

function velicina(b: number) {
  return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Polje za dokumente: povlačenje mišem ili odabir s računala, s popisom i uklanjanjem datoteka. */
export default function DropZone({
  datoteke,
  onChange,
  accept,
  maxMb,
}: {
  datoteke: File[];
  onChange: (d: File[]) => void;
  accept: string;
  maxMb: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [iznad, setIznad] = useState(false);
  const dozvoljene = accept.split(",").map((e) => e.trim().toLowerCase());

  function dodaj(nove: FileList | null) {
    if (!nove) return;
    const ok = Array.from(nove).filter((f) => dozvoljene.some((e) => f.name.toLowerCase().endsWith(e)));
    // Ista datoteka (ime i veličina) ne dodaje se dvaput.
    const sve = [...datoteke];
    ok.forEach((f) => {
      if (!sve.some((d) => d.name === f.name && d.size === f.size)) sve.push(f);
    });
    onChange(sve);
  }

  const ukupno = datoteke.reduce((s, f) => s + f.size, 0);

  return (
    <div className="dropzone-wrap">
      <div
        className={`dropzone${iznad ? " is-over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          setIznad(true);
        }}
        onDragLeave={() => setIznad(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIznad(false);
          dodaj(e.dataTransfer.files);
        }}
      >
        <svg viewBox="0 0 48 60" width="34" height="42" aria-hidden="true">
          <path d="M2 2h30l14 14v42H2z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M32 2v14h14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M24 46V26m-8 8 8-8 8 8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="dropzone-title">Povucite dokumente u ovo polje</span>
        <span>
          ili <span className="dropzone-link">odaberite datoteke s računala</span>
        </span>
        <span className="dropzone-info">
          PDF, Word, Excel, slike, ZIP/RAR – najviše {maxMb} MB ukupno
        </span>
        <input
          ref={input}
          type="file"
          multiple
          accept={accept}
          hidden
          onChange={(e) => {
            dodaj(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {datoteke.length > 0 && (
        <ul className="dropzone-list">
          {datoteke.map((f, i) => (
            <li key={f.name + f.size}>
              <span className="dropzone-name">{f.name}</span>
              <span className="dropzone-size">{velicina(f.size)}</span>
              <button
                type="button"
                aria-label={`Ukloni ${f.name}`}
                onClick={() => onChange(datoteke.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
          <li className={`dropzone-total${ukupno > maxMb * 1024 * 1024 ? " is-error" : ""}`}>
            Ukupno: {velicina(ukupno)} od {maxMb} MB
          </li>
        </ul>
      )}
    </div>
  );
}
