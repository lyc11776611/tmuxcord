import { describe, it, expect, afterEach } from "vitest";
import { TmuxSession } from "./tmux/session.js";
import { OutputPoller } from "./tmux/output.js";
import { detectMode } from "./detection/mode.js";
import { SessionStore } from "./store/json-store.js";
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TEST_SESSION = "ct-integ-test";
const TEST_DIR = join(import.meta.dirname, "../.test-data");
const TEST_STORE = join(TEST_DIR, "sessions.json");

function cleanup() {
  try { execFileSync("tmux", ["kill-session", "-t", TEST_SESSION]); } catch {}
  rmSync(TEST_DIR, { recursive: true, force: true });
}

describe("Integration: tmux pipeline", () => {
  afterEach(cleanup);

  it("full flow: create -> send -> capture -> detect shell -> close", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const store = new SessionStore(TEST_STORE);

    // Create session
    await TmuxSession.create(TEST_SESSION, "/tmp");
    store.set("test-thread", {
      threadId: "test-thread",
      tmuxSession: TEST_SESSION,
      ownerUserId: "test-user",
      cwd: "/tmp",
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      lastCaptureHash: "",
    });

    // Send command
    await TmuxSession.sendKeys(TEST_SESSION, "echo integration-ok");
    await new Promise((r) => setTimeout(r, 1000));

    // Capture output
    const output = await TmuxSession.capturePane(TEST_SESSION);
    expect(output).toContain("integration-ok");

    // Detect mode
    const mode = detectMode(output);
    expect(mode.mode).toBe("shell");

    // Output diff
    const poller = new OutputPoller();
    const diff = poller.diff(output);
    expect(diff).toContain("integration-ok");

    // Close
    await TmuxSession.kill(TEST_SESSION);
    const exists = await TmuxSession.exists(TEST_SESSION);
    expect(exists).toBe(false);

    // Cleanup store
    store.delete("test-thread");
    expect(store.get("test-thread")).toBeUndefined();
  });
});
