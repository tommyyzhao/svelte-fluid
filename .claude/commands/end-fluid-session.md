End-of-session checklist for svelte-fluid. Execute every step in order.

## 1. Verify clean state

Run `bun run test && bun run check && bun run prepack`. All three must pass with zero errors. If anything fails, fix it before proceeding.

## 2. Inventory changes

Run `git diff --stat` and `git diff --name-only` to see what changed. Read modified files to understand the scope. Categorize changes into: new features, bug fixes, demo changes, doc changes, preset tuning.

## 3. Update CHANGELOG.md

Add entries under `[Unreleased]` in the appropriate subsections (Added, Changed, Fixed, Documentation). Be specific — include prop names, file names, before/after values for tuning changes.

## 4. Update docs if needed

Check whether these need updating based on what changed:
- `docs/architecture.md` — if new props, new handlers, new shaders, or bucket assignments changed
- `docs/contributing.md` — if demo instance count changed, new hard rules, or workflow changes
- `docs/learnings/presets.md` — if preset tuning changed
- Consider whether an ADR is needed for engine-level changes (required by project convention)

## 5. Stage and commit

Stage all changed files by name (never `git add -A`). Write a structured commit message with:
- One-line summary starting with conventional commit prefix (feat/fix/chore/docs)
- Grouped sections: New features, Bug fixes, Demo changes, Preset tuning, Docs
- End with `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

## 6. Push and verify deploy

Run `git push origin main`. Then run `gh run list --limit 3` to verify both CI and Deploy workflows triggered. Report status to user.

## 7. Regenerate handoff

Overwrite `.claude/handoff.md` with a comprehensive handoff containing:

- **Project**: repo URL, branch, latest commit hash
- **Current state**: test count, type error count, build status, preset count, shape count, ADR count, demo instance count
- **What this session built**: numbered list of every change with file references
- **Key files table**: the ~12 most important files with one-line role descriptions
- **What needs attention next**: categorized into Planned features (from user), Known issues, and Follow-ups
- **Architecture quick-reference**: the 4-bucket system, container shape pipeline, lazy/autoPause behavior, key invariants

The handoff must be self-contained — a future Claude instance reading only this file should be able to start working immediately without reading the entire codebase.

## 8. Final summary

Print a concise summary to the user: what was committed, CI status, and the top 3 things to tackle next session.
