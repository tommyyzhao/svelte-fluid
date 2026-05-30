---
name: resume-fluid-session
description: Resume or close work sessions in the svelte-fluid repo by loading provider-agnostic local session memories, checking repo health, and saving new timestamped memories without overwriting prior handoffs. Use at the start of a svelte-fluid session, when asked to resume from previous work, or when preserving local session context for future agents.
---

# Resume Fluid Session

Use this skill only in the `svelte-fluid` repo.

## Local Memory

- Primary memory store: `.agents/memories/fluid-sessions/`
- Legacy fallback only: `.claude/handoff.md`
- Memory files are local-only and must not be committed.
- Never overwrite an existing memory file. Save each handoff as a new timestamped Markdown file.
- `latest.md` may be updated as a symlink pointer, but the target memory files must remain append-only.

To save a handoff, pipe Markdown into:

```sh
.agents/skills/resume-fluid-session/scripts/save-session-memory.sh --provider codex
```

Use the active provider name when it is known (`codex`, `claude`, `opencode`, etc.). The script writes a unique file and prints the saved path.

## Resume Workflow

1. Read the newest provider-agnostic memory from `.agents/memories/fluid-sessions/`.
2. If no provider-agnostic memory exists, read `.claude/handoff.md` as a one-time legacy fallback.
3. Check repo state before changing files:
   - `git status --short`
   - `git log --oneline -10`
   - `gh run list --limit 3`
4. If uncommitted work exists, flag it before making unrelated changes.
5. Verify baseline health with `bun run test && bun run check`.
6. Skim orientation files:
   - `CLAUDE.md`
   - `dev-docs/architecture.md` lines 1-100
   - `src/lib/engine/types.ts`
7. Present a concise briefing:
   - **State**: tests, typecheck, CI, last commit
   - **Last session**: 2-3 sentences from the memory
   - **Planned next**: top follow-ups from the memory
   - **Ready to go.**

## End Workflow

When asked to preserve the session or end the session:

1. Run the repo's required verification unless the user explicitly says to skip it:
   - `bun run test && bun run check && bun run prepack`
2. Inventory changed files with `git diff --stat`, `git diff --name-only`, and `git status --short`.
3. Write a self-contained Markdown handoff with:
   - project, branch, latest commit
   - current health and verification results
   - what changed this session, with file references
   - key files and architecture reminders
   - known issues and next steps
4. Save it with `scripts/save-session-memory.sh`; do not overwrite `.claude/handoff.md` or any existing memory file.
