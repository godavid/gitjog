import { describe, expect, it } from "vitest";
import { cellaTisztitas } from "../src/parse";

describe("cellaTisztitas", () => {
  it("a | cellahatárt escape-eli", () => {
    expect(cellaTisztitas("a | b")).toBe("a \\| b");
  });
  it("a backslash-t is, hogy a cellavégi „\\” ne nyelje el a | escape-jét", () => {
    expect(cellaTisztitas("a\\")).toBe("a\\\\");
    expect(cellaTisztitas("a\\|b")).toBe("a\\\\\\|b");
  });
});
