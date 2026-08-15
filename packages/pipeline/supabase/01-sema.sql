-- Keresőindex séma. Származtatott adat: bármikor eldobható és újraépíthető
-- a kereso-feltoltes.ts szkripttel. Az igazság forrása a magyar-jogtar repo.

create table if not exists jogszabaly (
  slug        text primary key,
  document_id text not null,
  megjeloles  text not null,
  cim         text not null,
  rovidites   text,
  hatalyos    boolean not null,
  tsv tsvector generated always as (
    setweight(to_tsvector('hungarian', coalesce(rovidites, '')), 'A') ||
    setweight(to_tsvector('hungarian', megjeloles), 'A') ||
    setweight(to_tsvector('hungarian', cim), 'B')
  ) stored
);

-- Létező tábla esetén a tsv oszlop idempotens hozzáadása
alter table jogszabaly add column if not exists tsv tsvector generated always as (
  setweight(to_tsvector('hungarian', coalesce(rovidites, '')), 'A') ||
  setweight(to_tsvector('hungarian', megjeloles), 'A') ||
  setweight(to_tsvector('hungarian', cim), 'B')
) stored;

create table if not exists szakasz (
  id       bigserial primary key,
  slug     text not null references jogszabaly(slug) on delete cascade,
  sorszam  int  not null,
  cim      text not null,
  horgony  text not null,
  szoveg   text not null,
  hatalyos boolean not null,
  -- FIGYELEM: a generált oszlop csak IMMUTABLE kifejezést fogad el. A
  -- to_tsvector KÉTARGUMENTUMOS alakja az; az egyargumentumos nem, mert a
  -- default_text_search_config-tól függ, és a tábla létrehozása elszáll tőle.
  tsv tsvector generated always as (
    setweight(to_tsvector('hungarian', cim), 'A') ||
    setweight(to_tsvector('hungarian', szoveg), 'B')
  ) stored
);

create index if not exists jogszabaly_tsv_idx on jogszabaly using gin (tsv);
create index if not exists szakasz_tsv_idx    on szakasz using gin (tsv);
create index if not exists szakasz_slug_idx   on szakasz (slug);

-- A web anon kulccsal OLVAS; írni csak a connection stringgel lehet.
alter table jogszabaly enable row level security;
alter table szakasz    enable row level security;

drop policy if exists jogszabaly_olvasas on jogszabaly;
drop policy if exists szakasz_olvasas    on szakasz;
create policy jogszabaly_olvasas on jogszabaly for select using (true);
create policy szakasz_olvasas    on szakasz    for select using (true);
