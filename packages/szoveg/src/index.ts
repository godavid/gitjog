// @gitjog/szoveg — a pipeline és a web közös szövegmodulja. Tiszta függvények,
// I/O nélkül: a §-darabolásnak bit szerint egyeznie kell a két oldalon, ezért
// egyetlen implementáció él, és mindkét csomag innen importál.

export { horgonyId, MAX_TORZS_HOSSZ, szakaszokraBont, type Szakasz } from "./szakaszok.js";
export { arabbolRomai, romaibolArab } from "./romai.js";
export { valtozasSzamitas, type Blokk, type BlokkTipus, type Valtozas } from "./sor-diff.js";
export {
  hivatkozasParse,
  paragrafusHorgony,
  szakaszKeres,
  type Hivatkozas,
} from "./hivatkozas.js";
export {
  szakaszDiff,
  szakaszDiffOsszegzes,
  type SzakaszDiffOsszegzes,
  type SzakaszValtozas,
  type SzakaszValtozasTipus,
} from "./szakasz-diff.js";
export { paragrafusKivag, type ParagrafusReszlet } from "./paragrafus.js";
