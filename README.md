# njemacki-prijevodi.com

Web stranica Mario Šercer – stalni sudski tumač i prevoditelj za njemački jezik.
Next.js (App Router), hosting na Vercelu; forme i datoteke preko Supabasea (korak 2).

## Lokalno pokretanje

```bash
npm install
cp .env.example .env.local   # upišite lozinku i tajni ključ
npm run dev                  # http://localhost:3000
```

## Struktura

| Putanja | Sadržaj |
|---|---|
| `content/pages.json` | Tekstovi stranica i članaka (preneseno iz WordPressa) |
| `content/reviews.json` | Google recenzije prikazane na početnoj |
| `lib/site.ts` | Kontakt podaci, izbornik |
| `app/page.tsx` | Početna stranica |
| `app/[slug]/page.tsx` | Sve obične stranice i članci |
| `app/kontakt/`, `app/zanimljivosti/`, `app/vizitka/` | Posebne stranice |
| `app/izracun-cijene/` | Privatni kalkulator (zaštićen lozinkom) |
| `components/Kalkulator.tsx` | Omotač za `public/kalkulator/kalkulator.js` (isti kod kao WordPress plugin) |
| `public/uploads/` | Slike i datoteke (stare adrese `/storage/...` se preusmjeravaju ovamo) |
| `next.config.ts` | Preusmjeravanja sa starih WordPress adresa |

## Varijable okruženja (Vercel → Settings → Environment Variables)

- `PREVODITELJ_LOZINKA` – lozinka za /izracun-cijene/
- `SESSION_SECRET` – nasumični niz za potpis kolačića prijave

## Još nije spojeno (korak 2)

- Kontakt obrazac (`app/api/kontakt`) → Supabase tablica + Storage + e-mail obavijest
- Upit za ponudu iz kalkulatora (javni kalkulator je trenutno u testnom načinu i ništa ne šalje)
- Adobe pretvaranje u Word na privatnoj stranici (do tada radi pojednostavljeno pretvaranje u pregledniku)
