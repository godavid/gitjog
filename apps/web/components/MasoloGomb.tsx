"use client";

// Vágólapra másoló gomb a kódblokkok mellé. Progresszív: JS nélkül (és a
// hidratálás előtt) nem jelenik meg, a szöveg akkor is kijelölhető marad.

import { useEffect, useRef, useState } from "react";

export function MasoloGomb({ szoveg, mit }: { szoveg: string; mit: string }) {
  const [elerheto, setElerheto] = useState(false);
  const [allapot, setAllapot] = useState<"alap" | "kesz" | "hiba">("alap");
  const idozito = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setElerheto(typeof navigator !== "undefined" && !!navigator.clipboard);
    return () => clearTimeout(idozito.current);
  }, []);

  if (!elerheto) return null;

  async function masol() {
    clearTimeout(idozito.current);
    try {
      await navigator.clipboard.writeText(szoveg);
      setAllapot("kesz");
    } catch {
      setAllapot("hiba");
    }
    idozito.current = setTimeout(() => setAllapot("alap"), 1800);
  }

  return (
    <button
      type="button"
      className="masolo-gomb"
      data-allapot={allapot}
      onClick={masol}
      aria-label={`Másolás: ${mit}`}
    >
      <span aria-live="polite">
        {allapot === "kesz" ? "Másolva" : allapot === "hiba" ? "Jelöld ki kézzel" : "Másolás"}
      </span>
    </button>
  );
}
