// Teljes szövegű keresés a Supabase Postgres FTS-én keresztül. Az index
// építése a pipeline dolga (packages/pipeline/src/kereso-index.ts); itt
// csak lekérdezünk. A magyar szótövezést és a találat-kiemelést a
// kereses() adatbázisfüggvény adja.
//
// A kulcsok szándékosan NEM NEXT_PUBLIC_ előtagúak: a keresés szerver
// oldalon fut, így a kliens bundle-be semmi nem kerül belőlük.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

let kliens: SupabaseClient | null = null;

function getKliens(): SupabaseClient {
  if (kliens) return kliens;
  const url = process.env.SUPABASE_URL;
  const kulcs = process.env.SUPABASE_ANON_KEY;
  if (!url || !kulcs) throw new Error("Hiányzó Supabase-konfiguráció (URL vagy anon kulcs).");
  kliens = createClient(url, kulcs, { auth: { persistSession: false } });
  return kliens;
}

export function jogszabalyNev(sor: Pick<KeresesSor, "megjeloles" | "rovidites">): string {
  return sor.rovidites ? `${sor.rovidites} (${sor.megjeloles})` : sor.megjeloles;
}

export async function keres(q: string, mind = false, limit = 40): Promise<Talalat[]> {
  const { data, error } = await getKliens().rpc("kereses", {
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
