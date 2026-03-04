const MAX_LENGTH = 1800;

export class OutputPoller {
  private lastContent = "";
  private sameCount = 0;

  diff(currentContent: string): string | null {
    const trimmed = currentContent.trimEnd();

    if (trimmed === this.lastContent) {
      this.sameCount++;
      return null;
    }

    // Check if this is a minor TUI redraw (spinner, cursor, timing)
    // Spinner/cursor changes only 1-2 lines; streaming changes 3+
    if (this.lastContent) {
      const oldLines = this.lastContent.split("\n");
      const newLines = trimmed.split("\n");
      if (oldLines.length === newLines.length && oldLines.length > 3) {
        let diffCount = 0;
        for (let i = 0; i < oldLines.length; i++) {
          if (oldLines[i] !== newLines[i]) diffCount++;
        }
        if (diffCount <= 2) {
          // Only 1-2 lines changed — spinner/cursor/timing redraw
          // Update lastContent but do NOT increment sameCount —
          // the terminal is still active (spinner running), not stable
          this.lastContent = trimmed;
          return null;
        }
      }
    }

    this.sameCount = 0;
    let newContent: string;

    if (this.lastContent && trimmed.startsWith(this.lastContent)) {
      // Simple case: new content appended
      newContent = trimmed.slice(this.lastContent.length).replace(/^\n/, "");
    } else if (this.lastContent) {
      // Scrollback shifted — find overlap via suffix-prefix matching
      const oldLines = this.lastContent.split("\n");
      const newLines = trimmed.split("\n");
      let matchLen = 0;
      for (let len = 1; len <= Math.min(oldLines.length, newLines.length); len++) {
        const oldSuffix = oldLines.slice(-len);
        const newPrefix = newLines.slice(0, len);
        if (oldSuffix.every((line, i) => line === newPrefix[i])) {
          matchLen = len;
        }
      }
      newContent = newLines.slice(matchLen).join("\n");
    } else {
      newContent = trimmed;
    }

    this.lastContent = trimmed;

    if (newContent.length > MAX_LENGTH) {
      newContent = "...(truncated)\n" + newContent.slice(-MAX_LENGTH + 20);
    }

    return newContent;
  }

  isStable(): boolean {
    return this.sameCount >= 3;
  }

  resetStability(): void {
    this.sameCount = 0;
  }

  reset(): void {
    this.lastContent = "";
    this.sameCount = 0;
  }

  getLastContent(): string {
    return this.lastContent;
  }
}
