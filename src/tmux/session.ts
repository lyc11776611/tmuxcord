import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class TmuxSession {
  static async create(name: string, cwd: string): Promise<void> {
    await execFileAsync("tmux", [
      "new-session", "-d", "-s", name, "-x", "200", "-y", "50", "-c", cwd,
    ]);
  }

  static async kill(name: string): Promise<void> {
    await execFileAsync("tmux", ["kill-session", "-t", name]);
  }

  static async sendKeys(name: string, text: string): Promise<void> {
    // Send text literally (-l prevents interpreting key names),
    // then send Enter separately for reliable execution in TUIs like Claude Code
    await execFileAsync("tmux", ["send-keys", "-t", name, "-l", text]);
    await execFileAsync("tmux", ["send-keys", "-t", name, "Enter"]);
  }

  static async sendCtrlC(name: string): Promise<void> {
    await execFileAsync("tmux", ["send-keys", "-t", name, "C-c"]);
  }

  static async sendRaw(name: string, keys: string): Promise<void> {
    await execFileAsync("tmux", ["send-keys", "-t", name, keys]);
  }

  static async capturePane(name: string): Promise<string> {
    const { stdout } = await execFileAsync("tmux", [
      "capture-pane", "-t", name, "-p", "-S", "-100",
    ]);
    return stdout;
  }

  static async capturePaneAnsi(name: string): Promise<string> {
    const { stdout } = await execFileAsync("tmux", [
      "capture-pane", "-t", name, "-p", "-e", "-S", "-100",
    ]);
    return stdout;
  }

  static async capturePaneFull(name: string): Promise<string> {
    const { stdout } = await execFileAsync("tmux", [
      "capture-pane", "-t", name, "-p", "-e", "-S", "-",
    ]);
    return stdout;
  }

  static async exists(name: string): Promise<boolean> {
    try {
      await execFileAsync("tmux", ["has-session", "-t", name]);
      return true;
    } catch {
      return false;
    }
  }

  static async listSessions(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync("tmux", [
        "list-sessions", "-F", "#{session_name}",
      ]);
      return stdout.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }
}
