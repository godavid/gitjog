// A keresőindex (Supabase Postgres) feltöltése és szinkronban tartása.
// Az index származtatott: hibája sosem állíthatja meg az adat-pipeline-t.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sql } from "postgres";
import { ADAT_REPO_DIR } from "./commit.js";
import type { RetegTerkep } from "./enumeralas.js";
import { szakaszokraBont } from "./szakaszok.js";

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
 * A delta keresőindex-tételei az adat-repó friss listaindexéből készülnek.
 * A generált config-lista címe szándékosan üres, míg a listaindex már a
 * snapshotból parse-olt címet őrzi.
 */
export function deltaSzinkronTetelek(
  valtozottSlugok: string[],
  listaIndex: IndexTetel[],
  retegTerkep: RetegTerkep,
): { tetel: IndexTetel; hatalyos: boolean }[] {
  const terkep = new Map(listaIndex.map((tetel) => [tetel.slug, tetel]));
  return valtozottSlugok.flatMap((slug) => {
    const tetel = terkep.get(slug);
    return tetel
      ? [{ tetel, hatalyos: retegTerkep[tetel.documentId] !== "lezart" }]
      : [];
  });
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
    // nagy törvénynél (2 MB szöveg, több ezer szakasz) darabolva megy be,
    // különben egyetlen INSERT paraméterlistája túl nagyra hízik
    for (let i = 0; i < sorok.length; i += 500) {
      await tx`insert into szakasz ${tx(sorok.slice(i, i + 500))}`;
    }
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
