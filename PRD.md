# PRD — channel-tmux (Discord ↔ tmux Bridge)

## 1) Background
Yanshroom wants to operate terminal workflows directly from Discord threads, with a simple interaction model: messages in thread become terminal input, and terminal output is returned to the same thread.

## 2) Goal
Ship a safe, minimal v1 bridge that enables remote CLI workflows from Discord with predictable thread/session isolation.

## 3) Success Criteria
- Authorized users can open a terminal session from a Discord thread in < 5s.
- Non-slash messages execute in the bound tmux session and return output.
- Every thread has at most one tmux session; no cross-thread attach.
- Idle sessions are automatically closed after 24h.
- Unauthorized users cannot execute commands.

## 4) In-Scope (v1)
1. Discord bot with slash commands: `/new`, `/status`, `/ctrlc`, `/close`.
2. Thread-to-session mapping persistence.
3. Message-to-stdin bridge for non-slash text.
4. Incremental stdout capture and Discord reply.
5. User allowlist (Yanshroom + luckyQuqi).
6. 24h idle timeout cleanup job.
7. Basic audit logs.

## 5) Out-of-Scope (v1)
- Rich TUI streaming fidelity guarantees (perfect curses rendering)
- Multi-session per thread
- Multi-tenant RBAC beyond fixed allowlist
- Web dashboard
- Full SSH emulation

## 6) User Stories
- As Yanshroom, I can open a session in a thread and run terminal commands directly.
- As luckyQuqi, I can use the same flow in my own thread.
- As an operator, I can see which thread maps to which tmux session.
- As a security-conscious owner, I know unauthorized users are blocked.

## 7) Functional Requirements
### FR-1 Authorization
- Only allowlisted Discord user IDs may invoke any command or input bridge.

### FR-2 Thread Binding
- `/new` in a thread creates one tmux session and stores binding.
- If a binding already exists for the thread, `/new` returns existing binding info.

### FR-3 Input Bridge
- Any non-slash message from authorized user in bound thread is sent to tmux as one command (with Enter).

### FR-4 Output Bridge
- Bot captures pane output incrementally and posts only new output (chunked for Discord limits).

### FR-5 Control Commands
- `/status` returns session state + idle duration.
- `/ctrlc` sends Ctrl+C to tmux.
- `/close` kills tmux session and removes binding.

### FR-6 Idle Cleanup
- Session auto-close when inactive for >24h.
- Inactivity = no user input in thread and no control commands.

### FR-7 Auditability
- Record actor, threadId, command type, timestamp, result in JSONL logs.

## 8) Non-Functional Requirements
- Reliability: bot restarts should preserve thread/session mapping.
- Safety: strict one-thread-one-session isolation.
- Operability: clear logs and actionable error messages.
- Performance: first response under 2s for lightweight commands.

## 9) Data Model (v1)
```ts
SessionBinding {
  threadId: string
  tmuxSession: string
  ownerUserId: string
  cwd: string
  createdAt: number
  lastActivityAt: number
  lastCaptureCursor?: string
}
```

## 10) Risks & Mitigations
- **Risk:** output spam / very long logs
  - Mitigation: chunking + truncation notice + optional `/tail` (future)
- **Risk:** tmux session orphaning
  - Mitigation: startup reconciliation (check tmux list vs JSON)
- **Risk:** accidental cross-thread use
  - Mitigation: hard check current threadId equals binding threadId

## 11) Milestones
- M1: Bot skeleton + auth + `/new` + `/status`
- M2: Input/output bridge + chunking
- M3: `/ctrlc` + `/close` + idle cleanup
- M4: audit logs + restart reconciliation + docs

## 12) Acceptance Test (v1)
1. Authorized user runs `/new` in thread A -> session created.
2. User sends `pwd` -> output from tmux returned in thread A.
3. Same user in thread B cannot control A’s session unless creating B session.
4. Unauthorized user command is denied.
5. After 24h idle (simulated), session auto-closes and mapping removed.
