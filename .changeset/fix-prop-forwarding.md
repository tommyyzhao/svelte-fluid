---
"svelte-fluid": patch
---

Fix several `FluidConfig` props that were never forwarded from the `Fluid`
component to the engine: `revealAccentColor` and `revealFringeColor` (reveal
fringe colors) had no effect when set, and the new `obstructions` prop was
inert. All are now wired through `buildConfig()`. Added a source-level guard
test asserting every `FluidConfig` field reaches the engine.
