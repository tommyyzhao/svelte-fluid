---
name: end-fluid-session
description: End a svelte-fluid work session by verifying repo health, inventorying changes, and saving a provider-agnostic local session memory as a new timestamped file without overwriting earlier handoffs. Use when asked to end, close, hand off, preserve, or save a svelte-fluid session.
---

# End Fluid Session

Use this skill only in the `svelte-fluid` repo.

## Local Memory

- Primary memory store: `.agents/memories/fluid-sessions/`
- Memory files are local-only and must not be committed.
- Never overwrite an existing memory file. Save each handoff as a new timestamped Markdown file.
- `latest.md` may be updated as a symlink pointer, but existing timestamped memory files are append-only.
- `.claude/handoff.md` is a legacy fallback for resume only; do not overwrite it from this workflow.

Save handoff Markdown by piping it into:

```sh
.agents/skills/end-fluid-session/scripts/save-session-memory.sh --provider codex
```

Use the active provider name when known (`codex`, `claude`, `opencode`, etc.). The helper writes a unique file and prints the saved path.

## Workflow

1. Run verification unless the user explicitly says to skip it:
   - `bun run test && bun run check && bun run prepack`
2. Inventory the workspace:
   - `git status --short`
   - `git diff --stat`
   - `git diff --name-only`
3. Read changed files as needed to summarize the session accurately. Do not include unrelated user changes as your own work.
4. Update canonical docs or changelog only when the session changed public behavior and the repo instructions require it.
5. If committing is part of the user's request, stage files by name and use provider-specific co-author metadata only when the user asks for it or the active toolchain requires it.
6. Write a self-contained Markdown handoff with:
   - project, branch, latest commit hash
   - current verification results
   - what changed this session, with file references
   - important local/uncommitted state
   - key architecture reminders
   - known issues and next steps
7. Save the handoff with `scripts/save-session-memory.sh`. Do not overwrite `.claude/handoff.md` or any existing file in `.agents/memories/fluid-sessions/`.
