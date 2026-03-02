import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { TmuxSession } from "./session.js";

const TEST_PREFIX = "ct-test-";

function cleanup() {
  try {
    const sessions = execFileSync("tmux", ["list-sessions", "-F", "#{session_name}"], { encoding: "utf-8" });
    for (const name of sessions.trim().split("\n")) {
      if (name.startsWith(TEST_PREFIX)) {
        execFileSync("tmux", ["kill-session", "-t", name]);
      }
    }
  } catch {
    // no sessions
  }
}

describe("TmuxSession", () => {
  afterEach(cleanup);

  it("creates a tmux session", async () => {
    const name = `${TEST_PREFIX}1`;
    await TmuxSession.create(name, "/tmp");
    const sessions = execFileSync("tmux", ["list-sessions", "-F", "#{session_name}"], { encoding: "utf-8" });
    expect(sessions).toContain(name);
  });

  it("sends keys to a session", async () => {
    const name = `${TEST_PREFIX}2`;
    await TmuxSession.create(name, "/tmp");
    await TmuxSession.sendKeys(name, "echo hello-test");
    await new Promise((r) => setTimeout(r, 500));
    const output = await TmuxSession.capturePane(name);
    expect(output).toContain("hello-test");
  });

  it("captures pane output", async () => {
    const name = `${TEST_PREFIX}3`;
    await TmuxSession.create(name, "/tmp");
    await TmuxSession.sendKeys(name, "echo capture-works");
    await new Promise((r) => setTimeout(r, 500));
    const output = await TmuxSession.capturePane(name);
    expect(output).toContain("capture-works");
  });

  it("kills a session", async () => {
    const name = `${TEST_PREFIX}4`;
    await TmuxSession.create(name, "/tmp");
    await TmuxSession.kill(name);
    const exists = await TmuxSession.exists(name);
    expect(exists).toBe(false);
  });

  it("lists active sessions", async () => {
    const name = `${TEST_PREFIX}5`;
    await TmuxSession.create(name, "/tmp");
    const list = await TmuxSession.listSessions();
    expect(list).toContain(name);
  });

  it("sends ctrl-c", async () => {
    const name = `${TEST_PREFIX}6`;
    await TmuxSession.create(name, "/tmp");
    await TmuxSession.sendCtrlC(name);
    // should not throw
  });
});
