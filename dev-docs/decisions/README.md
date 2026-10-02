# Architectural Decision Records

A chronological log of every key decision made during the design and
implementation of `svelte-fluid`. Each ADR is small, self-contained,
and follows a lightweight Context → Decision → Consequences template.

| #                                                               | Title                                                                   | Status   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| [0001](./0001-bun-and-uv-only-tooling.md)                       | Bun and uv only — no npm, no node, no python                            | Accepted |
| [0002](./0002-engine-vs-component-split.md)                     | Framework-agnostic engine class + thin Svelte component                 | Accepted |
| [0003](./0003-seedable-prng-determinism.md)                     | Seedable mulberry32 PRNG for deterministic resize                       | Accepted |
| [0004](./0004-resize-via-component-resize-observer.md)          | Resize handled by component ResizeObserver, not engine                  | Superseded in part by 0059 |
| [0005](./0005-hot-update-buckets.md)                            | 4-bucket hot-update strategy in `setConfig`                             | Accepted |
| [0006](./0006-imperative-api-via-bind-this.md)                  | Imperative API via `export const handle` + `bind:this`                  | Accepted |
| [0007](./0007-dithering-inline-base64.md)                       | Inline LDR_LLL1_0.png as base64                                         | Accepted |
| [0008](./0008-throw-on-shader-errors.md)                        | Throw on shader compile/link failures                                   | Accepted |
| [0009](./0009-pointer-coordinates-via-bounding-rect.md)         | Pointer coordinates via `getBoundingClientRect`                         | Accepted |
| [0010](./0010-license-dual-mit.md)                              | Dual MIT license (Pavel Dobryakov + svelte-fluid contributors)          | Accepted |
| [0011](./0011-camelcase-props-screaming-internal.md)            | camelCase external props, SCREAMING_CASE internal config                | Accepted |
| [0012](./0012-stable-seed-via-untrack.md)                       | Stable seed const via `untrack`, never `$state`                         | Accepted |
| [0013](./0013-ssr-safety-via-onmount.md)                        | All WebGL access deferred to `onMount` for SSR safety                   | Accepted |
| [0014](./0014-sveltekit-library-template.md)                    | SvelteKit library template + demo routes (single repo)                  | Accepted |
| [0015](./0015-preset-components.md)                             | Preset wrapper components + construct-only `presetSplats` field         | Accepted |
| [0016](./0016-burn-in-density-dissipation.md)                   | Burn-in density dissipation via linear ramp                             | Accepted |
| [0017](./0017-continuous-random-splats.md)                      | Continuous random splat generation via config fields                    | Accepted |
| [0018](./0018-shaped-containers-mask-penalisation.md)           | Shaped fluid containers via mask penalisation                           | Accepted |
| [0019](./0019-auto-pause-and-context-loss-recovery.md)          | Automatic pause on visibility loss and WebGL context loss recovery      | Accepted |
| [0020](./0020-random-splat-enhancements.md)                     | Random splat enhancements: swirl, spread, even spacing, jittered timing | Accepted |
| [0021](./0021-annulus-container-shape.md)                       | Annulus (circular ring) container shape                                 | Accepted |
| [0022](./0022-apply-mask-performance-analysis.md)               | applyMask performance analysis and optimization paths                   | Accepted |
| [0023](./0023-frame-outer-boundary-and-shape-aware-spawning.md) | Rounded outer frame boundary and shape-aware splat spawning             | Accepted |
| [0024](./0024-svg-path-container-shapes.md)                     | SVG path container shapes via mask texture                              | Accepted |
| [0025](./0025-glass-refraction-post-processing.md)              | Glass refraction/reflection post-processing layer                       | Accepted |
| [0026](./0026-background-fluid-component.md)                    | FluidBackground component with DOM exclusion zones                      | Accepted |
| [0027](./0027-fluid-reveal-mode.md)                             | FluidReveal — fluid as opacity mask                                     | Accepted |
| [0028](./0028-reveal-multiplicative-dissipation.md)             | Multiplicative dissipation for reveal mode                              | Accepted |
| [0029](./0029-reveal-cover-accent-colors.md)                    | Reveal cover and accent color customization                             | Accepted |
| [0030](./0030-fluid-distortion-component.md)                    | FluidDistortion — velocity-driven image warping                         | Accepted |
| [0031](./0031-fluid-stick-architecture.md)                      | FluidStick — physics-level dye sticking via mask texture                | Accepted |
| [0032](./0032-expose-splatonhover-on-stylistic-presets.md)      | Expose `splatOnHover` on stylistic preset wrappers                      | Accepted |
| [0033](./0033-expose-backcolor-on-preset-wrappers.md)           | Expose `backColor` override on preset wrappers                          | Accepted |
| [0034](./0034-interior-obstructions.md)                         | Interior obstructions the fluid flows around                            | Accepted |
| [0035](./0035-obstruction-physics-presets.md)                   | Obstruction-based fluid-dynamics presets + demos                        | Accepted |
| [0036](./0036-believable-flow-scene-api.md)                     | Believable Flow Scene API                                               | Accepted |
| [0037](./0037-lightweight-cfd-stability-controls.md)            | Lightweight CFD stability controls                                      | Accepted |
| [0038](./0038-solver-pass-restructuring.md)                     | Solver pass restructuring                                               | Accepted |
| [0039](./0039-obstruction-fill-color.md)                        | Obstruction fill color (`obstructionColor`)                             | Accepted |
| [0040](./0040-preset-config-registry.md)                        | Internal preset config registry (single source of truth)               | Accepted |
| [0041](./0041-webgl-unavailable-fallback.md)                    | Graceful, accessible WebGL-unavailable fallback                        | Accepted |
| [0051](./0051-sustained-performance-governor-overload.md)       | Sustained performance-governor overload                                | Accepted |
| [0052](./0052-maccormack-solid-clearance-guard.md)               | Guard MacCormack traces with solid clearance                           | Accepted |
| [0053](./0053-context-restore-recreates-resources.md)            | Context restore recreates resources and opening state                  | Accepted |
| [0054](./0054-refresh-aware-governor-budget.md)                  | Refresh-aware governor budget and independent catch-up time            | Accepted |
| [0055](./0055-framebuffer-resource-ownership.md)                 | Explicit framebuffer resource ownership                               | Accepted |
| [0056](./0056-projection-resolution-sweep.md)                   | Projection resolution sweep keeps the pressure ladder gated           | Accepted |
| [0057](./0057-whole-frame-profiler.md)                          | Whole-frame profiler with inert opt-in instrumentation                 | Accepted |
| [0058](./0058-state-preserving-engine-resize.md)                | State-preserving in-place engine resize                                | Accepted |
| [0059](./0059-component-coalesces-in-place-resize.md)           | Component coalesces in-place resize transitions                        | Accepted |
| [0060](./0060-css-quality-and-capped-physical-dpr.md)           | CSS quality policy with capped physical DPR                            | Accepted |
| [0061](./0061-lazy-optional-framebuffers.md)                    | Optional framebuffers exist only while active                          | Accepted |
| [0062](./0062-selected-program-compilation.md)                  | Compile and cache only selected engine programs                        | Accepted |
| [0063](./0063-conservative-empty-solver-skip.md)                | Skip solver work only while emptiness is provable                      | Accepted |
| [0064](./0064-dirty-rendering-while-paused.md)                  | Render paused scenes only after invalidation                           | Accepted |
| [0065](./0065-fractional-aperture-gate-stays-closed.md)         | Keep fractional face apertures gated                                  | Accepted |
| [0066](./0066-resolution-normalized-adaptive-vorticity.md)      | Normalize adaptive vorticity before gating                            | Accepted |
| [0079](./0079-bound-imperative-input.md)                       | Bound imperative input and reject non-finite values                   | Accepted |
| [0080](./0080-shared-frame-scheduler.md)                       | One shared animation frame for all engines                            | Accepted |
| [0081](./0081-linear-display-pipeline.md)                      | Display pipeline: opt-in tone mapping, exact backColor, dithering     | Accepted |
| [0082](./0082-shared-gl-context.md)                            | One shared WebGL context and program cache for all instances          | Proposed |
| [0083](./0083-pointer-events-input.md)                         | Pointer Events input, capture, and deliberate touch-action            | Accepted |
| [0084](./0084-jump-flood-mask-sdf.md)                          | GPU jump-flood SDF for pixel-width mask edges                         | Accepted |
| [0085](./0085-reduced-motion-still-and-frame-failure.md)       | Reduced-motion still frame and terminal frame-failure fallback        | Accepted |
| [0087](./0087-optical-depth-lighting.md)                       | Lighting from optical-depth dye geometry; opt-in specular/refraction  | Accepted |
| [0088](./0088-shared-gl-host-for-model-engines.md)             | Shared WebGL2 host for model engines                                  | Accepted |
| [0089](./0089-native-dpr-default.md)                           | Native DPR by default, measured by synced throughput                  | Accepted |
| [0086](./0086-text-contrast-floor.md)                          | Opt-in WCAG contrast floor in the display pass; FluidText default 3:1 | Accepted |
| [0090](./0090-pigment-model.md)                                | Pigment model: 12-band Kubelka–Munk, wet-to-deposited transfer, paper height | Accepted |
| [0091](./0091-height-field-surface.md)                         | Height-field surface: damped wave stencil, Fresnel and studio environment, area-ratio caustics | Accepted |
| [0092](./0092-liquid-controls.md)                              | Liquid controls: native elements, label contrast budget, still states | Accepted |
| [0093](./0093-fluid-engine-on-shared-gl-host.md)              | FluidEngine context tiers: own contexts, then the shared host        | Accepted |
| [0094](./0094-liquid-drop-zone-and-caustics.md)                | Liquid drop zone: native file input, four-wall analytic climb          | Accepted |
| [0095](./0095-material-promotion-disposition.md)              | Which R&D materials are promoted to WebGL2                            | Accepted |
| [0096](./0096-foil-switch.md)                                  | FoilSwitch: R&D snap foil on the shared WebGL2 host, borderless native switch | Accepted |

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
