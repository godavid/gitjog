import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  type AllapotBejegyzes,
  batchCheckParse,
  batchCheckSorok,
  headBlobEllenorzes,
  headBlobElteresek,
  utolsoAllapot,
} from "../src/index-ellenorzes-lib.js";

const SZOVEG_UT = (slug: string) => `jogszabalyok/${slug}/szoveg.md`;

describe("utolsoAllapot", () => {
  it("a legnagyobb dátumot választja, a verziószámtól függetlenül", () => {
    const u = utolsoAllapot([
      { datum: "2017-12-12", verzio: 2, sha: "a" },
      { datum: "1930-11-08", verzio: 9, sha: "b" },
    ]);
    expect(u?.sha).toBe("a");
  });

  it("azonos dátumnál a nagyobb verzió győz", () => {
    const u = utolsoAllapot([
      { datum: "2020-01-01", verzio: 1, sha: "a" },
      { datum: "2020-01-01", verzio: 3, sha: "c" },
      { datum: "2020-01-01", verzio: 2, sha: "b" },
    ]);
    expect(u?.sha).toBe("c");
  });

  it("üres listára undefined", () => {
    expect(utolsoAllapot([])).toBeUndefined();
  });
});

describe("batchCheckSorok", () => {
  it("slugonként HEAD- és sha-sort ad, a sha nélkülit kihagyja", () => {
    const utolsok = new Map<string, AllapotBejegyzes>([
      ["a-slug", { datum: "2017-12-12", verzio: 2, sha: "abc" }],
      ["b-slug", { datum: "2017-12-12", verzio: 2 }],
    ]);
    expect(batchCheckSorok(["a-slug", "b-slug"], utolsok)).toEqual([
      "HEAD:jogszabalyok/a-slug/szoveg.md",
      "abc:jogszabalyok/a-slug/szoveg.md",
    ]);
  });
});

describe("batchCheckParse", () => {
  it("a `<sha> <típus> <méret>` és a `missing` sorokat a bemenethez párosítja", () => {
    const sorok = ["HEAD:x", "abc:x", "def:y"];
    const kimenet = "1111111 blob 42\nabc:x missing\n2222222 blob 7\n";
    const t = batchCheckParse(kimenet, sorok);
    expect(t.get("HEAD:x")).toBe("1111111");
    expect(t.get("abc:x")).toBeNull();
    expect(t.get("def:y")).toBe("2222222");
  });

  it("eltérő sorszámnál hibát dob", () => {
    expect(() => batchCheckParse("1111111 blob 1\n", ["a", "b"])).toThrow(/2 bemeneti sorra 1/);
  });
});

describe("headBlobElteresek", () => {
  it("azonos blobnál nincs eltérés, eltérőnél és hiányzónál van", () => {
    const head = new Map<string, string | null>([
      ["jo", "aaa"],
      ["rossz", "bbb"],
      ["nincs-head", null],
      ["nincs-allapot", "ddd"],
    ]);
    const allapot = new Map<string, string | null>([
      ["jo", "aaa"],
      ["rossz", "ccc"],
      ["nincs-head", "eee"],
      ["nincs-allapot", null],
    ]);
    const e = headBlobElteresek(head, allapot);
    expect(e.map((x) => x.slug).sort()).toEqual(["nincs-allapot", "nincs-head", "rossz"]);
    expect(e.find((x) => x.slug === "rossz")?.indoklas).toContain("bbb");
    expect(e.find((x) => x.slug === "rossz")?.indoklas).toContain("ccc");
  });
});

describe("headBlobEllenorzes (ideiglenes repóban)", () => {
  const SLUG = "1930-evi-xxxvii-torveny";
  let repo: string | undefined;

  afterEach(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
    repo = undefined;
  });

  const GIT_ENV = {
    ...process.env,
    GIT_AUTHOR_NAME: "teszt",
    GIT_AUTHOR_EMAIL: "teszt@example.com",
    GIT_COMMITTER_NAME: "teszt",
    GIT_COMMITTER_EMAIL: "teszt@example.com",
  };

  function git(dir: string, args: string[]): string {
    return execFileSync("git", ["-C", dir, ...args], { env: GIT_ENV, encoding: "utf8" }).trim();
  }

  async function commitSzoveg(dir: string, szoveg: string, datum: string): Promise<string> {
    await mkdir(join(dir, "jogszabalyok", SLUG), { recursive: true });
    await writeFile(join(dir, SZOVEG_UT(SLUG)), szoveg, "utf8");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", `1930. évi XXXVII. törvény — időállapot ${datum}`]);
    return git(dir, ["rev-parse", "HEAD"]);
  }

  it("jelzi, ha a HEAD régebbi szöveget tart, mint az index szerinti utolsó állapot", async () => {
    repo = await mkdtemp(join(tmpdir(), "gitjog-index-ellenorzes-"));
    git(repo, ["init", "-q"]);
    const sha2017 = await commitSzoveg(repo, "A: a 2017-es szöveg\n", "2017-12-12");
    const sha1930 = await commitSzoveg(repo, "B: az 1930-as szöveg\n", "1930-11-08");

    const index = {
      [SLUG]: [
        { datum: "1930-11-08", verzio: 1, sha: sha1930 },
        { datum: "2017-12-12", verzio: 2, sha: sha2017 },
      ],
    };
    const e = headBlobEllenorzes(repo, index);
    expect(e).toHaveLength(1);
    expect(e[0]!.slug).toBe(SLUG);
    expect(e[0]!.indoklas).toContain("a HEAD szoveg.md blobja");
    expect(sha1930).not.toBe(sha2017);

    // helyes HEAD: a 2017-es szöveg újra commitolva → nincs eltérés
    const shaUj = await commitSzoveg(repo, "A: a 2017-es szöveg\n", "2017-12-12");
    index[SLUG]!.push({ datum: "2017-12-12", verzio: 3, sha: shaUj });
    expect(headBlobEllenorzes(repo, index)).toEqual([]);
  });

  it("konzisztens repóban nincs találat, és üres indexre nem hív gitet", async () => {
    repo = await mkdtemp(join(tmpdir(), "gitjog-index-ellenorzes-"));
    git(repo, ["init", "-q"]);
    const sha = await commitSzoveg(repo, "csak egy állapot\n", "2017-12-12");
    expect(headBlobEllenorzes(repo, { [SLUG]: [{ datum: "2017-12-12", verzio: 1, sha }] })).toEqual([]);
    expect(headBlobEllenorzes("/nem/letezo/konyvtar", {})).toEqual([]);
  });
});
