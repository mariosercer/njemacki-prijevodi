-- Zalijepite u Supabase → SQL Editor → New query → Run (dodatak za Adobe pretvaranje u Word).

create table if not exists public.pretvorbe (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stanje text not null default 'radi' check (stanje in ('radi', 'gotovo', 'greska')),
  ime text not null,
  jezik text not null,
  ocr boolean not null default false,
  -- Adobe: preostali koraci, trenutni dokumenti (asset ID) i posao koji se izvodi
  koraci jsonb not null default '[]',
  dokumenti jsonb not null default '[]',
  posao text,
  operacije integer not null default 0,
  rezultat text,
  poruka text
);

create index if not exists pretvorbe_vrijeme on public.pretvorbe (created_at desc);

alter table public.pretvorbe enable row level security;
