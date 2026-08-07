# Teljes szövegű keresés — implementációs terv

> **Ügynök-munkatársnak:** KÖTELEZŐ AL-SKILL: `superpowers:subagent-driven-development` (ajánlott) vagy `superpowers:executing-plans` a terv taskonkénti végrehajtásához. A lépések checkbox (`- [ ]`) jelöléssel követhetők.

**Cél:** A weboldal keresője a 37 kiemelt törvény helyett mind a 4332 törvény hatályos szövegében keressen, magyar szótövezéssel.

**Architektúra:** Az adat-repo marad az igazság forrása; a Supabase Postgres egy származtatott, bármikor újraépíthető index. A markdown → §-szakasz bontás a pipeline-ba kerül, a web csak lekérdez egy `kereses()` adatbázisfüggvényt.

**Tech stack:** TypeScript (ESM, Node 24) · PostgreSQL FTS (`hungarian` konfiguráció, GIN index) · `postgres` (postgres.js) a pipeline-ban · `@supabase/supabase-js` a webben · vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-teljes-szoveges-kereses-design.md`

## Globális megkötések

- **Minden azonosító, komment, commit-üzenet és felhasználói szöveg MAGYAR.** A repó végig így íródott.
- **ESM:** minden relatív import `.js` kiterjesztésű a TS forrásban (`import { x } from "./y.js"`).
- **Determinizmus:** azonos bemenet → byte-azonos kimenet. A diff-minőség ezen áll.
- **Horgony-invariáns:** a keresőtalálat `horgony` mezője BIT SZERINT egyezzen azzal az `id`-vel, amit az `apps/web/lib/md.ts` `mdRender()`-e generál ugyanarra a szövegre — beleértve az ismétlődő címek `-2`, `-3` utótagos ütközésfeloldását. Enélkül a mélylink rossz §-ra visz.
- **A napi delta soha nem bukhat el az index-szinkron miatt.** Az adat-repo integritása előbbre való a keresőnél.
- **Nincs `any` típus.** Az adatalakokhoz `interface` a fájl tetején.
- Tesztfuttatás: `pnpm --filter @nyilt-jogtar/pipeline test` · típusellenőrzés: `cd packages/pipeline && npx tsc --noEmit`

## Fájlszerkezet

| Fájl | Felelősség |
|---|---|
| `packages/pipeline/src/szakaszok.ts` (új) | markdown → §-szakaszok, horgony-generálás ütközésfeloldással |
| `packages/pipeline/test/szakaszok.test.ts` (új) | a bontás és a horgony-invariáns tesztjei |
| `packages/pipeline/supabase/01-sema.sql` (új) | táblák, GIN index, RLS |
| `packages/pipeline/supabase/02-kereses.sql` (új) | a `kereses()` függvény |
| `packages/pipeline/src/kereso-index.ts` (új) | feltöltés/szinkron a Postgresbe |
| `packages/pipeline/src/kereso-feltoltes.ts` (új) | CLI a teljes újraépítéshez |
| `packages/pipeline/src/delta.ts` (mód.) | szinkron a push után, külön hibaágon |
| `apps/web/lib/kereso.ts` (átírás) | MiniSearch helyett Supabase RPC |
| `apps/web/app/kereses/page.tsx` (mód.) | „hatálytalanban is" kapcsoló, jelölés |
| `docs/uzemeltetes.md` (mód.) | titkok, keresőindex, újraépítési recept |

---

### Task 1: Szakaszokra bontó modul a pipeline-ban

A mai bontó az `apps/web/lib/kereso.ts:32` `szakaszokraBont()`-ja. Két hibája van, amit itt javítunk: (1) nem oldja fel a horgony-ütközéseket, (2) teljesen fedetlen teszttel.

**Files:**
- Create: `packages/pipeline/src/szakaszok.ts`
- Create: `packages/pipeline/test/szakaszok.test.ts`

**Interfaces:**
- Consumes: semmit (ez az első task)
- Produces: `horgonyId(cim: string): string` · `szakaszokraBont(md: string): Szakasz[]` · `interface Szakasz { sorszam: number; cim: string; horgony: string; szoveg: string }`

- [ ] **1. lépés: Írd meg a bukó tesztet**

`packages/pipeline/test/szakaszok.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { horgonyId, szakaszokraBont } from "../src/szakaszok.js";
import { mdRender } from "../../../apps/web/lib/md.js";

describe("horgonyId", () => {
  it("§ jelet 'sz'-re cserél és ékezetet bont", () => {
    expect(horgonyId("6:272. § [Megbízási szerződés]")).toBe("6-272-sz-megbizasi-szerzodes");
  });
  it("80 karakterre vág", () => {
    expect(horgonyId("a".repeat(200)).length).toBe(80);
  });
});

describe("szakaszokraBont", () => {
  it("heading szerint bont, a heading elé eső szöveget eldobja", () => {
    const sz = szakaszokraBont("# Cím\nbevezető\n## Első\nalfa\n## Második\nbéta");
    expect(sz.map((s) => s.cim)).toEqual(["Első", "Második"]);
    expect(sz[0]!.szoveg).toBe("alfa");
  });
  it("sorszámoz a törvényen belül", () => {
    const sz = szakaszokraBont("## A\nx\n## B\ny");
    expect(sz.map((s) => s.sorszam)).toEqual([1, 2]);
  });
  it("üres szakaszt nem ad vissza", () => {
    expect(szakaszokraBont("## Üres\n## Van\nszöveg").map((s) => s.cim)).toEqual(["Van"]);
  });
  it("táblázat-elválasztót kihagy, cellákat összefűz", () => {
    const sz = szakaszokraBont("## T\n| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(sz[0]!.szoveg).toBe("a · b 1 · 2");
  });
  it("listajelet levág", () => {
    expect(szakaszokraBont("## L\n- első\n- második")[0]!.szoveg).toBe("első második");
  });

  // A HORGONY-INVARIÁNS: a bontó és a megjelenítő ugyanazt az id-t adja.
  it("ismétlődő címnél ugyanazt a horgonyt adja, mint az mdRender", () => {
    const md = "## Értelmező rendelkezések\nalfa\n## Értelmező rendelkezések\nbéta";
    const sz = szakaszokraBont(md);
    const { jegyzek } = mdRender(md);
    expect(sz.map((s) => s.horgony)).toEqual(jegyzek.map((j) => j.id));
    expect(sz[1]!.horgony).toBe("ertelmezo-rendelkezesek-2");
  });
  it("vegyes szintű headingeknél is egyezik a horgony az mdRenderrel", () => {
    const md = "## Fejezet\nx\n### Alcím\ny\n#### 1. §\nz\n#### 1. §\nw";
    const sz = szakaszokraBont(md);
    const { jegyzek } = mdRender(md);
    expect(sz.map((s) => s.horgony)).toEqual(jegyzek.map((j) => j.id));
  });
});
```

- [ ] **2. lépés: Futtasd, győződj meg róla, hogy bukik**

Futtatás: `pnpm --filter @nyilt-jogtar/pipeline exec vitest run test/szakaszok.test.ts`
Várt: FAIL — `Cannot find module '../src/szakaszok.js'`

- [ ] **3. lépés: Írd meg a modult**

`packages/pipeline/src/szakaszok.ts`:

```ts
// Markdown → §-szintű szakaszok a keresőindexhez.
//
// A horgony-generálásnak BIT SZERINT egyeznie kell az apps/web/lib/md.ts
// mdRender()-ével (ismétlődő címek -2, -3 utótagos ütközésfeloldásával
// együtt), különben a találat mélylinkje rossz §-ra visz. Ezt az invariánst
// a test/szakaszok.test.ts őrzi: mindkét implementációt ugyanarra a
// bemenetre futtatja és összeveti.

export interface Szakasz {
  /** sorrend a törvényen belül, 1-től */
  sorszam: number;
  /** a szakasz címe, pl. "6:272. § [Megbízási szerződés]" */
  cim: string;
  /** URL-fragment a mélylinkhez */
  horgony: string;
  /** a szakasz sima szövege, kereséshez normalizálva */
  szoveg: string;
}

export function horgonyId(cim: string): string {
  return cim
    .toLowerCase()
    .replace(/§/g, "sz")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function szakaszokraBont(md: string): Szakasz[] {
  const szakaszok: Szakasz[] = [];
  const hasznaltIdk = new Map<string, number>(); // ütközésfeloldás, mint az mdRenderben
  let cim = "";
  let horgony = "";
  let sorok: string[] = [];
  let sorszam = 0;

  const lezar = () => {
    const szoveg = sorok.join(" ").trim();
    if (cim && szoveg) szakaszok.push({ sorszam: ++sorszam, cim, horgony, szoveg });
    sorok = [];
  };

  for (const sor of md.split("\n")) {
    const h = sor.match(/^#{2,4} (.+)$/);
    if (h) {
      lezar();
      cim = h[1]!;
      const alap = horgonyId(cim);
      const eddig = hasznaltIdk.get(alap) ?? 0;
      hasznaltIdk.set(alap, eddig + 1);
      horgony = eddig === 0 ? alap : `${alap}-${eddig + 1}`;
      continue;
    }
    if (!sor || sor.startsWith("# ")) continue;
    if (/^\|(?: *:?-{3,}:? *\|)+ *$/.test(sor)) continue; // táblázat-elválasztó
    sorok.push(
      sor.startsWith("| ")
        ? sor.replace(/^\| | \|$/g, "").split(" | ").join(" · ")
        : sor.replace(/^ *- /, ""),
    );
  }
  lezar();
  return szakaszok;
}
```

- [ ] **4. lépés: Futtasd, győződj meg róla, hogy zöld**

Futtatás: `pnpm --filter @nyilt-jogtar/pipeline exec vitest run test/szakaszok.test.ts`
Várt: PASS, 9 teszt.

Ha a horgony-invariáns teszt bukik: az `mdRender` MINDEN `##`–`####` headinget beszámít az ütközés-számlálóba, tehát a `hasznaltIdk` frissítésének a bontóban is minden headingnél meg kell történnie — akkor is, ha a szakasz üres lesz és nem kerül a kimenetbe.

- [ ] **5. lépés: Típusellenőrzés és commit**

```bash
cd packages/pipeline && npx tsc --noEmit && cd ../..
git add packages/pipeline/src/szakaszok.ts packages/pipeline/test/szakaszok.test.ts
git commit -m "Szakaszokra bontó modul a keresőindexhez, horgony-invariáns teszttel"
```

---

### Task 2: SQL séma és keresőfüggvény

**Files:**
- Create: `packages/pipeline/supabase/01-sema.sql`
- Create: `packages/pipeline/supabase/02-kereses.sql`

**Interfaces:**
- Consumes: semmit
- Produces: `jogszabaly` és `szakasz` tábla · `kereses(q text, mind boolean, talalat_limit int)` függvény, amely `slug, megjeloles, rovidites, jogszabaly_cim, szakasz_cim, horgony, reszlet, hatalyos` oszlopokat ad vissza

- [ ] **1. lépés: Írd meg a sémát**

`packages/pipeline/supabase/01-sema.sql`:

```sql
-- Keresőindex séma. Származtatott adat: bármikor eldobható és újraépíthető
-- a kereso-feltoltes.ts szkripttel. Az igazság forrása a magyar-jogtar repo.

create table if not exists jogszabaly (
  slug        text primary key,
  document_id text not null,
  megjeloles  text not null,
  cim         text not null,
  rovidites   text,
  hatalyos    boolean not null
);

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

create index if not exists szakasz_tsv_idx  on szakasz using gin (tsv);
create index if not exists szakasz_slug_idx on szakasz (slug);

-- A web anon kulccsal OLVAS; írni csak a connection stringgel lehet.
alter table jogszabaly enable row level security;
alter table szakasz    enable row level security;

drop policy if exists jogszabaly_olvasas on jogszabaly;
drop policy if exists szakasz_olvasas    on szakasz;
create policy jogszabaly_olvasas on jogszabaly for select using (true);
create policy szakasz_olvasas    on szakasz    for select using (true);
```

- [ ] **2. lépés: Írd meg a keresőfüggvényt**

`packages/pipeline/supabase/02-kereses.sql`:

```sql
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
```

- [ ] **3. lépés: Futtasd le a Supabase SQL-szerkesztőjében**

Sorrend: `01-sema.sql`, majd `02-kereses.sql`. Mindkettő újrafuttatható.

Ellenőrzés ugyanott:

```sql
select to_tsvector('hungarian', 'a megbízási szerződést felmondta');
-- Várt: a "szerződést" töve 'szerződ' alakban jelenik meg, tehát a
-- magyar szótövező aktív. Ha nem: hiányzik a hungarian konfiguráció.
```

- [ ] **4. lépés: Commit**

```bash
git add packages/pipeline/supabase/
git commit -m "Keresőindex SQL: séma, GIN index, RLS és a kereses() függvény"
```

---

### Task 3: Feltöltő és szinkronizáló modul

**Files:**
- Create: `packages/pipeline/src/kereso-index.ts`
- Create: `packages/pipeline/src/kereso-feltoltes.ts`
- Create: `packages/pipeline/test/kereso-index.test.ts`
- Modify: `packages/pipeline/package.json` (függőség + script)

**Interfaces:**
- Consumes: `szakaszokraBont`, `Szakasz` (Task 1)
- Produces: `szakaszSorok(tetel, md, hatalyos): SzakaszSor[]` · `szinkronizal(sql, slugok, forras): Promise<number>` · `interface SzakaszSor { slug, sorszam, cim, horgony, szoveg, hatalyos }`

- [ ] **1. lépés: Vedd fel a függőséget és a scriptet**

```bash
pnpm --filter @nyilt-jogtar/pipeline add postgres
```

A `packages/pipeline/package.json` `scripts` blokkjába:

```json
"kereso-feltoltes": "tsx src/kereso-feltoltes.ts",
```

- [ ] **2. lépés: Írd meg a bukó tesztet**

`packages/pipeline/test/kereso-index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { szakaszSorok } from "../src/kereso-index.js";

const TETEL = {
  slug: "2013-evi-v-torveny-ptk",
  documentId: "2013-5-00-00",
  megjeloles: "2013. évi V. törvény",
  cim: "a Polgári Törvénykönyvről",
  rovidites: "Ptk.",
};

describe("szakaszSorok", () => {
  it("a jogszabály slugját és hatályosságát minden sorra ráteszi", () => {
    const sorok = szakaszSorok(TETEL, "## A\nalfa\n## B\nbéta", true);
    expect(sorok).toHaveLength(2);
    expect(sorok.every((s) => s.slug === TETEL.slug && s.hatalyos)).toBe(true);
  });
  it("hatálytalan jogszabálynál minden sor hatalyos=false", () => {
    const sorok = szakaszSorok(TETEL, "## A\nalfa", false);
    expect(sorok[0]!.hatalyos).toBe(false);
  });
  it("üres szövegre üres listát ad (nem dob)", () => {
    expect(szakaszSorok(TETEL, "", true)).toEqual([]);
  });
  it("megőrzi a szakaszok sorrendjét", () => {
    const sorok = szakaszSorok(TETEL, "## A\nx\n## B\ny\n## C\nz", true);
    expect(sorok.map((s) => s.sorszam)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **3. lépés: Futtasd, győződj meg róla, hogy bukik**

Futtatás: `pnpm --filter @nyilt-jogtar/pipeline exec vitest run test/kereso-index.test.ts`
Várt: FAIL — `Cannot find module '../src/kereso-index.js'`

- [ ] **4. lépés: Írd meg a modult**

`packages/pipeline/src/kereso-index.ts`:

```ts
// A keresőindex (Supabase Postgres) feltöltése és szinkronban tartása.
// Az index származtatott: hibája sosem állíthatja meg az adat-pipeline-t.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sql } from "postgres";
import { ADAT_REPO_DIR } from "./commit.js";
import { szakaszokraBont } from "./szakaszok.js";

/** ennyi jogszabály megy egy tranzakcióban a tömeges feltöltésnél */
export const KOTEG_MERET = 50;

export interface IndexTetel {
  slug: string;
  documentId: string;
  megjeloles: string;
  cim: string;
  rovidites: string | null;
}

export interface SzakaszSor {
  slug: string;
  sorszam: number;
  cim: string;
  horgony: string;
  szoveg: string;
  hatalyos: boolean;
}

export function szakaszSorok(tetel: IndexTetel, md: string, hatalyos: boolean): SzakaszSor[] {
  return szakaszokraBont(md).map((sz) => ({
    slug: tetel.slug,
    sorszam: sz.sorszam,
    cim: sz.cim,
    horgony: sz.horgony,
    szoveg: sz.szoveg,
    hatalyos,
  }));
}

/**
 * Egy jogszabály teljes újraindexelése: a régi sorai törlődnek, az újak
 * bekerülnek. Tranzakcióban, hogy félkész állapot ne látszódjon.
 */
export async function jogszabalyIras(
  sql: Sql,
  tetel: IndexTetel,
  hatalyos: boolean,
): Promise<number> {
  let md: string;
  try {
    md = await readFile(join(ADAT_REPO_DIR, "jogszabalyok", tetel.slug, "szoveg.md"), "utf8");
  } catch {
    return 0; // nincs (még) szövege — nem hiba
  }
  const sorok = szakaszSorok(tetel, md, hatalyos);
  await sql.begin(async (tx) => {
    await tx`
      insert into jogszabaly (slug, document_id, megjeloles, cim, rovidites, hatalyos)
      values (${tetel.slug}, ${tetel.documentId}, ${tetel.megjeloles}, ${tetel.cim},
              ${tetel.rovidites}, ${hatalyos})
      on conflict (slug) do update set
        document_id = excluded.document_id, megjeloles = excluded.megjeloles,
        cim = excluded.cim, rovidites = excluded.rovidites, hatalyos = excluded.hatalyos
    `;
    await tx`delete from szakasz where slug = ${tetel.slug}`;
    if (sorok.length > 0) await tx`insert into szakasz ${tx(sorok)}`;
  });
  return sorok.length;
}

/** Több jogszabály szinkronizálása. A visszatérés a beírt szakaszok száma. */
export async function szinkronizal(
  sql: Sql,
  tetelek: { tetel: IndexTetel; hatalyos: boolean }[],
): Promise<number> {
  let osszes = 0;
  for (const { tetel, hatalyos } of tetelek) {
    osszes += await jogszabalyIras(sql, tetel, hatalyos);
  }
  return osszes;
}
```

- [ ] **5. lépés: Futtasd a tesztet**

Futtatás: `pnpm --filter @nyilt-jogtar/pipeline exec vitest run test/kereso-index.test.ts`
Várt: PASS, 4 teszt.

- [ ] **6. lépés: Írd meg a feltöltő CLI-t**

`packages/pipeline/src/kereso-feltoltes.ts`:

```ts
// A keresőindex teljes újraépítése az adat-repóból.
//   NYILT_DB_URL=postgres://... pnpm --filter @nyilt-jogtar/pipeline kereso-feltoltes
// Újrafuttatható: jogszabályonként törlés + beszúrás, tranzakcióban.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { ADAT_REPO_DIR } from "./commit.js";
import { jogszabalyIras, type IndexTetel } from "./kereso-index.js";

const url = process.env.NYILT_DB_URL;
if (!url) {
  console.error("HIBA: NYILT_DB_URL környezeti változó kell (Postgres connection string).");
  process.exit(1);
}

const lista = JSON.parse(
  await readFile(join(ADAT_REPO_DIR, "index", "jogszabalyok.json"), "utf8"),
) as IndexTetel[];
const retegek = JSON.parse(
  await readFile(join(ADAT_REPO_DIR, "index", "enumeralas.json"), "utf8"),
) as Record<string, string>;

const sql = postgres(url, { max: 4 });
let szakaszok = 0;
let kesz = 0;
for (const tetel of lista) {
  szakaszok += await jogszabalyIras(sql, tetel, retegek[tetel.documentId] !== "lezart");
  if (++kesz % 200 === 0) console.log(`[${kesz}/${lista.length}] ${szakaszok} szakasz`);
}
console.log(`KÉSZ: ${lista.length} jogszabály, ${szakaszok} szakasz.`);
await sql.end();
```

- [ ] **7. lépés: Típusellenőrzés és commit**

```bash
cd packages/pipeline && npx tsc --noEmit && cd ../..
git add packages/pipeline/src/kereso-index.ts packages/pipeline/src/kereso-feltoltes.ts \
        packages/pipeline/test/kereso-index.test.ts packages/pipeline/package.json
git commit -m "Keresőindex feltöltő és szinkronizáló modul"
```

---

### Task 4: A napi delta kiegészítése a szinkronnal

**Files:**
- Modify: `packages/pipeline/src/delta.ts`
- Modify: `packages/pipeline/adatrepo/napi-delta.yml`

**Interfaces:**
- Consumes: `szinkronizal`, `IndexTetel` (Task 3), `riaszt` (`health.ts`)
- Produces: semmit (végpont)

- [ ] **1. lépés: Egészítsd ki a deltát**

A `delta.ts`-ben a `if (push) { await git(["push", "origin", "main"]); ... }` blokk UTÁN, még a `fut()` végén:

```ts
  // Keresőindex-szinkron. KÜLÖN hibaágon: az index származtatott adat, a
  // hibája nem ronthatja el a delta kilépési kódját — az adat-repo
  // integritása előbbre való. Riasztunk, és a következő futás újrapróbálja.
  const dbUrl = process.env.NYILT_DB_URL;
  if (!dbUrl) {
    console.log("NYILT_DB_URL nincs beállítva — keresőindex-szinkron kihagyva.");
    return;
  }
  try {
    const { default: postgres } = await import("postgres");
    const { szinkronizal } = await import("./kereso-index.js");
    const retegek = JSON.parse(
      await readFile(join(ADAT_REPO_DIR, "index", "enumeralas.json"), "utf8"),
    ) as Record<string, string>;
    const sql = postgres(dbUrl, { max: 2 });
    try {
      const tetelek = valtozottSlugok.map((slug) => {
        const js = jogszabalyok.find((j) => j.slug === slug)!;
        return {
          tetel: {
            slug: js.slug,
            documentId: js.documentId,
            megjeloles: js.megjeloles,
            cim: js.cim,
            rovidites: js.rovidites ?? null,
          },
          hatalyos: retegek[js.documentId] !== "lezart",
        };
      });
      const db = await szinkronizal(sql, tetelek);
      console.log(`Keresőindex frissítve: ${tetelek.length} jogszabály, ${db} szakasz.`);
    } finally {
      await sql.end();
    }
  } catch (e) {
    const uzenet = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error(`Keresőindex-szinkron HIBA (a delta adata rendben van):\n${uzenet}`);
    await riaszt(
      "Keresőindex-szinkron hiba",
      `A napi delta adata rendben bekerült, de a keresőindex frissítése elhasalt.\n\n` +
        `\`\`\`\n${uzenet}\n\`\`\`\n\n` +
        `Teendő: a következő futás újrapróbálja. Ha ismétlődik, teljes újraépítés:\n` +
        `\`NYILT_DB_URL=... pnpm --filter @nyilt-jogtar/pipeline kereso-feltoltes\``,
    );
  }
```

**Fontos:** a `valtozottSlugok` a meglévő index-frissítő blokkban már ki van számolva (`delta.ts`, a „3. index frissítése" szakasz) — azt a változót használd, ne számold újra.

- [ ] **2. lépés: Add át a titkot a workflow-nak**

`packages/pipeline/adatrepo/napi-delta.yml`, a „Delta futtatása" lépés `env` blokkjába:

```yaml
          NYILT_DB_URL: ${{ secrets.NYILT_DB_URL }}
```

- [ ] **3. lépés: Ellenőrizd, hogy a delta titok nélkül is fut**

Futtatás: `pnpm --filter @nyilt-jogtar/pipeline test && cd packages/pipeline && npx tsc --noEmit`
Várt: PASS. A szinkron `NYILT_DB_URL` nélkül csak kiír egy sort és kilép — a régi viselkedés sértetlen.

- [ ] **4. lépés: Szinkronizáld a workflow két példányát és commitolj**

```bash
cp packages/pipeline/adatrepo/napi-delta.yml data/repo/.github/workflows/napi-delta.yml
git add packages/pipeline/src/delta.ts packages/pipeline/adatrepo/napi-delta.yml
git commit -m "Napi delta: keresőindex-szinkron külön hibaágon"
```

---

### Task 5: A web átállítása Supabase RPC-re

**Files:**
- Modify: `apps/web/lib/kereso.ts` (teljes átírás)
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: a `kereses()` DB-függvény (Task 2)
- Produces: `keres(q: string, mind?: boolean, limit?: number): Promise<Talalat[]>` · `interface Talalat { slug, jogszabaly, szakasz, horgony, reszlet, hatalyos }`

- [ ] **1. lépés: Cseréld a függőséget**

```bash
pnpm --filter @nyilt-jogtar/web remove minisearch
pnpm --filter @nyilt-jogtar/web add @supabase/supabase-js
```

- [ ] **2. lépés: Írd újra a keresőt**

`apps/web/lib/kereso.ts` TELJES tartalma:

```ts
// Teljes szövegű keresés a Supabase Postgres FTS-én keresztül. Az index
// építése a pipeline dolga (packages/pipeline/src/kereso-index.ts); itt
// csak lekérdezünk. A magyar szótövezést és a találat-kiemelést a
// kereses() adatbázisfüggvény adja.

import { createClient } from "@supabase/supabase-js";

export interface Talalat {
  slug: string;
  jogszabaly: string; // "Ptk. (2013. évi V. törvény)"
  szakasz: string;
  horgony: string;
  reszlet: string; // <mark> jelöléssel kiemelve
  hatalyos: boolean;
}

interface KeresesSor {
  slug: string;
  megjeloles: string;
  rovidites: string | null;
  jogszabaly_cim: string;
  szakasz_cim: string;
  horgony: string;
  reszlet: string;
  hatalyos: boolean;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const kulcs = process.env.SUPABASE_ANON_KEY;

export function jogszabalyNev(sor: Pick<KeresesSor, "megjeloles" | "rovidites">): string {
  return sor.rovidites ? `${sor.rovidites} (${sor.megjeloles})` : sor.megjeloles;
}

export async function keres(q: string, mind = false, limit = 40): Promise<Talalat[]> {
  if (!url || !kulcs) throw new Error("Hiányzó Supabase-konfiguráció (URL vagy anon kulcs).");
  const kliens = createClient(url, kulcs, { auth: { persistSession: false } });
  const { data, error } = await kliens.rpc("kereses", {
    q,
    mind,
    talalat_limit: limit,
  });
  if (error) throw new Error(`Keresési hiba: ${error.message}`);
  return (data as KeresesSor[]).map((sor) => ({
    slug: sor.slug,
    jogszabaly: jogszabalyNev(sor),
    szakasz: sor.szakasz_cim,
    horgony: sor.horgony,
    reszlet: sor.reszlet,
    hatalyos: sor.hatalyos,
  }));
}
```

- [ ] **3. lépés: Vedd fel a környezeti változókat**

```bash
cd apps/web
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
vercel env pull .env.local
```

- [ ] **4. lépés: Típusellenőrzés és commit**

```bash
cd apps/web && npx tsc --noEmit && cd ../..
git add apps/web/lib/kereso.ts apps/web/package.json pnpm-lock.yaml
git commit -m "Web: keresés Supabase Postgres FTS-en, MiniSearch kivezetve"
```

---

### Task 6: Keresőoldal — kapcsoló és jelölés

**Files:**
- Modify: `apps/web/app/kereses/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `keres`, `Talalat` (Task 5)
- Produces: semmit (végpont)

- [ ] **1. lépés: Írd át az oldalt**

`apps/web/app/kereses/page.tsx` — a `KeresesOldal` függvény és az importok:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { keres } from "@/lib/kereso";

export const metadata: Metadata = { title: "Keresés" };
export const dynamic = "force-dynamic";

export default async function KeresesOldal({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mind?: string }>;
}) {
  const { q, mind } = await searchParams;
  const kifejezes = (q ?? "").trim();
  const mindenben = mind === "1";

  let talalatok: Awaited<ReturnType<typeof keres>> = [];
  let hiba = false;
  if (kifejezes) {
    try {
      talalatok = await keres(kifejezes, mindenben);
    } catch {
      hiba = true;
    }
  }

  return (
    <main className="lap lap-szukebb">
      <h1>Keresés</h1>

      <form className="kereso-urlap" action="/kereses" method="get">
        <input
          type="search"
          name="q"
          defaultValue={kifejezes}
          placeholder="Keresés a törvények teljes szövegében…"
          aria-label="Keresés a törvények teljes szövegében"
        />
        <label className="kereso-kapcsolo">
          <input type="checkbox" name="mind" value="1" defaultChecked={mindenben} />
          hatálytalan törvényekben is
        </label>
        <button className="gomb" type="submit">
          Keresés
        </button>
      </form>

      {hiba ? (
        <p className="alcim-sor">
          A keresés átmenetileg nem elérhető. A jogszabályok szövege továbbra is
          olvasható, és kereshetsz a{" "}
          <a href="https://njt.jog.gov.hu" rel="noopener">
            Nemzeti Jogszabálytárban
          </a>{" "}
          is.
        </p>
      ) : !kifejezes ? (
        <p className="alcim-sor">Írj be egy kifejezést a fenti keresőmezőbe.</p>
      ) : (
        <p className="alcim-sor">
          „{kifejezes}” — {talalatok.length} találat
          {mindenben ? " (a hatálytalan törvényeket is beleértve)" : ""}
        </p>
      )}

      {kifejezes && !hiba && talalatok.length === 0 ? (
        <p>
          Nincs találat. Próbáld másképp fogalmazni
          {mindenben ? "" : ", vagy kapcsold be a hatálytalan törvényeket is"}.
        </p>
      ) : null}

      {talalatok.map((t, i) => (
        <div className="talalat" key={i}>
          <h3>
            <Link href={`/jogszabaly/${t.slug}${t.horgony ? `#${t.horgony}` : ""}`}>
              {t.szakasz || t.jogszabaly}
            </Link>
          </h3>
          <p className="forras">
            {t.jogszabaly}
            {t.hatalyos ? null : <span className="hatalytalan-jel">hatályát vesztette</span>}
          </p>
          <p dangerouslySetInnerHTML={{ __html: t.reszlet }} />
        </div>
      ))}
    </main>
  );
}
```

**XSS-megjegyzés:** a `reszlet` azért mehet `dangerouslySetInnerHTML`-lel, mert a `ts_headline` a saját bemenetét escape-eli, és csak `<mark>` tageket szúr be. Ez a Postgres garanciája — ha valaha más forrásból jön a részlet, ez a sor újragondolandó.

- [ ] **2. lépés: Add hozzá a stílusokat**

`apps/web/app/globals.css` végére:

```css
.kereso-urlap { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; }
.kereso-kapcsolo { display: flex; gap: .4rem; align-items: center; font-size: .9rem; }
.talalat mark { background: transparent; font-weight: 600; text-decoration: underline; }
.hatalytalan-jel {
  margin-left: .5rem; padding: .05rem .4rem; border: 1px solid currentColor;
  border-radius: 3px; font-size: .78rem; opacity: .75;
}
```

- [ ] **3. lépés: Ellenőrizd és commitolj**

```bash
cd apps/web && npx tsc --noEmit && cd ../..
git add apps/web/app/kereses/page.tsx apps/web/app/globals.css
git commit -m "Keresőoldal: hatálytalan törvények kapcsolója, találat-kiemelés"
```

---

### Task 7: Bevezetés, füstteszt, dokumentáció

**Files:**
- Modify: `docs/uzemeltetes.md`

**Interfaces:**
- Consumes: minden korábbi task
- Produces: semmit (végpont)

- [ ] **1. lépés: Töltsd fel az indexet**

```bash
NYILT_DB_URL='postgres://...' pnpm --filter @nyilt-jogtar/pipeline kereso-feltoltes
```

Várt: `KÉSZ: 4332 jogszabály, ~100000 szakasz.`

- [ ] **2. lépés: Füstteszt a Supabase SQL-szerkesztőjében**

```sql
select szakasz_cim, megjeloles, hatalyos from kereses('jogos védelem') limit 5;
select szakasz_cim, megjeloles from kereses('szerződést') limit 5;   -- ragozás!
select szakasz_cim, megjeloles from kereses('"jogos védelem"') limit 5; -- pontos kifejezés
select count(*) from kereses('elévülés', true, 100);
```

Elvárás: a „szerződést" ragozott alak találjon a „szerződés" szót tartalmazó §-okra (ez bizonyítja a szótövezést), a „jogos védelem" első találatai a Btk.-ból jöjjenek, az idézőjeles alak szűkebb halmazt adjon, mint az idézőjel nélküli.

- [ ] **3. lépés: Állítsd be a GitHub secretet**

```bash
gh secret set NYILT_DB_URL -R godavid/magyar-jogtar
```

- [ ] **4. lépés: Deployolj és verifikálj**

```bash
cd apps/web && vercel --prod --yes && cd ../..
curl -s "https://jogtar.remenyfarm.hu/kereses?q=szerz%C5%91d%C3%A9st" | grep -c "<mark>"
curl -s -o /dev/null -w "%{http_code}\n" "https://jogtar.remenyfarm.hu/kereses?q=el%C3%A9v%C3%BCl%C3%A9s&mind=1"
```

Elvárás: a `<mark>` előfordulások száma nagyobb nullánál, a második kérés 200-as.
**A deploy nem automatikus a git push-ra** — a `vercel --prod` lépés nem hagyható ki.

- [ ] **5. lépés: Frissítsd a dokumentációt**

`docs/uzemeltetes.md` — három helyen:

1. A „Titkok" szakasz szövege ma azt állítja, hogy nincsenek titkok. Írd át: az adat-repo `NYILT_DB_URL` secretet használ a keresőindex-szinkronhoz; a Vercel oldalon `NEXT_PUBLIC_SUPABASE_URL` és `SUPABASE_ANON_KEY` él; a web anon kulccsal, RLS mögött csak olvas.
2. A pipeline-felsorolásba: `szakaszok.ts` (markdown → §-szakaszok, horgony-invariánssal) és `kereso-index.ts` (a keresőindex szinkronja).
3. A „Skálázás" szakaszban a keresőre vonatkozó nyitott pont törlendő, helyette az újraépítési recept: `NYILT_DB_URL=... pnpm --filter @nyilt-jogtar/pipeline kereso-feltoltes` — az index származtatott, bármikor eldobható.

- [ ] **6. lépés: Commitolj és pushol**

```bash
git add docs/uzemeltetes.md
git commit -m "Üzemeltetés: keresőindex, titkok, újraépítési recept"
git push origin main
```

---

## Önellenőrzés

**Spec-lefedettség:** hosztolt Postgres FTS → Task 2 · csak hatályos szöveg indexelése → Task 3 (`enumeralas.json` `lezart` rétege) · kulcsszó + pontos kifejezés → Task 2 (`websearch_to_tsquery`) · alapból hatályos, kapcsolóval mind → Task 2 (`mind` paraméter) és Task 6 (UI) · `szakaszokraBont` átköltöztetése → Task 1 · titkok → Task 4 és 7 · a delta nem bukhat el → Task 4 (külön hibaág) · hibatűrő keresőoldal → Task 6 · tesztek → Task 1 és 3 · füstteszt → Task 7.

**Nyitott pont, amit a végrehajtónak tudnia kell:** a `ts_headline` a `MaxFragments=1` beállítással egyetlen részletet ad. Ha a füstteszten ez kevésnek bizonyul, a paraméter a `02-kereses.sql`-ben hangolható — ez nem igényel séma- vagy kódváltozást.
