import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface SessionBinding {
  threadId: string;
  tmuxSession: string;
  ownerUserId: string;
  cwd: string;
  createdAt: number;
  lastActivityAt: number;
  lastCaptureHash: string;
}

type Store = Record<string, SessionBinding>;

export class SessionStore {
  private data: Store;

  constructor(private filePath: string) {
    this.data = this.load();
  }

  private load(): Store {
    if (!existsSync(this.filePath)) return {};
    const raw = readFileSync(this.filePath, "utf-8");
    return JSON.parse(raw);
  }

  private save(): void {
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  get(threadId: string): SessionBinding | undefined {
    return this.data[threadId];
  }

  getAll(): Store {
    return { ...this.data };
  }

  set(threadId: string, binding: SessionBinding): void {
    this.data[threadId] = binding;
    this.save();
  }

  delete(threadId: string): void {
    delete this.data[threadId];
    this.save();
  }

  touch(threadId: string): void {
    if (this.data[threadId]) {
      this.data[threadId].lastActivityAt = Date.now();
      this.save();
    }
  }
}
