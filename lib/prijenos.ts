// Prijenos datoteka iz preglednika izravno u Supabase Storage (isti postupak koristi i kalkulator.js).

export type Prijenos = { ok: true; oznaka: string } | { ok: false; poruka: string };

function posaljiDatoteku(url: string, datoteka: File, napredak: (poslano: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const fd = new FormData();
    fd.append("cacheControl", "3600");
    fd.append("", datoteka);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && napredak(e.loaded);
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(fd);
  });
}

export async function prenesiDatoteke(
  izvor: "kontakt" | "ponuda",
  datoteke: File[],
  opcije: { turnstile?: string; web?: string; napredak?: (postotak: number) => void } = {},
): Promise<Prijenos> {
  const res = await fetch("/api/prijenos/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      izvor,
      turnstile: opcije.turnstile,
      web: opcije.web,
      datoteke: datoteke.map((d) => ({ ime: d.name, velicina: d.size })),
    }),
  });
  const odg = await res.json().catch(() => null);
  if (!res.ok || !odg?.ok) return { ok: false, poruka: odg?.poruka ?? "Slanje trenutno nije moguće." };

  const ukupno = datoteke.reduce((s, d) => s + d.size, 0) || 1;
  const poslano = datoteke.map(() => 0);
  for (let i = 0; i < datoteke.length; i++) {
    const ok = await posaljiDatoteku(odg.prijenosi[i].url, datoteke[i], (n) => {
      poslano[i] = n;
      opcije.napredak?.(Math.round((poslano.reduce((a, b) => a + b, 0) / ukupno) * 100));
    });
    if (!ok) return { ok: false, poruka: `Datoteka „${datoteke[i].name}” nije poslana. Pokušajte ponovno.` };
  }
  return { ok: true, oznaka: odg.oznaka };
}
