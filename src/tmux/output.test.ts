import { describe, it, expect } from "vitest";
import { OutputPoller } from "./output.js";

describe("OutputPoller", () => {
  it("detects new output via diff", () => {
    const poller = new OutputPoller();
    const diff1 = poller.diff("line1\nline2\n");
    expect(diff1).toBe("line1\nline2\n"); // first capture = all new

    const diff2 = poller.diff("line1\nline2\n");
    expect(diff2).toBeNull(); // same = no diff

    const diff3 = poller.diff("line1\nline2\nline3\n");
    expect(diff3).toBe("line3\n"); // only new line
  });

  it("detects stability after 3 identical captures", () => {
    const poller = new OutputPoller();
    poller.diff("content");
    expect(poller.isStable()).toBe(false);
    poller.diff("content"); // same 1
    expect(poller.isStable()).toBe(false);
    poller.diff("content"); // same 2
    expect(poller.isStable()).toBe(false);
    poller.diff("content"); // same 3
    expect(poller.isStable()).toBe(true);
  });

  it("resets stability on new content", () => {
    const poller = new OutputPoller();
    poller.diff("a");
    poller.diff("a");
    poller.diff("a");
    poller.diff("a");
    expect(poller.isStable()).toBe(true);
    poller.diff("b"); // new content
    expect(poller.isStable()).toBe(false);
  });

  it("truncates output to maxLength", () => {
    const poller = new OutputPoller();
    const long = "x".repeat(3000);
    const diff = poller.diff(long);
    expect(diff!.length).toBeLessThanOrEqual(1800);
  });
});
