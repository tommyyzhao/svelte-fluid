# Architecture

## Runtime shape

`svelte-fluid` has one production renderer: a native WebGPU engine. The Svelte
components are lifecycle adapters around a framework-agnostic controller; the
controller owns asynchronous startup and recovery; the native engine owns the
solver and per-instance GPU resources.

```text
Svelte component
  canvas, observers, fallback, public handle
          │
          ▼
FluidEngine
  startup queue, desired config/size, device-loss reconstruction
          │
          ▼
NativeWebGpuFluidEngine ───── shared WebGpuDevicePool
  fields, masks, uniforms      one device + WGSL modules/pipelines
  bind groups, input, passes   shared by every live canvas
```

The engine layer never imports Svelte. WebGPU globals are touched only during
browser-side construction, so importing the package during SSR is safe.

## Ownership

### Experimental material integration (ADR 0078)

`MaterialEnamel`, `MaterialFoil` and `MaterialImage` use small cleanroom laws, not
the fluid solver. Their Svelte shells retain native text/image content; an enclosing
native control owns activation. `engine/webgpu/materials/runtime.ts` observes
geometry/input/preferences and owns a shared-pool lease, candidate generation,
explicit native-memory reservation and frame subscription. It never captures input.
`controllers.ts` adapts the three models; `cache.ts` coalesces immutable shader,
compute and render pipelines per device, independently of the fluid-specific cache.

Mutable resource allocation and canvas configuration use synchronous push/pop
error scopes before awaiting validation. Failed candidates clean up locally;
late/cancelled work cannot mutate a retry's reservation. At most two frames per
instance may await completion. Rest, hidden and offscreen hosts unsubscribe.
Plain/forced-color modes release the lease; reduced motion presents still material.

Native CSS×DPR output/relief is separate from model density. The 256 MiB aggregate
material reservation counts logical source/mip/model/profile/candidate and one
resolved output per instance, not browser compositor buffers, decoded CPU images,
JavaScript allocations or the fluid solver's separate budget. It is a resource
guard, not a measured process-memory ceiling. Original images retain full sources.

Lab `film`, `enamel-profile`, `image-wake`, `snap-foil`, `living-cover`,
`presentation-size` and `types` paths re-export the shared implementations rather
than maintaining copied equations. Other lab models remain private experiments.
See [integration evidence](plans/2026-09-14-material-library-integration.md).

### Fluid engine

The shared pool owns adapter/device acquisition, exact-source shader-module
caching, render-pipeline caching, error fan-out, generation tracking, and device
loss. A rejected module or pipeline promise evicts itself so a transient failure
cannot poison the cache.

Each native instance owns:

- one canvas context and frame-scheduler subscription;
- velocity, dye, pressure, divergence, curl, and optional scalar fields;
- physics and visual/sticky masks;
- optional bloom, sunrays, prescribed-grid, and distortion textures;
- uniforms, bind-group memoization, pointer state, queued splats, and performance
  governor state.

There is no per-canvas `GPUDevice`, no WebGL context, and no runtime dependency.
The 1×1 identity mask lets the same WGSL graph run both shaped and unshaped scenes.

## Frame graph

A live solver frame applies the configured subset of:

1. prescribed fields, persistent sources, outlets, and external forces;
2. velocity advection (semi-Lagrangian or guarded MacCormack);
3. implicit viscosity and wall friction;
4. curl/vorticity confinement;
5. divergence, pressure solve, and pressure-gradient subtraction;
6. queued velocity/dye splats;
7. dye and scalar advection;
8. bloom/sunrays and a single presentation pass.

The empty-scene activity bit skips the solver and presentation until content or a
dirty visual state exists. The shared scheduler owns one RAF for all running
instances rather than one RAF callback per component.

## Fields and masks

Simulation targets use half-float formats: velocity `rg16float`, dye/scalars
`rgba16float`, and scalar solver auxiliaries `r16float`. Double targets swap read
and write textures after each producing pass.

The physics mask is packed RGBA8 at simulation resolution. Red contains the
center/cardinal solid stencil plus conservative 0–7-cell clearance for guarded
MacCormack; green is allowed coverage; blue identifies obstructions; alpha is
sticky strength. Visual masks omit solver-distance baking and may use a distinct
higher-resolution texture. Analytical geometry follows dye resolution; SVG/text
masks respect their explicit `maskResolution`.

Public coordinates are y-up. WebGPU textures and fullscreen UVs are top-row-first,
so DOM coordinates, vectors, and prescribed-grid rows are converted once at their
input boundary.

## Configuration and resize

`FluidEngine` removes `undefined` values and retains the desired config and canvas
size across asynchronous startup/recovery. Construct-only values (`seed` and
opening splats) are not hot-applied.

The native engine classifies changes by resource owner. Scalar coefficients do no
allocation. A packed scalar channel-layout change clears scalar state rather than
reinterpreting it. Every named prescribed scalar grid is uploaded to its declared
channel. Isolated sticky/visual masks, prescribed grids, or presentation changes
replace only that owner; solid-topology changes reset the simulation so walls
cannot reveal hidden fluid. Resolution or combined structural changes build a
complete candidate field graph off-side. Failed preparation leaves the current
graph alive.

Only one structural GPU transition runs at a time. Later config and resize input
coalesces to the newest desired state, which bounds submitted-but-not-yet-retired
graphs. Persistent textures share one aggregate budget; replacement peaks have a
separate ceiling that counts both old and candidate owners.

Canvas resize reconfigures the swap chain. Field targets are rebuilt only when
their computed extents change; same-aspect CSS/DPR growth does not duplicate the
simulation graph.

## Startup, loss, and fallback

`new FluidEngine()` returns a stable queueing controller immediately and exposes a
`ready` promise. `FluidEngine.create()` is the awaitable convenience. Input,
config, size, and pause state arriving during acquisition are reconciled before
publication.

When the shared device is lost, every affected controller discards its native
instance, invokes `onRecovering`, acquires the next shared generation, reconstructs
from desired state, and invokes `onRecovered`. Host callback exceptions are
isolated from engine correctness. Simulation fields are intentionally reset after
device loss because their texture contents no longer exist.

If acquisition cannot produce acceptable WebGPU, `<Fluid>` preserves layout and
renders, in order, a custom fallback, poster, or background-color fill with an
accessible message. There is no hidden WebGL fallback.

## Verification

Node tests cover pure configuration, masks, resource rollback, schedulers, and
policy math. Browser tests compile the real WGSL graph in Chromium, advance and
read half-float fields, exercise resize/config churn, and force shared-device loss.
The routes under `/examples/webgpu` are subjective and performance R&D surfaces;
they must use the same production engine as `<Fluid>`.

See [ADR 0068](./decisions/0068-replace-webgl-with-one-native-webgpu-engine.md)
for the replacement decision and its accepted tradeoffs.
