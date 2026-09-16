-- Az API keresője: a kereses() rangsora és kiemelése, PLUSZ a § teljes szövege,
-- hogy az agent egy körben citálható találatot kapjon (ne kelljen külön
-- lekérnie a §-t). Idempotens; a prod DB-n kézzel kell alkalmazni
-- (docs/uzemeltetes.md → Keresés): a commitolás önmagában nem változtat semmit.

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
    select
      j.slug,
      j.megjeloles,
      j.rovidites,
      j.cim as jogszabaly_cim,
      ''::text as szakasz_cim,
      ''::text as horgony,
      ts_headline('hungarian', j.cim, l.tsq,
        'StartSel=' || chr(2) || ', StopSel=' || chr(3) ||
        ', MaxWords=45, MinWords=20, MaxFragments=1') as reszlet,
      ''::text as szoveg,
      j.hatalyos,
      ts_rank_cd(j.tsv, l.tsq, 2) * 1.5 as rang,
      0 as sorszam
    from jogszabaly j
    cross join lekerdezes l
    where j.tsv @@ l.tsq
      and (mind or j.hatalyos)
  ),
  szakasz_talalatok as (
    select
      sz.slug,
      j.megjeloles,
      j.rovidites,
      j.cim as jogszabaly_cim,
      sz.cim as szakasz_cim,
      sz.horgony,
      ts_headline('hungarian', sz.szoveg, l.tsq,
        'StartSel=' || chr(2) || ', StopSel=' || chr(3) ||
        ', MaxWords=45, MinWords=20, MaxFragments=1') as reszlet,
      sz.szoveg,
      sz.hatalyos,
      ts_rank_cd(sz.tsv, l.tsq, 2) as rang,
      sz.sorszam
    from szakasz sz
    join jogszabaly j on j.slug = sz.slug
    cross join lekerdezes l
    where sz.tsv @@ l.tsq
      and (mind or sz.hatalyos)
      and (
        sz.horgony <> ''
        or not exists (
          select 1
          from jogszabaly_talalatok jt
          where jt.slug = sz.slug
        )
      )
  ),
  egyesitett as (
    select * from jogszabaly_talalatok
    union all
    select * from szakasz_talalatok
  )
  select
    slug,
    megjeloles,
    rovidites,
    jogszabaly_cim,
    szakasz_cim,
    horgony,
    reszlet,
    szoveg,
    hatalyos
  from egyesitett
  order by rang desc, slug, sorszam
  limit least(talalat_limit, 40);
$$;

grant execute on function kereses_api(text, boolean, int) to anon;
