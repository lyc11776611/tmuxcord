const MAX_LENGTH = 1800;

export class OutputPoller {
  private lastContent = "";
  private sameCount = 0;

  diff(currentContent: string): string | null {
    if (currentContent === this.lastContent) {
      this.sameCount++;
      return null;
    }

    this.sameCount = 0;
    let newContent: string;

    if (this.lastContent && currentContent.startsWith(this.lastContent)) {
      newContent = currentContent.slice(this.lastContent.length);
    } else {
      newContent = currentContent;
    }

    this.lastContent = currentContent;

    if (newContent.length > MAX_LENGTH) {
      newContent = "...(truncated)\n" + newContent.slice(-MAX_LENGTH + 20);
    }

    return newContent;
  }

  isStable(): boolean {
    return this.sameCount >= 3;
  }

  reset(): void {
    this.lastContent = "";
    this.sameCount = 0;
  }
}
