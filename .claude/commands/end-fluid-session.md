End-of-session checklist for svelte-fluid. Execute every step in order.

## 1. Verify clean state

Run `bun run test && bun run check && bun run prepack`. All three must pass with zero errors. If anything fails, fix it before proceeding.

## 2. Inventory changes

Run `git diff --stat` and `git diff --name-only` to see what changed. Read modified files to understand the scope. Categorize changes into: new features, bug fixes, demo changes, doc changes, preset tuning.

## 3. Update docs routes (canonical docs)

The docs site at `/docs` is the **canonical documentation**. When this session changed any of the following, update the corresponding route **now** — don't leave it for next session:

| What changed | Update this route |
|---|---|
| FluidConfig props (added, removed, defaults, behavior) | `src/routes/docs/configuration/+page.svelte` |
| Component-specific props (Fluid, FluidReveal, etc.) | `src/routes/docs/components/+page.svelte` |
| ContainerShape variants or fields | `src/routes/docs/shapes/+page.svelte` |
| Preset tuning or new presets | `src/routes/docs/presets/+page.svelte` |
| FluidHandle API, RGB, PresetSplat types | `src/routes/docs/api/+page.svelte` |
| Major new feature or workflow change | `src/routes/docs/+page.svelte` (Getting Started) |
| Any public API surface change | `src/routes/skills.md/+page.svelte` (LLM reference) |

Also check whether **internal** dev docs need updating:
- `dev-docs/architecture.md` — if module boundaries, ownership, or the component diagram changed
- `CONTRIBUTING.md` — if hard rules, workflows, or verification steps changed
- `dev-docs/learnings/*.md` — if you hit a non-obvious gotcha worth recording
- Consider whether an ADR in `dev-docs/decisions/` is needed for engine-level changes (required by project convention)

## 4. Update CHANGELOG.md

Add entries under `[Unreleased]` in the appropriate subsections (Added, Changed, Fixed, Documentation). Be specific — include prop names, file names, before/after values for tuning changes.

## 5. Stage and commit

Stage all changed files by name (never `git add -A`). Write a structured commit message with:
- One-line summary starting with conventional commit prefix (feat/fix/chore/docs)
- Grouped sections: New features, Bug fixes, Demo changes, Preset tuning, Docs
- End with `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

## 6. Push and verify deploy

Run `git push origin main`. Then run `gh run list --limit 3` to verify both CI and Deploy workflows triggered. Report status to user.

## 7. Regenerate handoff (local-only — NOT committed)

Overwrite `.claude/handoff.md` with a comprehensive handoff. This file is gitignored and stays on the local machine only. It contains:

- **Project**: repo URL, branch, latest commit hash
- **Current state**: test count, type error count, build status, component count, preset count, shape count, ADR count, demo instance count, docs page count
- **What this session built**: numbered list of every change with file references
- **Key files table**: the ~15 most important files with one-line role descriptions (include docs routes)
- **What needs attention next**: categorized into Planned features (from user), Known issues, and Follow-ups
- **Architecture quick-reference**: the 4-bucket system, container shape pipeline, lazy/autoPause behavior, key invariants

The handoff must be self-contained — a future Claude instance reading only this file should be able to start working immediately without reading the entire codebase.

## 8. Final summary

Print a concise summary to the user: what was committed, CI status, and the top 3 things to tackle next session.
