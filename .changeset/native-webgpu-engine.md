---
"svelte-fluid": major
---

Replace the WebGL 1/2 runtime and fallback backend with one native WebGPU
solver/rendering engine. Multiple fluid instances share an adapter, device,
pipeline cache, and frame scheduler while retaining isolated field resources.

The new engine adds guarded configuration and resize updates, per-instance GPU
error scopes, typed startup/runtime failure reasons, device-loss reconstruction,
demanding-flow features, memory preflight limits, and production-native
diagnostic routes.
Browsers without a usable WebGPU adapter now receive the component fallback or
poster instead of a WebGL simulation.

Imperative splats and flow descriptors are bounded, config descriptors are
engine-owned, and scalar flow fields are limited to the three channels the
native solver actually stores. Distortion asset failures now surface through
fallback UI and recover when a later image upload succeeds.

Migration notes:

| Before | Now |
| --- | --- |
| `isWebGLAvailable()` | `await isFluidGpuAvailable()` |
| `WebGLUnavailableError` / `WebGLUnavailableReason` | `FluidUnavailableError` / `FluidUnavailableReason` |
| `GetContextOptions` | `FluidEngineOptions` and `requireHardwareAcceleration` |
| Public `ResolvedConfig`, `FBO`, `DoubleFBO`, and `ExtInfo` | Removed; backend internals are no longer public |
| Synchronous usable engine after construction | Await `engine.ready` or use `await FluidEngine.create(...)` |
| WebGL fallback runtime | Accessible poster/snippet fallback when no suitable WebGPU adapter exists |

WebGPU adapter acquisition is the new browser support floor. There is no slower
WebGL simulation fallback, and device loss reconstructs the native engine from
its owned configuration snapshot.
