# ADR 0011: camelCase external props, SCREAMING_CASE internal config

**Status:** Accepted
**Date:** 2026-04-06

## Context

The original `config` object uses SCREAMING_CASE field names
(`SIM_RESOLUTION`, `BLOOM_INTENSITY`, etc) — likely a holdover from
GLSL `#define` style or just author preference. Modern Svelte
components and JavaScript ecosystems strongly prefer camelCase props.

Two competing concerns:

1. The port should be a *mechanical* translation of the original to
   minimize the chance of introducing physics bugs. Renaming every
   field everywhere is risky.
2. The public API should look idiomatic to Svelte/TypeScript
   consumers. Nobody wants to write `<Fluid SIM_RESOLUTION={128} />`.

## Decision

Maintain two parallel naming conventions, joined by a `resolveConfig`
function:

- **`FluidConfig`** (`engine/types.ts`): camelCase, every field
  optional. This is what `<Fluid />` props look like and what the
  imperative API receives. Example: `simResolution`, `bloomIntensity`,
  `densityDissipation`.
- **`ResolvedConfig`** (`engine/types.ts`): SCREAMING_CASE, every
  field required. This is what the engine works with internally and
  matches the original `script.js` `config` object name-for-name.
  Example: `SIM_RESOLUTION`, `BLOOM_INTENSITY`, `DENSITY_DISSIPATION`.
- **`resolveConfig(input, base)`** (`engine/FluidEngine.ts`): walks
  every camelCase field and writes the SCREAMING_CASE equivalent into
  a fresh `ResolvedConfig`, leaving missing fields at their defaults.

The engine's hot-update path also goes through `resolveConfig`, so
hot-updated camelCase props are translated the same way as
construction-time ones.

## Consequences

**Positive:**
- Consumers see a clean, idiomatic Svelte API.
- The engine code is a near-line-for-line port of the original — no
  field renames make the diff easier to audit for physics bugs.
- TypeScript catches typos in both directions (`FluidConfig` is
  strict; `ResolvedConfig` is strict).
- Adding a new field requires touching three places (the two
  interfaces and the resolver), which is a useful checklist that
  prevents half-finished implementations.

**Negative:**
- Two places to update for every new field. Mitigated by the
  resolver living next to `DEFAULTS` and being short enough that
  forgetting one is hard to miss.
- Slight runtime cost on construction (the resolver walks ~28
  fields). Negligible — runs once per mount or per `setConfig` call.

**Rejected alternatives:**
- *camelCase everywhere (rename engine fields):* Big bang refactor
  of script.js with many opportunities for typos and physics bugs.
  Not worth it.
- *SCREAMING_CASE everywhere (force ugly props on consumers):*
  Idiomatic Svelte requires camelCase. Hard no.
- *snake_case as a middle ground:* Idiomatic for nothing. No.
