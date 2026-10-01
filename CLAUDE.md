# svelte-fluid — Agent Instructions

Native WebGPU incompressible-fluid simulation for Svelte 5. MIT licensed and
derived from Pavel Dobryakov's WebGL-Fluid-Simulation, but the production runtime
is WGSL/WebGPU only.

## Commands

Use Bun, never npm, pnpm, or yarn.

```sh
bun install
bun run dev
bun run test
bun run test:browser
bun run check
bun run build
bun run prepack
```

Before completion run `bun run test && bun run check`. Run the hardware browser
suite for engine or rendering changes, and `bun run prepack` for public/package
changes.

Hardware tests must use ordinary WebGPU/WGSL validation, not
`--enable-unsafe-webgpu`. If bundled headless Chromium has no adapter, use a
hardware-capable installed browser via `VITEST_CHROME_PATH=/path/to/Chrome
bun run test:browser` (on this Mac, the executable is
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`). Missing GPU
support is an explicit environment failure, not a reason to silently skip or
enable experimental shader syntax.

## Task tracking

Use this repo's isolated Beads tracker for actionable tasks, ideas, and todos.
Read [dev-docs/task-tracking.md](dev-docs/task-tracking.md) before tracker writes.
Run `bd context --json` first: require this repo's `.beads`, embedded mode,
database `svelte_fluid`, and project ID `f2af7687-07d3-4e2b-8fc6-82fde87a0db8`.
Use `bd ready`, `bd create`, `bd update --claim`, and `bd close`; serialize writes.
Never use a global/shared tracker, external repo routing, federation, sync remotes,
or dependencies on other projects. Do not reinitialize or change global settings.
The old `.ralph/prd.json` is historical, not the current task source of truth.

If local `memory/` exists, start at [memory/README.md](memory/README.md) for the
dated session handoff. It is Git-ignored local context, not a second tracker;
verify current work against Beads. Do not stage or commit it.

## Architecture invariants

1. `src/lib/engine/` is framework agnostic and never imports Svelte.
2. `Fluid.svelte` owns DOM lifecycle, sizing, visibility, and accessible fallback;
   it never issues WebGPU commands directly.
3. `FluidEngine.ts` is the stable asynchronous controller. It queues startup
   inputs, reconstructs after device loss, and delegates simulation to
   `webgpu/NativeWebGpuFluidEngine.ts`.
4. One shared `GPUDevice`, shader-module cache, and pipeline cache serve all live
   canvases. Each instance owns only its fields, masks, uniforms, bind groups,
   input state, and frame subscription.
5. There is one production backend and one always-mask-capable WGSL graph. A 1×1
   all-fluid identity texture handles scenes without geometry. Do not add backend
   selectors or mask/no-mask pipeline permutations without measured evidence and
   an ADR.
6. Persistent resource changes build candidates off-side and preflight explicit
   memory limits. Synchronous failures retain the last working graph. Because the
   public update API is synchronous while WebGPU validation/OOM reporting is
   asynchronous, every resource transition must use per-instance GPU error scopes;
   a late driver rejection is terminal for that instance and must surface fallback
   UI instead of poisoning the shared device.
7. Public declarations must be GPU-type-neutral. `GPUDevice`, `GPUTexture`, and
   other `@webgpu/types` names may appear only below `engine/webgpu/`, never in a
   root-exported type signature.
8. The package has zero runtime dependencies. Svelte is a peer dependency.

## Important files

```text
src/lib/
├── Fluid.svelte                    DOM/lifecycle wrapper
├── FluidBackground.svelte          viewport wrapper + exclusion zones
├── FluidReveal.svelte              dye-driven reveal
├── FluidDistortion.svelte          image distortion
├── FluidStick.svelte               sticky-mask wrapper
├── FluidText.svelte                text-container wrapper
├── presets/                        opinionated public recipes
└── engine/
    ├── FluidEngine.ts              async public controller/recovery boundary
    ├── gpu-support.ts              GPU-neutral public availability/types
    ├── types.ts                    public configuration and handle types
    ├── frame-scheduler.ts           shared RAF scheduler
    ├── mask-rasterizer.ts           canonical packed mask construction
    ├── flow-policy.ts               flow semantics and palettes
    └── webgpu/
        ├── NativeWebGpuFluidEngine.ts  render/solver/resource orchestration
        ├── shaders.ts                  raw WGSL strings
        ├── device-pool.ts              shared device/module/pipeline ownership
        └── resources.ts                tracked texture/buffer helpers
```

## Coordinate and simulation contracts

- Public normalized coordinates are x left→right and y bottom→top.
- Prescribed grids are row-major, bottom row first. Reverse rows at the WebGPU
  upload boundary; do not leak WebGPU's top-left texture convention into the API.
- DOM pointer coordinates are converted once at the boundary.
- Simulation velocity is `rg16float`; dye/scalars are `rgba16float`; pressure,
  divergence, and curl are `r16float`.
- Geometry physics uses a simulation-resolution packed canonical mask. Visual/dye
  masking uses a separate coverage texture when higher fidelity is requested.
- A config value of `undefined` means “not supplied”; it must not overwrite a
  previously resolved hot value or reappear as a default after recovery.
- `pressureIterations: 0` disables projection. `pressure` controls warm-start
  retention in the first pressure iteration; do not conflate the two controls.

## Changes and tests

- Use tabs and single quotes. Import TypeScript modules with `.js` extensions.
- Keep public component props in `engine/types.ts`; do not create a second config
  vocabulary in the Svelte layer.
- Hot scalar changes should not allocate. Resolution/field-owner changes preserve
  state. Same-aspect CSS/DPR resize should reconfigure the swap chain without
  rebuilding unchanged fields.
- Consumer callbacks are untrusted: isolate exceptions so they cannot break GPU
  startup, recovery, or sibling instances.
- Pure policy/raster/resource ownership belongs in Node tests. Shader compilation,
  readback, device loss, visual envelopes, and lifecycle belong in the Playwright
  Chromium browser project.
- Engine architecture decisions require an ADR in `dev-docs/decisions/` and an
  entry in its README index. Historical WebGL ADRs remain historical; do not edit
  them to pretend they described WebGPU.

## Current R&D surfaces

- `/examples/webgpu/canary` — subjective production-engine canary
- `/examples/webgpu/features` — public-component feature coverage
- `/examples/webgpu/replacement` — migration decisions and measured evidence

Keep routes thin: they must exercise the production engine, not a route-local
solver or copied shader implementation.

Explicit private R&D exception: `/lab/liquids` and `/lab/interfaces` use isolated
models in `src/experiments/liquid`, under ADRs 0070–0077. They do not define or
export the production API. Preserve native semantics and fallback; describe
illustrative material models honestly rather than claiming calibrated physics.

Private R&D is native-pixel only: use fractional CSS dimensions × actual DPR,
including 3×, for presentation and visual source textures. No Economy mode or
silent DPI cap. Keep model density independent; reject unsupported native sizes
with visible fallback and account for extra render attachments during resize.

Private R&D is a physics-led creative visual/UI studio, not an image editor or
generic widget gallery. Admit a study for a distinctive visible material, optical,
transport or geometric behavior—not for implementing an ordinary workflow with
GPU decoration. No mask editors, before/after tools, annotated documents, reorder
pockets, relationship diagrams or allocation dashboards without a genuinely new
brief. Renderer diagnostics are evidence inside a study, not additional ideas.
Small illustrative models are valid; finished design-system integration and
calibrated physics are not prerequisites. Passing tests or closing Beads does not
establish creative merit. Preserve the user's positively reviewed material work;
retire rejected variants and their exclusive machinery instead of maintaining a
permanent showcase of failed ideas. See the
[studio-pruning record](dev-docs/plans/2026-09-13-studio-pruning.md).

Library promotion is a separate, stricter gate: demonstrate a useful design role
at its intended size with native semantics and a convincing simpler baseline.
See the [material-library proposal](dev-docs/plans/2026-09-14-material-design-library.md)
and accepted ADR 0078. `MaterialEnamel`, `MaterialFoil` and `MaterialImage` are the
first experimental exports. The initial all-three composition was rejected as
cheap; `/lab/interfaces/library` now uses only a borderless foil appearance
switch with still typography and photography. Do not reintroduce permanent
button chrome around the spring or stack effects merely to demonstrate exports.
Keyboard focus rings and the full native hit area remain required. Their shared
models live under `engine/webgpu/materials/`; old lab paths re-export them. Use
the shared device pool/frame scheduler, scoped candidate cleanup and native DPR.
Keep other proposed families out until independently adapted and reviewed.
A library-scope cut is not itself a completed lab-source deletion, and a proposed
treatment family is not an approved public API. Integration checks/runbook:
[`dev-docs/plans/2026-09-14-material-library-integration.md`](dev-docs/plans/2026-09-14-material-library-integration.md).
