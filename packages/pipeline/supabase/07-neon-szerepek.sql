-- Szerepek a Neon Postgreshez (2026-11-19-i költözés a Supabase-ről). A Neonon
-- nincs `anon` szerep és nincs PostgREST, ezért a web közvetlenül, a saját
-- csak olvasó szerepével kapcsolódik; a 05 `grant ... to anon` sorai Neonon
-- nem futtathatók (hagyd ki őket, vagy a 01–05 helyett pg_dump/pg_restore).
--
-- A jelszavakat a hívó adja meg, a fájl nem tartalmaz titkot:
--   psql "<neondb_owner direkt string>" -v ON_ERROR_STOP=1 \
--     -v olvaso_jelszo="'...'" -v szinkron_jelszo="'...'" -f 07-neon-szerepek.sql
-- Újrafuttatható; jelszócserénél a Vercel KERESO_DB_URL és a GitHub NYILT_DB_URL
-- secretet is cserélni kell.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gitjog_olvaso') then
    create role gitjog_olvaso login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'jogtar_szinkron') then
    create role jogtar_szinkron login;
  end if;
end
$$;

alter role gitjog_olvaso password :olvaso_jelszo;
alter role jogtar_szinkron password :szinkron_jelszo;

-- A web csak olvas. A 05 kiemelése miatt egy elszálló lekérdezés 8 s után megáll
-- (a Supabase `anon` szerep korlátja volt, a 06-anon-idokorlat.sql).
alter role gitjog_olvaso set statement_timeout = '8s';
grant usage on schema public to gitjog_olvaso;
grant select on jogszabaly, szakasz to gitjog_olvaso;
grant execute on function kereses(text, boolean, int) to gitjog_olvaso;
grant execute on function kereses_api(text, boolean, int) to gitjog_olvaso;

-- A napi szinkron: ugyanaz, mint a 03-szinkron-szerep.sql (a policyk a dumpban
-- és a 01/03 futtatásakor már megvannak; itt csak a jogosultságok).
grant usage on schema public to jogtar_szinkron;
grant select, insert, update, delete on jogszabaly, szakasz to jogtar_szinkron;
grant usage, select on sequence szakasz_id_seq to jogtar_szinkron;
