import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AuditLogger } from "./logger.js";
import { readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dirname, "../../.test-logs");
const TEST_FILE = join(TEST_DIR, "audit.jsonl");

describe("AuditLogger", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    logger = new AuditLogger(TEST_FILE);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("logs an entry as JSONL", () => {
    logger.log({
      actor: "user1",
      threadId: "t1",
      action: "new",
      result: "ok",
    });
    const content = readFileSync(TEST_FILE, "utf-8");
    const line = JSON.parse(content.trim());
    expect(line.actor).toBe("user1");
    expect(line.action).toBe("new");
    expect(line.timestamp).toBeDefined();
  });

  it("appends multiple entries", () => {
    logger.log({ actor: "a", threadId: "t", action: "new", result: "ok" });
    logger.log({ actor: "b", threadId: "t", action: "close", result: "ok" });
    const lines = readFileSync(TEST_FILE, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
  });
});
