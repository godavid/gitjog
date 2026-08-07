-- Teljes szövegű keresés. A websearch_to_tsquery adja készen a webes
-- keresőszintaxist: több szó = AND, "idézőjel" = pontos kifejezés,
-- -mínusz = kizárás.

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
  with lekerdezes as (select websearch_to_tsquery('hungarian', q) as tsq)
  select
    sz.slug,
    j.megjeloles,
    j.rovidites,
    j.cim as jogszabaly_cim,
    sz.cim as szakasz_cim,
    sz.horgony,
    ts_headline('hungarian', sz.szoveg, l.tsq,
      'StartSel=<mark>, StopSel=</mark>, MaxWords=45, MinWords=20, MaxFragments=1'),
    sz.hatalyos
  from szakasz sz
  join jogszabaly j on j.slug = sz.slug
  cross join lekerdezes l
  where sz.tsv @@ l.tsq
    and (mind or sz.hatalyos)
  order by ts_rank_cd(sz.tsv, l.tsq) desc, sz.slug, sz.sorszam
  limit least(talalat_limit, 100);
$$;

grant execute on function kereses(text, boolean, int) to anon;
