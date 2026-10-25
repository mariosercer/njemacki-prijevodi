-- Zalijepite u Supabase → SQL Editor → New query → Run.

-- Upiti s kontakt obrasca i upiti za ponudu iz kalkulatora
create table if not exists public.upiti (
  id uuid primary key,
  created_at timestamptz not null default now(),
  izvor text not null check (izvor in ('kontakt', 'ponuda')),
  ime text not null,
  email text not null,
  poruka text,
  podaci jsonb,
  datoteke text[] not null default '{}',
  ip_hash text
);

create index if not exists upiti_ip_vrijeme on public.upiti (ip_hash, created_at desc);

-- Pristup samo s poslužitelja (service role); javni ključ ne može čitati ni pisati.
alter table public.upiti enable row level security;

-- Privatni spremnik za dokumente koje šalju klijenti (najviše 25 MB po datoteci)
insert into storage.buckets (id, name, public, file_size_limit)
values ('privitci', 'privitci', false, 26214400)
on conflict (id) do nothing;
