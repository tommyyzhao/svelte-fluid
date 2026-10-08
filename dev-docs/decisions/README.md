# Architectural Decision Records

A chronological log of every key decision made during the design and
implementation of `svelte-fluid`. Each ADR is small, self-contained,
and follows a lightweight Context → Decision → Consequences template.

| # | Title | Status |
| --- | --- | --- |
| [0001](./0001-bun-and-uv-only-tooling.md) | Bun and uv only — no npm, no node, no python | Accepted |
| [0002](./0002-engine-vs-component-split.md) | Framework-agnostic engine class + thin Svelte component | Accepted |
| [0003](./0003-seedable-prng-determinism.md) | Seedable mulberry32 PRNG for deterministic resize | Accepted |
| [0004](./0004-resize-via-component-resize-observer.md) | Resize handled by component ResizeObserver, not engine | Superseded in part by 0059 |
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
| [0027](./0027-fluid-reveal-mode.md) | FluidReveal — fluid as opacity mask | Accepted |
| [0028](./0028-reveal-multiplicative-dissipation.md) | Multiplicative dissipation for reveal mode | Accepted |
| [0029](./0029-reveal-cover-accent-colors.md) | Reveal cover and accent color customization | Accepted |
| [0030](./0030-fluid-distortion-component.md) | FluidDistortion — velocity-driven image warping | Accepted |
| [0031](./0031-fluid-stick-architecture.md) | FluidStick — physics-level dye sticking via mask texture | Accepted |
| [0032](./0032-expose-splatonhover-on-stylistic-presets.md) | Expose `splatOnHover` on stylistic preset wrappers | Accepted |
| [0033](./0033-expose-backcolor-on-preset-wrappers.md) | Expose `backColor` override on preset wrappers | Accepted |
| [0034](./0034-interior-obstructions.md) | Interior obstructions the fluid flows around | Accepted |
| [0035](./0035-obstruction-physics-presets.md) | Obstruction-based fluid-dynamics presets + demos | Accepted |
| [0036](./0036-believable-flow-scene-api.md) | Believable Flow Scene API | Accepted |
| [0037](./0037-lightweight-cfd-stability-controls.md) | Lightweight CFD stability controls | Accepted |
| [0038](./0038-solver-pass-restructuring.md) | Solver pass restructuring | Accepted |
| [0039](./0039-obstruction-fill-color.md) | Obstruction fill color (`obstructionColor`) | Accepted |
| [0040](./0040-preset-config-registry.md) | Internal preset config registry (single source of truth) | Accepted |
| [0041](./0041-webgl-unavailable-fallback.md) | Graceful, accessible WebGL-unavailable fallback | Accepted |
| [0042](./0042-epic-0001-restructure-and-measurement-harness.md) | Epic 0001 restructure, measurement harness, and planning-process fixes | Accepted |
| [0043](./0043-phase-5-resolution-gauge.md) | Screen-isotropic resolution gauge for `viscosity` and `curl` (Phase 5) | Accepted |
| [0044](./0044-phase-5-adaptive-confinement.md) | Adaptive vorticity confinement via `vorticityAdaptive`/`uAdaptiveMix` (Phase 5) | In-task |
| [0045](./0045-phase-5-vorticity-boundary-fix.md) | Confinement boundary attenuation via solid-neighbor texture (Phase 5) | Accepted |
| [0046](./0046-phase-2-maccormack-velocity-advection.md) | Opt-in velocity-only MacCormack advection (Epic 0001 Phase 2) | In-task |
| [0047](./0047-bucket-a-frame-time-governor.md) | Bucket-A frame-time governor | Accepted |
| [0048](./0048-public-advection-scheme-config.md) | Public construct-only advectionScheme config | Accepted |
| [0049](./0049-maccormack-flow-retune-declined.md) | Decline MacCormack retune for the flow presets | Accepted |
| [0050](./0050-golden-image-declined.md) | Decline CI golden-image visual regression testing | Accepted |
| [0051](./0051-sustained-performance-governor-overload.md) | Sustained performance-governor overload | Accepted |
| [0052](./0052-maccormack-solid-clearance-guard.md) | Guard MacCormack traces with solid clearance | Accepted |
| [0053](./0053-context-restore-recreates-resources.md) | Context restore recreates resources and opening state | Accepted |
| [0054](./0054-refresh-aware-governor-budget.md) | Refresh-aware governor budget and independent catch-up time | Accepted |
| [0055](./0055-framebuffer-resource-ownership.md) | Explicit framebuffer resource ownership | Accepted |
| [0056](./0056-projection-resolution-sweep.md) | Projection resolution sweep keeps the pressure ladder gated | Accepted |
| [0057](./0057-whole-frame-profiler.md) | Whole-frame profiler with inert opt-in instrumentation | Accepted |
| [0058](./0058-state-preserving-engine-resize.md) | State-preserving in-place engine resize | Accepted |
| [0059](./0059-component-coalesces-in-place-resize.md) | Component coalesces in-place resize transitions | Accepted |
| [0060](./0060-css-quality-and-capped-physical-dpr.md) | CSS quality policy with capped physical DPR | Accepted |
| [0061](./0061-lazy-optional-framebuffers.md) | Optional framebuffers exist only while active | Accepted |
| [0062](./0062-selected-program-compilation.md) | Compile and cache only selected engine programs | Accepted |
| [0063](./0063-conservative-empty-solver-skip.md) | Skip solver work only while emptiness is provable | Accepted (2026-07-11); partly superseded by ADR 0099 (decayed scenes now settle) |
| [0064](./0064-dirty-rendering-while-paused.md) | Render paused scenes only after invalidation | Accepted |
| [0065](./0065-fractional-aperture-gate-stays-closed.md) | Keep fractional face apertures gated | Accepted |
| [0066](./0066-resolution-normalized-adaptive-vorticity.md) | Normalize adaptive vorticity before gating | Accepted |
| [0079](./0079-bound-imperative-input.md) | Bound imperative input and reject non-finite values | Accepted |
| [0080](./0080-shared-frame-scheduler.md) | One shared animation frame for all engines | Accepted |
| [0081](./0081-linear-display-pipeline.md) | Display pipeline: opt-in tone mapping, exact backColor, dithering | Accepted |
| [0082](./0082-shared-gl-context.md) | One shared WebGL context and program cache for all instances | Accepted |
| [0083](./0083-pointer-events-input.md) | Pointer Events input, capture, and deliberate touch-action | Accepted |
| [0084](./0084-jump-flood-mask-sdf.md) | GPU jump-flood SDF for pixel-width mask edges | Accepted |
| [0085](./0085-reduced-motion-still-and-frame-failure.md) | Reduced-motion still frame and terminal frame-failure fallback | Accepted |
| [0086](./0086-text-contrast-floor.md) | Opt-in WCAG contrast floor in the display pass; FluidText default 3:1 | Accepted |
| [0087](./0087-optical-depth-lighting.md) | Lighting from optical-depth dye geometry; opt-in specular/refraction | Superseded in part by 0100; optical-depth measurements historical |
| [0088](./0088-shared-gl-host-for-model-engines.md) | Shared WebGL2 host for model engines | Accepted |
| [0089](./0089-native-dpr-default.md) | Native DPR by default, measured by synced throughput | Accepted |
| [0090](./0090-pigment-model.md) | Pigment model: 12-band Kubelka–Munk, wet-to-deposited transfer, paper height | Accepted |
| [0091](./0091-height-field-surface.md) | Height-field surface: damped wave stencil, Fresnel and studio environment, area-ratio caustics | Accepted |
| [0092](./0092-liquid-controls.md) | Liquid controls: native elements, label contrast budget, still states | Accepted |
| [0093](./0093-fluid-engine-on-shared-gl-host.md) | FluidEngine context tiers: own contexts, then the shared host | Accepted |
| [0094](./0094-liquid-drop-zone-and-caustics.md) | Liquid drop zone (four-wall analytic climb); interaction-only caustics overlay (regularized area ratio, contrast-clamped) | Accepted |
| [0095](./0095-material-promotion-disposition.md) | Which R&D materials are promoted to WebGL2 | Accepted |
| [0096](./0096-foil-switch.md) | FoilSwitch: R&D snap foil on the shared WebGL2 host, borderless native switch | Accepted |
| [0097](./0097-enamel-text.md) | EnamelText: compliant enamel on glyphs, gather-form pair transport, glyph contrast band | Accepted |
| [0098](./0098-gl-neutral-public-declarations.md) | Public declarations are GL-type-neutral; internal GL types removed from the root | Accepted |
| [0099](./0099-settle-visible-idle-fluid.md) | Settle a visible idle fluid to zero frames | Accepted |
| [0100](./0100-independent-deposited-thickness.md) | Independent deposited thickness in dye alpha | Accepted; visual review pending |
| [0101](./0101-p95-gpu-budget.md) | p95 GPU execution budget at native DPR; post hoc owner decision | Accepted |
| [0102](./0102-solver-display-optimisation-rejected.md) | Reject solver/display candidates failing parity or native timing | Accepted (negative result) |
| [0103](./0103-untransformed-shared-snapshots.md) | Preserve the shared snapshot's sRGB tag; remove redundant native-size raster transform | Accepted |
| [0104](./0104-pigment-pressure-pairing.md) | Pigment warm-start fold and paired pressure iterations; budget still FAIL | Accepted |
| [0105](./0105-stable-gpu-budget-protocol.md) | Pre-registered 600-frame / three-run native GPU budget protocol | Accepted |
| [0106](./0106-teslavalve-quality-budget.md) | TeslaValve quality budget: sim 128 / pressure 26 / dye 512 | Accepted |
| [0107](./0107-energy-quality-docs-eval-protocol.md) | Pre-registered energy / visual-quality / agent-docs eval protocol and hill-climb rule | Accepted |
| [0108](./0108-dv2-engine-contract-closure.md) | dv2 bounded idle/cache/geometry contract closure | Accepted (scope/contract); owner appearance pending |
| [0109](./0109-frame-rate-cap.md) | Per-instance 60 fps frame cap: rejected by E2 visual guardrail (step-count-dependent physics) | Rejected |
| [0110](./0110-presentation-rate-cap.md) | Presentation-only rate cap; preserve every solver frame | Accepted as opt-in (default 0); default-on not adopted |
| [0111](./0111-component-excellence-eval.md) | Pre-registered E4 component excellence, installability, accessibility and bundle cost | Accepted |
| [0113](./0113-half-dye-default.md) | Owner-approved generic half dye default; E1 Round 6 incomplete, archived | Rejected |

ADRs 0067-0078 exist only on the private R&D branch (`rd/webgpu-replacement`); the numbering gap here is intentional.

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
