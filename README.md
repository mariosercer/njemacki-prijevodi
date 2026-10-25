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

## Upiti (kontakt obrazac i upit za ponudu)

1. Preglednik pošalje popis datoteka na `/api/prijenos` → provjera (zamka za robote, Turnstile, najviše 10 upita na sat po IP-u, vrste i veličina datoteka) i potpisane adrese za prijenos.
2. Datoteke idu izravno u Supabase Storage (spremnik `privitci`), jer Vercel ne prima zahtjeve veće od 4,5 MB.
3. `/api/kontakt` ili `/api/ponuda` sprema upit u tablicu `upiti` i šalje obavijest (Resend) s poveznicama na datoteke (vrijede 30 dana).

Shema baze: `supabase/schema.sql` (zalijepiti u Supabase → SQL Editor).

## Varijable okruženja (Vercel → Settings → Environment Variables)

Popis i opis: `.env.example`.

## Još nije spojeno

- Adobe pretvaranje u Word na privatnoj stranici (do tada radi pojednostavljeno pretvaranje u pregledniku)
