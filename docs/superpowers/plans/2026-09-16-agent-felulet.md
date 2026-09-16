# Agent-felület — kivitelezési terv

Spec: `docs/superpowers/specs/2026-09-16-agent-felulet-design.md`. Ág: `agent-felulet`.
Minden lépés végén: tesztek zöldek (`dev-budget run --kind heavy -- pnpm -r test`), a
web `next build` átmegy. A deploy CLI-ből (`cd apps/web && vercel --prod --yes`), utána
füstteszt.

## 1. `packages/szoveg` megosztott csomag
- [ ] `package.json` (`@gitjog/szoveg`, `type: module`, `exports: ./src/index.ts`, dep: `diff`), `tsconfig.json` (a base-ből)
- [ ] `src/szakaszok.ts` ← `packages/pipeline/src/szakaszok.ts` (változatlan tartalom)
- [ ] `src/sor-diff.ts` ← `apps/web/lib/valtozas.ts` (`valtozasSzamitas`, típusok)
- [ ] `src/hivatkozas.ts`: `hivatkozasParse(q)` → `{megjeloles?, rovidites?, paragrafus?} | null`; római→arab a pipeline `romai.ts`-éből (átköltözik ide)
- [ ] `src/szakasz-diff.ts`: `szakaszDiff(regiMd, ujMd, {csonkolas?})`
- [ ] `src/index.ts` re-export
- [ ] tesztek: `szakaszok.test.ts` (költözik), `romai.test.ts` (költözik), új `hivatkozas.test.ts`, `szakasz-diff.test.ts`
- [ ] pipeline: `szakaszok`/`romai` importok `@gitjog/szoveg`-re; a régi fájlok törlése
- [ ] web: `md.ts` `horgonyId` import a csomagból; `valtozas.ts` re-export vagy import-csere; `next.config.ts` `transpilePackages: ["@gitjog/szoveg"]`

## 2. Pipeline: felvételi napló + AGENTS.md
- [ ] `src/felvetel.ts`: `naploFajl(futas)`, `naploSorok(futas, tetelek)`; teszt
- [ ] `delta.ts`: az index-utócommit előtt a bekerült (slug, datum, sha) sorok hozzáfűzése
- [ ] `sablonok.ts`: `AGENTS_MD`; `delta.ts` kiírja (`fajlIras("AGENTS.md", …)`) az utócommit előtt
- [ ] a `napi-delta.yml` forráspéldánya NEM változik (a webhook a repo push-eseményén él)

## 3. Web: szolgáltatásréteg, REST, MCP, webhook
- [ ] deps: `mcp-handler@^2.1`, `@modelcontextprotocol/server@^2`, `zod@^4.2`, `@gitjog/szoveg: workspace:*`
- [ ] `lib/adat.ts`: `tags: ["adat-repo"]` a `napi` fetch-eken és az `unstable_cache`-eken; `getFelvetelNaplo(honap)` (havi jsonl, `napi` mód)
- [ ] `lib/api/kozos.ts`: limitek, `ApiHiba` (status + üzenet), URL-építők, `csonkol()`
- [ ] `lib/api/kereses.ts`: hivatkozás-ág (index) + FTS-ág (új SQL függvény `kereses_api`, teljes `szoveg`-gel)
- [ ] `lib/api/szakasz.ts`: § egy időállapotban / meta+tartalomjegyzék
- [ ] `lib/api/diff.ts`: két dátum → §-diff
- [ ] `lib/api/valtozasok.ts`: napló-ág (`felveve_utan`) és `since`-ág, szűrők, §-diff korlátozva
- [ ] `app/api/v1/{kereses,szakasz,valtozasok,diff}/route.ts`: paraméter-validálás (zod), `Cache-Control`, hibák JSON-ban
- [ ] `app/api/v1/openapi.json/route.ts`
- [ ] `app/api/mcp/route.ts`: 4 tool + `search`/`fetch`, `serverInfo`, `instructions`
- [ ] `app/api/revalidate/route.ts`: HMAC (`GITHUB_WEBHOOK_SECRET`), `revalidateTag("adat-repo","max")`
- [ ] `robots.ts`: `/api/` disallow (nincs mit indexelni)

## 4. SQL
- [ ] `packages/pipeline/supabase/04-api-kereses.sql`: `kereses_api(q, mind, talalat_limit)` — mint `kereses()`, plusz `szoveg` oszlop; `grant execute … to anon`
- [ ] alkalmazás a prod DB-n a pooler-stringgel (`psql -v ON_ERROR_STOP=1 -f`)

## 5. Dokumentáció és termékrekord
- [ ] `llms.txt`: „MCP és API" szakasz + változásfigyelő recept
- [ ] `/adatok` oldal: gépi felület szakasz
- [ ] `PRODUCT.md`: terjesztési döntés frissítése (MCP registry + fejlesztői csatornák), gépi felület állapota
- [ ] `docs/uzemeltetes.md`: API/MCP, webhook, SQL-alkalmazás, registry-publikálás, napló
- [ ] `server.json` a repo gyökerében

## 6. Kiadás és ellenőrzés
- [ ] tesztek + build (dev-budget)
- [ ] PR → merge main (a CI a gitjog main-t klónozza)
- [ ] Vercel env `GITHUB_WEBHOOK_SECRET` (generált), `vercel --prod --yes`
- [ ] GitHub webhook a `godavid/magyar-jog`-on (`gh api repos/…/hooks`), push-event, ugyanaz a secret
- [ ] füstteszt: REST ×4, openapi, MCP initialize + tools/list, revalidate 401
- [ ] `mcp-publisher` telepítés (brew), `server.json` validálás; a `login github` + `publish` a felhasználóé
- [ ] napi routine (`/schedule`) a földjog-figyelésre a `valtozasok` végponttal
- [ ] memória: marketing-döntés változása, új végpontok, üzemeltetési csapdák
