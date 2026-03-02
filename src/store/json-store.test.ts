import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionStore, SessionBinding } from "./json-store.js";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dirname, "../../.test-data");
const TEST_FILE = join(TEST_DIR, "sessions.json");

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    store = new SessionStore(TEST_FILE);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("starts empty", () => {
    expect(store.getAll()).toEqual({});
  });

  it("sets and gets a binding", () => {
    const binding: SessionBinding = {
      threadId: "t1",
      tmuxSession: "ct-t1",
      ownerUserId: "u1",
      cwd: "/tmp",
      createdAt: 1000,
      lastActivityAt: 1000,
      lastCaptureHash: "",
    };
    store.set("t1", binding);
    expect(store.get("t1")).toEqual(binding);
  });

  it("persists to disk", () => {
    const binding: SessionBinding = {
      threadId: "t1",
      tmuxSession: "ct-t1",
      ownerUserId: "u1",
      cwd: "/tmp",
      createdAt: 1000,
      lastActivityAt: 1000,
      lastCaptureHash: "",
    };
    store.set("t1", binding);

    const store2 = new SessionStore(TEST_FILE);
    expect(store2.get("t1")).toEqual(binding);
  });

  it("deletes a binding", () => {
    const binding: SessionBinding = {
      threadId: "t1",
      tmuxSession: "ct-t1",
      ownerUserId: "u1",
      cwd: "/tmp",
      createdAt: 1000,
      lastActivityAt: 1000,
      lastCaptureHash: "",
    };
    store.set("t1", binding);
    store.delete("t1");
    expect(store.get("t1")).toBeUndefined();
  });

  it("updates lastActivityAt", () => {
    const binding: SessionBinding = {
      threadId: "t1",
      tmuxSession: "ct-t1",
      ownerUserId: "u1",
      cwd: "/tmp",
      createdAt: 1000,
      lastActivityAt: 1000,
      lastCaptureHash: "",
    };
    store.set("t1", binding);
    store.touch("t1");
    const updated = store.get("t1")!;
    expect(updated.lastActivityAt).toBeGreaterThan(1000);
  });
});
