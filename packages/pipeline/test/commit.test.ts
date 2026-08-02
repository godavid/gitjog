import { describe, expect, it } from "vitest";
import { shaTerkepParse } from "../src/commit.js";

describe("shaTerkepParse", () => {
  it("a commit dátuma szerint párosít, ha az üzenetben nincs dátum", () => {
    const t = shaTerkepParse("aaa111|2024-01-01|Index frissítés (allapotok.json)");
    expect(t.get("2024-01-01")).toBe("aaa111");
  });

  it("1970 előtti időállapotot az ÜZENET dátumához köti, nem az epoch-clamphez", () => {
    // a git() 1970-01-01-re csúsztatja az 1902-es commit dátumát
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
