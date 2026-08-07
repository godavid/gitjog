-- Dedikált szerep a napi keresőindex-szinkronhoz.
--
-- MIÉRT: a szinkron a GitHub Actionsben fut, ahol a titok jelen van a
-- környezetben, miközben harmadik féltől származó npm-csomagok kódja is fut
-- (install + futtatás). Superuser connection stringgel egy kiszivárgás az
-- egész adatbázist megnyitná; ezzel a szereppel a kár a keresőindexre
-- korlátozódik, ami amúgy is bármikor újraépíthető.
--
-- A jelszót a hívó adja meg:
--   psql "$DB" -v szinkron_jelszo="'...'" -f 03-szinkron-szerep.sql

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'jogtar_szinkron') then
    create role jogtar_szinkron login;
  end if;
end
$$;

alter role jogtar_szinkron password :szinkron_jelszo;

grant usage on schema public to jogtar_szinkron;
grant select, insert, update, delete on jogszabaly, szakasz to jogtar_szinkron;
grant usage, select on sequence szakasz_id_seq to jogtar_szinkron;

-- A táblákon RLS van; a szinkron-szerep írási policyt kap (a superuser
-- megkerülné az RLS-t, ez a szerep nem). Olvasásra a meglévő policy elég.
drop policy if exists jogszabaly_szinkron on jogszabaly;
drop policy if exists szakasz_szinkron    on szakasz;
create policy jogszabaly_szinkron on jogszabaly for all to jogtar_szinkron
  using (true) with check (true);
create policy szakasz_szinkron    on szakasz    for all to jogtar_szinkron
  using (true) with check (true);
