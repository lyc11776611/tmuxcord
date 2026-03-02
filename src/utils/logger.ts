import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface AuditEntry {
  actor: string;
  threadId: string;
  action: string;
  result: string;
  detail?: string;
}

export class AuditLogger {
  constructor(private filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  log(entry: AuditEntry): void {
    const record = { ...entry, timestamp: new Date().toISOString() };
    appendFileSync(this.filePath, JSON.stringify(record) + "\n");
  }
}
