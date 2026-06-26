# ADR 0045: Confinement boundary attenuation via solid-neighbor texture (Phase 5)

## Status

Accepted (2026-06-25)

## Context

Confinement force currently ignores pre-baked boundary-solid neighbor data in the
vorticity pass and can inject momentum into cells adjacent to solids. That momentum
opposes the projection result near boundary staircasing and produces visible
disagreement on obstruction-heavy presets.

Epic 0001 already introduced a binary per-face neighbor texture (`uSolidNeighbors`)
for projection and viscosity path reuse; the vorticity path must consume this same
binary source so boundary-adjacent cells are explicitly damped.

## Decision

In the vorticity shader, sample `uSolidNeighbors` at `vUv` and attenuate confinement by:

- `attenuation = clamp(1.0 - max(L, R, T, B), 0.0, 1.0)`

with `L/R/T/B` from `rgba` of `uSolidNeighbors`.

Bind the pass samplers through the existing `bindSolidMaskUniforms` helper in
`FluidEngine.ts` so all owned sampler units are always bound to either the real
binary texture or a 1×1 fallback, never leaving stale bindings.

Factor the attenuation math into a pure helper:

- `solidNeighborConfinementAttenuation(left, right, top, bottom)`

and cover it with a node test that validates:

- no-neighbor case returns `1`
- any-neighbor case returns `0`

This is an intentional behavioral change (bugfix), not a byte-identity change.

## Engine effects

- `src/lib/engine/shaders.ts`
	- Add `uHasSolidMask`, `uSolidNeighbors` and attenuation multiply in
	  `vorticityShader`.
- `src/lib/engine/FluidEngine.ts`
	- Bind solid-mask uniforms for `vorticityProgram` in the vorticity pass.
	- Add pure helper `solidNeighborConfinementAttenuation`.
- `src/lib/engine/__tests__/vorticity-boundary.test.ts`
	- Node coverage for the helper math.
