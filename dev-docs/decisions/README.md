# Architectural Decision Records

A chronological log of every key decision made during the design and
implementation of `svelte-fluid`. Each ADR is small, self-contained,
and follows a lightweight Context → Decision → Consequences template.

| # | Title | Status |
| - | --- | --- |
| [0001](./0001-bun-and-uv-only-tooling.md) | Bun and uv only — no npm, no node, no python | Accepted |
| [0002](./0002-engine-vs-component-split.md) | Framework-agnostic engine class + thin Svelte component | Accepted |
| [0003](./0003-seedable-prng-determinism.md) | Seedable mulberry32 PRNG for deterministic resize | Accepted |
| [0004](./0004-resize-via-component-resize-observer.md) | Resize handled by component ResizeObserver, not engine | Accepted |
| [0005](./0005-hot-update-buckets.md) | 4-bucket hot-update strategy in `setConfig` | Accepted |
| [0006](./0006-imperative-api-via-bind-this.md) | Imperative API via `export const handle` + `bind:this` | Accepted |
| [0007](./0007-dithering-inline-base64.md) | Inline LDR_LLL1_0.png as base64 | Accepted |
| [0008](./0008-throw-on-shader-errors.md) | Throw on shader compile/link failures | Accepted |
| [0009](./0009-pointer-coordinates-via-bounding-rect.md) | Pointer coordinates via `getBoundingClientRect` | Accepted |
| [0010](./0010-license-dual-mit.md) | Dual MIT license (Pavel Dobryakov + svelte-fluid contributors) | Accepted |
| [0011](./0011-camelcase-props-screaming-internal.md) | camelCase external props, SCREAMING_CASE internal config | Accepted |
| [0012](./0012-stable-seed-via-untrack.md) | Stable seed const via `untrack`, never `$state` | Accepted |
| [0013](./0013-ssr-safety-via-onmount.md) | All WebGL access deferred to `onMount` for SSR safety | Accepted |
| [0014](./0014-sveltekit-library-template.md) | SvelteKit library template + demo routes (single repo) | Accepted |
| [0015](./0015-preset-components.md) | Preset wrapper components + construct-only `presetSplats` field | Accepted |
| [0016](./0016-burn-in-density-dissipation.md) | Burn-in density dissipation via linear ramp | Accepted |
| [0017](./0017-continuous-random-splats.md) | Continuous random splat generation via config fields | Accepted |
| [0018](./0018-shaped-containers-mask-penalisation.md) | Shaped fluid containers via mask penalisation | Accepted |
| [0019](./0019-auto-pause-and-context-loss-recovery.md) | Automatic pause on visibility loss and WebGL context loss recovery | Accepted |
| [0020](./0020-random-splat-enhancements.md) | Random splat enhancements: swirl, spread, even spacing, jittered timing | Accepted |
| [0021](./0021-annulus-container-shape.md) | Annulus (circular ring) container shape | Accepted |
| [0022](./0022-apply-mask-performance-analysis.md) | applyMask performance analysis and optimization paths | Accepted |
| [0023](./0023-frame-outer-boundary-and-shape-aware-spawning.md) | Rounded outer frame boundary and shape-aware splat spawning | Accepted |
| [0024](./0024-svg-path-container-shapes.md) | SVG path container shapes via mask texture | Accepted |
| [0025](./0025-glass-refraction-post-processing.md) | Glass refraction/reflection post-processing layer | Accepted |
| [0026](./0026-background-fluid-component.md) | FluidBackground component with DOM exclusion zones | Accepted |

## How to add a new ADR

1. Copy an existing file as a template.
2. Increment the number.
3. Title in kebab-case after the number.
4. Set status to `Proposed`, `Accepted`, `Deprecated`, or `Superseded by ADR-NNNN`.
5. Add a row to the table above.
6. Keep it short. ADRs are not essays — they exist so a future
   maintainer can answer "why did they do it that way?" in 60 seconds.

## ADR template

```markdown
# ADR NNNN: short title

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
**Date:** YYYY-MM-DD

## Context
What problem are we solving? What constraints exist?

## Decision
What did we choose, in one or two sentences?

## Consequences
- What becomes easier?
- What becomes harder?
- What did we explicitly reject and why?
```
