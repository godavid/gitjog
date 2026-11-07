import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allapotShaTerkep, datumEnv, shaTerkepParse } from "../src/commit.js";

const execFileP = promisify(execFile);

describe("shaTerkepParse", () => {
  it("dátum nélküli üzenetet (Index frissítés) kihagy, nem esik vissza a commit dátumára", () => {
    const t = shaTerkepParse("aaa111|2024-01-01|Index frissítés (allapotok.json)");
    expect(t.size).toBe(0);
    expect(t.has("2024-01-01")).toBe(false);
  });

  it("az aznapi Index frissítés nem győzi le az állapot-commitot", () => {
    const t = shaTerkepParse(
      [
        "s1|2026-11-05|2013. évi V. törvény — időállapot 2026-11-05",
        "i1|2026-11-05|Index frissítés (allapotok.json, enumeralas.json, felvételi napló)",
      ].join("\n"),
    );
    expect(t.get("2026-11-05")).toBe("s1");
    expect(t.size).toBe(1);
  });

  it("1970 előtti időállapotot az ÜZENET dátumához köti, nem az epoch-clamphez", () => {
    // a datumEnv() 1970-01-01-re csúsztatja az 1902-es commit dátumát
    const t = shaTerkepParse("bbb222|1970-01-01|1902. évi XVIII. törvény — időállapot 1902-09-21");
    expect(t.get("1902-09-21")).toBe("bbb222");
    expect(t.has("1970-01-01")).toBe(false);
  });

  it("többes (napi csoportos) commit-címből is a dátumot veszi", () => {
    const t = shaTerkepParse("ccc333|1970-01-01|Időállapotok 1913-09-05: 1913. évi XLIII. törvény, 1913. évi XLVII. törvény");
    expect(t.get("1913-09-05")).toBe("ccc333");
  });

  it("1970 utáni állapotnál az üzenet és a commit dátuma egybeesik", () => {
    const t = shaTerkepParse("ddd444|2015-07-01|2015. évi LIII. törvény — időállapot 2015-07-01");
    expect(t.get("2015-07-01")).toBe("ddd444");
    expect(t.size).toBe(1);
  });

  it("azonos napra az utolsó commit győz (--reverse sorrendben)", () => {
    const t = shaTerkepParse(
      ["e1|2020-01-01|X — időállapot 2020-01-01", "e2|2020-01-01|Y — időállapot 2020-01-01"].join("\n"),
    );
    expect(t.get("2020-01-01")).toBe("e2");
  });

  it("üres kimenetre üres térkép", () => {
    expect(shaTerkepParse("").size).toBe(0);
    expect(shaTerkepParse("\n\n").size).toBe(0);
  });

  it("a '|' karaktert tartalmazó üzenet nem töri el a parse-t", () => {
    const t = shaTerkepParse("fff555|1970-01-01|1930. évi I. törvény — időállapot 1930-06-14 | megjegyzés");
    expect(t.get("1930-06-14")).toBe("fff555");
  });
});

describe("datumEnv", () => {
  it("author- és committer-dátumot ad, délben, magyar idő szerint", () => {
    expect(datumEnv("2015-07-01")).toEqual({
      GIT_AUTHOR_DATE: "2015-07-01T12:00:00+01:00",
      GIT_COMMITTER_DATE: "2015-07-01T12:00:00+01:00",
    });
  });

  it("1970 előtti dátumot az epoch-határra csúsztat", () => {
    expect(datumEnv("1902-09-21").GIT_AUTHOR_DATE).toBe("1970-01-01T12:00:00+01:00");
    expect(datumEnv("1902-09-21").GIT_COMMITTER_DATE).toBe("1970-01-01T12:00:00+01:00");
  });

  it("dátum nélkül nincs dátum-kulcs", () => {
    expect(datumEnv()).toEqual({});
    expect(datumEnv(undefined)).not.toHaveProperty("GIT_AUTHOR_DATE");
  });
});

describe("allapotShaTerkep (ideiglenes repón)", () => {
  const slug = "2013-evi-v-torveny";
  let repo = "";
  let allapotSha = "";
  let indexSha = "";

  const g = (args: string[]) =>
    execFileP("git", ["-C", repo, ...args], {
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
        GIT_AUTHOR_DATE: "2026-11-05T12:00:00+01:00",
        GIT_COMMITTER_DATE: "2026-11-05T12:00:00+01:00",
      },
    }).then((r) => r.stdout.trim());

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "gitjog-shaterkep-"));
    await g(["init", "-q", "-b", "main"]);
    const kony = join(repo, "jogszabalyok", slug);
    await mkdir(kony, { recursive: true });
    // állapot-commit: szoveg.md + meta.json, dátumos címmel
    await writeFile(join(kony, "szoveg.md"), "# Ptk.\n", "utf8");
    await writeFile(join(kony, "meta.json"), '{"allapotok":[{"datum":"2026-11-05","verzio":9}]}\n', "utf8");
    await g(["add", "-A"]);
    await g(["commit", "-q", "-m", "2013. évi V. törvény — időállapot 2026-11-05"]);
    allapotSha = await g(["rev-parse", "HEAD"]);
    // Index-commit ugyanazon a napon: csak a könyvtár allapotok.json-ját írja
    await writeFile(join(kony, "allapotok.json"), '[{"datum":"2026-11-05","verzio":9,"sha":"x"}]\n', "utf8");
    await g(["add", "-A"]);
    await g(["commit", "-q", "-m", "Index frissítés (allapotok.json, enumeralas.json, felvételi napló)"]);
    indexSha = await g(["rev-parse", "HEAD"]);
  });

  afterAll(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it("az aznapi Index-commit nem győz: a térkép az állapot-commitra mutat", async () => {
    const t = await allapotShaTerkep(slug, repo);
    expect(t.get("2026-11-05")).toBe(allapotSha);
    expect(t.get("2026-11-05")).not.toBe(indexSha);
    expect(t.size).toBe(1);
  });
});
