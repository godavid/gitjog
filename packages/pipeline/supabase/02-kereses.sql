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
      j.hatalyos,
      -- A jogszabály-cím találat kiemelt rangot kap
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
      -- A kiemelést NEM HTML-ként adjuk vissza: a ts_headline nem escape-eli a
      -- bemenetét, így egy <script> a forrásszövegben átmenne rajta. Vezérlő-
      -- karakterekkel jelöljük a találatot (STX/ETX), a web ezekből épít <mark>
      -- elemet — így a React escape-el mindent, és az md.ts XSS-invariánsa áll.
      ts_headline('hungarian', sz.szoveg, l.tsq,
        'StartSel=' || chr(2) || ', StopSel=' || chr(3) ||
        ', MaxWords=45, MinWords=20, MaxFragments=1') as reszlet,
      sz.hatalyos,
      ts_rank_cd(sz.tsv, l.tsq, 2) as rang,
      sz.sorszam
    from szakasz sz
    join jogszabaly j on j.slug = sz.slug
    cross join lekerdezes l
    where sz.tsv @@ l.tsq
      and (mind or sz.hatalyos)
  ),
  egyesitett as (
    select * from jogszabaly_talalatok
    union all
    select * from szakasz_talalatok
  )
  -- A 2-es normalizáció (osztás a dokumentum hosszával) nélkülözhetetlen: enélkül
  -- a hosszú, szóismétléses mellékletek nyomják el a valódi §-okat. Füsttesztelve:
  -- "szerződést" normalizáció nélkül mellékleteket hoz, ezzel a Ptk. 6:96. §-át.
  select
    slug,
    megjeloles,
    rovidites,
    jogszabaly_cim,
    szakasz_cim,
    horgony,
    reszlet,
    hatalyos
  from egyesitett
  order by rang desc, slug, sorszam
  limit least(talalat_limit, 100);
$$;

grant execute on function kereses(text, boolean, int) to anon;
