import { describe, it, expect } from "vitest";
import { isAllowed } from "./allowlist.js";

describe("isAllowed", () => {
  it("allows yanshroom", () => {
    expect(isAllowed("883495629970636860")).toBe(true);
  });

  it("allows luckyQuqi", () => {
    expect(isAllowed("1424947766060126313")).toBe(true);
  });

  it("blocks unknown user", () => {
    expect(isAllowed("000000000000000000")).toBe(false);
  });

  it("blocks empty string", () => {
    expect(isAllowed("")).toBe(false);
  });
});
