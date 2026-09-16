-- Keresés-gyorsítás: a kiemelést (ts_headline) csak a már rangsorolt és
-- limitált néhány sorra számoljuk, nem minden találatra. 2026-09-16-án a
-- „termőföld" lekérdezés 2,8 s volt (több ezer § kiemelése), az anon szerep
-- statement_timeout-ja 3 s → a webes kereső 500-zal esett el („átmenetileg
-- nem elérhető"). Idempotens; a prod DB-n kézzel kell alkalmazni.

create or replace function kereses(
  q text,
  mind boolean default false,
  talalat_limit int default 40
)
returns table (
  slug text,
  megjeloles text,
  rovidites text,
  jogszabaly_cim text,
  szakasz_cim text,
  horgony text,
  reszlet text,
  hatalyos boolean
)
language sql
stable
as $$
  with lekerdezes as (select websearch_to_tsquery('hungarian', q) as tsq),
  jogszabaly_talalatok as (
    select j.slug, 0::bigint as szakasz_id, ts_rank_cd(j.tsv, l.tsq, 2) * 1.5 as rang, 0 as sorszam
    from jogszabaly j cross join lekerdezes l
    where j.tsv @@ l.tsq and (mind or j.hatalyos)
  ),
  szakasz_talalatok as (
    select sz.slug, sz.id as szakasz_id, ts_rank_cd(sz.tsv, l.tsq, 2) as rang, sz.sorszam
    from szakasz sz cross join lekerdezes l
    where sz.tsv @@ l.tsq
      and (mind or sz.hatalyos)
      and (sz.horgony <> '' or not exists (select 1 from jogszabaly_talalatok jt where jt.slug = sz.slug))
  ),
  kivalasztott as (
    select * from (
      select * from jogszabaly_talalatok
      union all
      select * from szakasz_talalatok
    ) e
    order by rang desc, slug, sorszam
    limit least(talalat_limit, 100)
  )
  select
    j.slug,
    j.megjeloles,
    j.rovidites,
    j.cim as jogszabaly_cim,
    coalesce(sz.cim, '') as szakasz_cim,
    coalesce(sz.horgony, '') as horgony,
    ts_headline('hungarian', coalesce(sz.szoveg, j.cim), l.tsq,
      'StartSel=' || chr(2) || ', StopSel=' || chr(3) ||
      ', MaxWords=45, MinWords=20, MaxFragments=1') as reszlet,
    coalesce(sz.hatalyos, j.hatalyos) as hatalyos
  from kivalasztott k
  join jogszabaly j on j.slug = k.slug
  left join szakasz sz on sz.id = k.szakasz_id
  cross join lekerdezes l
  order by k.rang desc, k.slug, k.sorszam;
$$;

grant execute on function kereses(text, boolean, int) to anon;

create or replace function kereses_api(
  q text,
  mind boolean default false,
  talalat_limit int default 10
)
returns table (
  slug text,
  megjeloles text,
  rovidites text,
  jogszabaly_cim text,
  szakasz_cim text,
  horgony text,
  reszlet text,
  szoveg text,
  hatalyos boolean
)
language sql
stable
as $$
  with lekerdezes as (select websearch_to_tsquery('hungarian', q) as tsq),
  jogszabaly_talalatok as (
    select j.slug, 0::bigint as szakasz_id, ts_rank_cd(j.tsv, l.tsq, 2) * 1.5 as rang, 0 as sorszam
    from jogszabaly j cross join lekerdezes l
    where j.tsv @@ l.tsq and (mind or j.hatalyos)
  ),
  szakasz_talalatok as (
    select sz.slug, sz.id as szakasz_id, ts_rank_cd(sz.tsv, l.tsq, 2) as rang, sz.sorszam
    from szakasz sz cross join lekerdezes l
    where sz.tsv @@ l.tsq
      and (mind or sz.hatalyos)
      and (sz.horgony <> '' or not exists (select 1 from jogszabaly_talalatok jt where jt.slug = sz.slug))
  ),
  kivalasztott as (
    select * from (
      select * from jogszabaly_talalatok
      union all
      select * from szakasz_talalatok
    ) e
    order by rang desc, slug, sorszam
    limit least(talalat_limit, 40)
  )
  select
    j.slug,
    j.megjeloles,
    j.rovidites,
    j.cim as jogszabaly_cim,
    coalesce(sz.cim, '') as szakasz_cim,
    coalesce(sz.horgony, '') as horgony,
    ts_headline('hungarian', coalesce(sz.szoveg, j.cim), l.tsq,
      'StartSel=' || chr(2) || ', StopSel=' || chr(3) ||
      ', MaxWords=45, MinWords=20, MaxFragments=1') as reszlet,
    coalesce(sz.szoveg, '') as szoveg,
    coalesce(sz.hatalyos, j.hatalyos) as hatalyos
  from kivalasztott k
  join jogszabaly j on j.slug = k.slug
  left join szakasz sz on sz.id = k.szakasz_id
  cross join lekerdezes l
  order by k.rang desc, k.slug, k.sorszam;
$$;

grant execute on function kereses_api(text, boolean, int) to anon;
