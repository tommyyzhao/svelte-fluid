# ADR 0044: Adaptive vorticity confinement via `vorticityAdaptive`/`uAdaptiveMix` (Phase 5)

## Status

In-task

## Context

Phase 5 introduced in-place resolution normalization for `viscosity` and `curl`.
The next incremental containment for confinement quality is to make confinement
strength location-aware without breaking the default behavior or adding public
configuration debt.

`uCurl` already stores `0.5 * vorticity` in the red channel, and the legacy
confiment path multiplies that sample by `curl` before applying the force.
Any adaptive extension must preserve that path exactly when disabled.

## Decision

Add a new `FluidConfig` hot-scalar field:

- `vorticityAdaptive?: number` (default `0`)

It is resolved into internal config as:

- `VORTICITY_ADAPTIVE: number` (clamped to `0..1`)

At bind time for the vorticity shader, send:

- `uAdaptiveMix = this.config.VORTICITY_ADAPTIVE`

Introduce one pure helper mirror in `src/lib/engine/FluidEngine.ts`:

- `adaptiveConfinementMagnitude(curl, curlSample, adaptiveMix, lo?, hi?)`

where `curlSample` is the stored `uCurl` value and `omega = abs(2 * curlSample)`.
The helper returns:

- `legacy = curl * curlSample`
- `adaptive = legacy * smoothstep(lo, hi, omega)`
- `mix(legacy, adaptive, adaptiveMix)`

Defaults are:

- `lo = 0.02`
- `hi = 0.08`

These constants are pinned as `VORTICITY_ADAPTIVE_LO/HI` and used in the shader as
hard-coded normalized thresholds to avoid additional uniform branches.

`uAdaptiveMix = 0` is byte-identical with legacy behavior by construction:

- `mix(legacy, adaptive, 0) = legacy`

## Engine effects

- `src/lib/engine/types.ts`
	- Add `vorticityAdaptive` to `FluidConfig`
	- Add `VORTICITY_ADAPTIVE` to `ResolvedConfig`
- `src/lib/engine/FluidEngine.ts`
	- Add `VORTICITY_ADAPTIVE` default
	- Resolve and clamp `vorticityAdaptive`
	- Bind `uAdaptiveMix` in vorticity pass
	- Add pure helper and constants for node coverage
- `src/lib/engine/shaders.ts`
	- Add `uAdaptiveMix`
	- Apply `force *= mix(curl*C, curl*C*adaptiveWeight, clamp(uAdaptiveMix, 0.0, 1.0));`

## Tests and documentation

- Node tests cover: byte-identical fallback at mix `0`, and pure-helper lerp/scale.
- Bucket-A behavior is covered by configuration classification tests.
- Public docs updated in `src/routes/docs/configuration/+page.svelte` to list
  `vorticityAdaptive` and classify it as Bucket A.
