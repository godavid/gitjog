import { MasoloGomb } from "@/components/MasoloGomb";

/** Másolható kódblokk: a szöveg JS nélkül is kijelölhető, a gomb csak ráadás. */
export function KodSor({ kod, mit, kiemelt = false }: { kod: string; mit: string; kiemelt?: boolean }) {
  return (
    <div className={kiemelt ? "kod-sor kod-sor-kiemelt" : "kod-sor"}>
      <pre className="kodblokk">
        <code>{kod}</code>
      </pre>
      <MasoloGomb szoveg={kod} mit={mit} />
    </div>
  );
}
