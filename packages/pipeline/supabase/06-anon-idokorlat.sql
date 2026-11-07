-- Az anon szerep lekérdezési időkorlátja a keresési API-hoz (kereses, kereses_api).
-- A webes kereső és a REST/MCP végpontok az anon szereppel futnak; egy elszálló
-- lekérdezés (2026-09-16: „termőföld", 2,8 s kiemeléssel) ne tartsa fogva a DB-t.
-- Az élő DB-n a korlát eddig csak kézi beállításként élt; ez a fájl az igazságforrása.
-- A `8s` érték <!-- INFERRED: verify --> : a tulajdonos ellenőrizze az élő DB-n a
--   select rolconfig from pg_roles where rolname = 'anon';
-- lekérdezéssel, és igazítsa ide, ha eltér.
-- Idempotens, újrafuttatható (mint 01-05); keresési függvényt nem érint, ezért a
-- 02 és 04 fájlokat NEM kell (és nem is szabad önállóan) újrafuttatni.
-- Futtatás a superuser pooler-stringgel:
--   psql "<superuser pooler-string>" -v ON_ERROR_STOP=1 -f 06-anon-idokorlat.sql

alter role anon set statement_timeout = '8s';
notify pgrst, 'reload config';
