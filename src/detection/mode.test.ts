import { describe, it, expect } from "vitest";
import { detectMode } from "./mode.js";

describe("detectMode", () => {
  it("detects shell prompt", () => {
    const text = "ubuntu@host:~/project$ ";
    expect(detectMode(text).mode).toBe("shell");
  });

  it("detects claude code active", () => {
    const text = `
Claude Code v2.1.63

   Welcome back Yanchong!

> `;
    expect(detectMode(text).mode).toBe("claude");
  });

  it("detects permission prompt with Allow/Deny", () => {
    const text = `
  Write  hello.txt

  Allow   Deny   Don't ask again for this session
> `;
    const result = detectMode(text);
    expect(result.mode).toBe("permission");
    expect(result.buttons).toBeDefined();
    expect(result.buttons!.length).toBeGreaterThanOrEqual(2);
  });

  it("detects choice list with numbered options", () => {
    const text = `
Which approach do you prefer?
  1. Option A
  2. Option B
  3. Option C
> `;
    const result = detectMode(text);
    expect(result.mode).toBe("choice");
    expect(result.buttons).toBeDefined();
    expect(result.buttons!.length).toBe(3);
  });

  it("detects processing state (no prompt)", () => {
    const text = `
Reading file src/index.ts...

`;
    expect(detectMode(text).mode).toBe("processing");
  });
});
