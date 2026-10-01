# Contributing to svelte-fluid

Thanks for contributing. Open an issue before a broad API or rendering redesign so
the behavior and measurement plan can be agreed before implementation.

## Prerequisites

- Bun 1.3 or newer
- A browser/adapter with WebGPU for the hardware suite

Use Bun only: no npm, pnpm, yarn, Node CLI, Python, or pip in project workflows.

## Hard rules

1. Use Svelte 5 runes (`$props`, `$state`, `$derived`, `$effect`, `$bindable`,
   `untrack`), never legacy reactive syntax.
2. Relative TypeScript imports use `.js` extensions under NodeNext resolution.
3. Engine changes require an ADR in [`dev-docs/decisions`](dev-docs/decisions).
4. Do not add runtime dependencies. Svelte is the only peer dependency.
5. The framework-agnostic engine never imports Svelte; components never issue
   WebGPU commands.
6. Native WebGPU types stay below `src/lib/engine/webgpu/` and out of root-exported
   declarations.
7. Preserve transactional ownership at the JavaScript boundary: prepare resource
   replacements off-side, publish only after synchronous success, then destroy the
   previous owner. Scope asynchronous WebGPU validation/OOM errors and fail only the
   affected instance closed if a late error arrives.

See [`CLAUDE.md`](CLAUDE.md) for the detailed invariants and
[`dev-docs/architecture.md`](dev-docs/architecture.md) for the current runtime.

## Local development

```sh
git clone <repo>
cd svelte-fluid
bun install
bun run dev
```

The main demo is at `http://localhost:5173`; focused native-engine R&D is under
`/examples/webgpu`.

## Repository layout

```text
src/lib/
├── Fluid.svelte                 lifecycle/sizing/fallback wrapper
├── FluidBackground.svelte      viewport and DOM exclusions
├── FluidReveal.svelte          reveal wrapper
├── FluidDistortion.svelte      image-distortion wrapper
├── FluidStick.svelte           sticky-mask wrapper
├── FluidText.svelte            text-container wrapper
├── presets/                    public recipes
└── engine/
    ├── FluidEngine.ts          async controller and loss recovery
    ├── gpu-support.ts          GPU-neutral availability/errors
    ├── types.ts                public config and handles
    ├── frame-scheduler.ts      shared RAF scheduler
    ├── mask-rasterizer.ts      packed physics/visual masks
    └── webgpu/
        ├── NativeWebGpuFluidEngine.ts
        ├── shaders.ts          WGSL source strings
        ├── device-pool.ts      shared device/module/pipeline cache
        └── resources.ts        tracked allocation helpers
```

## Common workflows

### Add a config field

1. Add the camelCase field and documentation to `engine/types.ts`.
2. Resolve a finite/defaulted internal value in `NativeWebGpuFluidEngine.ts`.
3. Decide its owner: hot scalar, isolated resource owner, combined field graph, or
   construct-only input.
4. Forward it through `Fluid.svelte`'s destructure and `buildConfig()`. The
   forwarding guard test catches omissions.
5. Add Node policy tests and/or real-WebGPU browser coverage.
6. Update README, site docs, and generated agent docs.

### Modify WGSL or passes

1. Edit `engine/webgpu/shaders.ts` and the native orchestration together.
2. Keep public coordinates y-up and prescribed grids bottom-row-first.
3. Run the Chromium browser suite; Node tests cannot compile WGSL.
4. Inspect the canary/features routes for presentation changes and record any
   intentional visual difference in the ADR.

### Modify resource ownership

Test successful churn, rollback after allocation/upload failure, disposal back to
the baseline live-resource count, same-extent resize, and shared-device loss across
multiple live controllers. A callback exception must never break sibling instances
or GPU lifecycle state.

### Changesets

Run `bun run changeset` for user-visible changes. Choose patch for fixes, minor for
additive public behavior, and major for removed API/support or changed defaults.
Never publish manually; the release workflow publishes version PRs with provenance.

## Verification checklist

```sh
bun run test
bun run check
bun run test:browser
bun run prepack
bun run build
```

Then verify in a real browser:

- all core components and representative presets render;
- pointer input remains isolated across canvases;
- same-aspect and aspect-changing resize preserve live content;
- hot config does not allocate unless its resource owner changes;
- device loss shows recovering UI and returns on a new shared generation;
- console has no WebGPU validation/runtime errors;
- repeated mount/resize/dispose returns tracked resources to baseline.

## Code style and issue reports

Use strict TypeScript, tabs, and single quotes. Comments should explain invariants
and tradeoffs. Useful GPU bug reports include browser/version, OS, adapter name,
whether `navigator.gpu.requestAdapter()` succeeds, scene/config, number of live
instances, and a reproduction route.
