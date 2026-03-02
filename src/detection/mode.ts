export type PaneMode = "shell" | "claude" | "permission" | "choice" | "processing";

export interface DetectionResult {
  mode: PaneMode;
  buttons?: { label: string; key: string }[];
}

export function detectMode(paneText: string): DetectionResult {
  const trimmed = paneText.trim();

  // Check for permission prompt (Allow/Deny pattern)
  if (/\bAllow\b/.test(trimmed) && /\bDeny\b/.test(trimmed)) {
    const buttons: { label: string; key: string }[] = [
      { label: "Allow", key: "y" },
      { label: "Deny", key: "n" },
    ];
    if (/Don't ask again/.test(trimmed)) {
      buttons.push({ label: "Always Allow", key: "!" });
    }
    return { mode: "permission", buttons };
  }

  // Check for numbered choice list (handles > prefix from Claude Code selection UI)
  const choicePattern = /^\s*[❯>]?\s*(\d+)\.\s+(.+)$/gm;
  const choices: { label: string; key: string }[] = [];
  let match;
  while ((match = choicePattern.exec(trimmed)) !== null) {
    choices.push({ label: match[2].trim(), key: match[1] });
  }
  if (choices.length >= 2) {
    return { mode: "choice", buttons: choices };
  }

  // Check for Claude Code (prompt character or header)
  if (/Claude Code/.test(trimmed)) {
    return { mode: "claude" };
  }

  // Check for shell prompt
  if (/[$#]\s*$/m.test(trimmed)) {
    return { mode: "shell" };
  }

  // Default: something is running
  return { mode: "processing" };
}
