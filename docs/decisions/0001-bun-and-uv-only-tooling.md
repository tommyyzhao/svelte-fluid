# ADR 0001: Bun and uv only — no npm, no node, no python

**Status:** Accepted
**Date:** 2026-04-06

## Context

The user constraint was explicit: "Everything done via `bun` or `uv` NO
EXCEPTIONS. No npm, no python3, only bun and uv (if any python is
needed at all)."

This affects scaffolding (sv create), package management, script
execution, and any helper tooling.

## Decision

- Project is scaffolded with `bunx sv@latest create svelte-fluid --template library --types ts --install bun --no-add-ons`.
- All `package.json` scripts run via `bun run …`. The default scaffold
  shipped with `vite build && npm run prepack` — we patched it to
  `vite build && bun run prepack`.
- Dependencies are installed via `bun install`, locked in `bun.lock`.
- No Python dependencies introduced (uv stays unused for now, but the
  constraint stands for future additions).
- Helper one-shots (e.g. base64-encoding the dithering PNG) use
  `bun -e "..."`.

## Consequences

**Positive:**
- The toolchain is one binary (`bun`). No shelling out to other
  package managers, no version mismatches between developer machines.
- `bun` is significantly faster than `npm`/`pnpm` for install + script
  execution, so dev iteration is snappy.
- The lockfile (`bun.lock`) is bun-native and small.

**Negative:**
- Contributors who don't have bun installed need to install it first.
  README documents this.
- Some npm-ecosystem tooling embeds `npx`/`npm run` in its output and
  has to be patched (the scaffold's `build` script was an example).

**Rejected alternatives:**
- *npm/pnpm/yarn:* Violates the user constraint.
- *Polyglot tooling (bun for some scripts, npm for others):* Defeats
  the constraint and introduces lockfile drift.
