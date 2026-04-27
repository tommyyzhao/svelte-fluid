Start-of-session briefing for svelte-fluid. Execute every step, then present a structured summary.

## 1. Read the handoff

Read `.claude/handoff.md` in full. This is the primary context source — it contains project state, recent changes, key files, known issues, and planned features from the previous session.

## 2. Check repo state

Run these in parallel:
- `git log --oneline -10` — recent commit history
- `git status` — any uncommitted work from a prior session
- `gh run list --limit 3` — CI and deploy status

If there's uncommitted work, flag it to the user before doing anything else.

## 3. Verify build health

Run `bun run test && bun run check` to confirm the codebase is clean. Report any failures immediately.

## 4. Quick orientation reads

Read these files (skim, don't dump to user) to refresh your mental model:
- `CLAUDE.md` — project conventions and invariants
- `dev-docs/architecture.md` (lines 1-100) — system design and module boundaries
- `src/lib/engine/types.ts` — current FluidConfig and ContainerShape definitions

## 5. Check for external changes

Run `git log --oneline HEAD~5..HEAD` and scan for commits not in the handoff — the user may have made changes between sessions.

## 6. Present briefing

Give the user a concise summary structured as:

**State**: [test count] tests passing, [error count] type errors, CI [status], last commit [hash] [message]

**Last session**: 2-3 sentence summary of what was built

**Planned next**: bulleted list of the top items from the handoff's "what needs attention next"

**Ready to go.** Ask the user what they'd like to work on.
