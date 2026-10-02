# ADR-0091: Height-field surface: damped wave stencil, Fresnel and studio environment, area-ratio caustics

## Status

Accepted (2026-10-02)

## Context

The private liquid-surface prototype (`layer2-proto`, `src/lab-proto/surface/`)
showed that a thin, lit liquid skin can give small controls honest physical
feedback for 0.5–0.8 ms of GPU. Review of its frames found five weaknesses:

1. Grid banding: normals were central differences on a fixed 256-cell grid,
   bilinearly interpolated, so slopes kinked at every cell edge.
2. Soft blob highlights: the studio lights had Gaussian falloff, so crests
   lit up as smeared patches.
3. Flat plastic edges: the wall meniscus was an analytic rounded rect with a
   fixed exponential, drawn as a uniform strip.
4. Caustics added light everywhere, so on light themes they read as glow, not
   as refracted light.
5. Each surface owned its own WebGL context.

## Decision

`engine/surface/` is a sibling model engine (`SurfaceEngine`), not a
`FluidEngine` mode. It registers with the shared gl-host (ADR-0088) through
`acquireGlHost`/`releaseGlHost` only, subscribes to the shared frame scheduler
(ADR-0080) and owns only its height field (RGBA32F ping-pong: h, h₋, displayed
height), a coverage mask and its JFA SDF, and a dither texture.

- **Stencil.** `wave.ts` is the CPU reference, moved with its tests:
  `(1+γ)h' = 2h − (1−γ)h₋ + r²∇²h + ν∇²(h − h₋) − m²h`, Courant 0.6 under the
  limit `8r² + 16ν + m² ≤ 4`. Neumann walls by mirror ghost cells on the SDF.
  Impulses are displacements (both time levels move), so a press never
  becomes a velocity kick. Physics runs at fixed 60 Hz substeps.
- **Grid density** is per CSS px: 1 CSS px cells, up to 512 cells per side
  (coarser cells beyond). Resize resamples the old field bilinearly; it never
  resets.
- **Reconstruction.** The composite runs at display resolution and evaluates
  a cubic B-spline over 4×4 cells for h, ∇h and the Hessian. The B-spline is
  C² across cells, so slopes and caustics are smooth at any DPR. Measured on a
  wake at DPR 3: the 99th-percentile row-to-row second difference of the slope
  drops from 0.0026 (prototype bilinear normals) to 0.0009.
- **Meniscus** comes from the control's JFA SDF (ADR-0084), built through the
  host program factory: `rise · exp(−d/ℓ)` (0.6 px over ℓ = 1.6 px) with its
  analytic gradient and Hessian added to the field's, so the edge refracts,
  reflects and focuses like the rest of the liquid. The **contact line is
  pinned**: wave displacement is multiplied by `1 − exp(−(d/4 px)²)` (zero value
  and slope at the wall). Without it a crest reaching the wall added its slope
  to the steep meniscus, and the key light traced meniscus iso-slope contours,
  which run straight along the wall: a lit, clipped-looking tab.
- **Lens edge** uses `A·½(1 − tanh(d/(f/1.5)))`, which is C∞ and has the same
  peak slope as the smoothstep it replaced. A smoothstep's curvature jumps at
  both ends of its band, and the caustic term drew that jump as a dark seam
  where the moving lens met the track.
- **Optics.** Schlick Fresnel with F0 = 0.0204 (water). The reflected
  direction through the per-pixel normal samples a studio: a room gradient,
  a long key strip and two side strips. Each strip is crisp across (a 40%
  diffuser shoulder widened by `fwidth`, so a fast-changing slope gives a
  sub-pixel edge and a broad uniform slope shades instead of filling a
  cut-out) and feathered along its length (no cut ends). The key is brighter
  toward its top, like a real softbox. The floor bounce is a soft Gaussian
  band: hard-edged, it sat where the wall meniscus already points and lit
  wave crests at the rim as blocks. Refraction displaces the floor by
  `(1 − 1/n)·(D + h)·∇h`, capped at 1.5 CSS px. Beer–Lambert absorption toward
  a scatter colour tints deep liquid (the segmented lens).
- **Caustics** are the area ratio of the refracted grid, `1/|det(I + s·H)|`
  with `s = D·(1 − 1/n)`, capped at 6 and soft-kneed. The Node test checks it
  against a finite-difference Jacobian. H is the wave Hessian **smoothed by a
  Gaussian of σ = 2 cells** in its own pass at cell resolution (13×13 taps,
  RGBA16F, sampled bilinearly), plus the analytic meniscus Hessian. The
  caustic depth amplifies curvature ~9×, so the raw B-spline Hessian turned
  2–4-cell residue into a mottled dirt texture; band-limited, focusing
  follows wave crests. On light tones the term is clamped to ≤ 0 with gain
  0.3: caustics render as broad, darker shading, never added light. A readback
  test bounds fine texture (RMS of luminance minus its 7×7 mean) during a
  light-theme slosh at 0.7, above the worst pure-dither field (0.62) and below
  the rejected build (0.86 in the same slosh); the shipped build peaks at
  ≈0.44.
- **Output** is encoded with the shared exact sRGB transfer and dithered with
  ±1 LSB blue noise scaled by coverage (ADR-0081), premultiplied.
- **Lifecycle.** Zero frames when settled (energy below 0.03 CSS px, lens
  spring at rest) or offscreen. The frame that crosses the settle threshold
  writes the equilibrium alone, so the last presented frame is the clean still,
  not a residual ripple frozen until the next input. Impulse backlog capped at 16, 8 per step;
  non-finite presses dropped (ADR-0079). Press variation comes from a seeded
  mulberry32. Context loss stops frames and drops handles; restore rebuilds
  them. `setConfig` ignores `undefined`. Callbacks go through `notifyHost`.
  No browser API is touched at import (SSR-safe).

## Consequences

- GPU per instance (synced 1-px-readback batches, busy frame with an impulse
  every frame, Apple M1 Max, Chrome): 0.42–0.44 ms at DPR 2 and DPR 3 for a
  220×56, 360×56 and 480×64 control (the curvature pass added ≈0.04 ms). The time does not grow with canvas area,
  so the batch is submit-bound and these are upper bounds. Budget 2 ms.
- RGBA32F state needs `EXT_color_buffer_float`; the host already requires it.
- A loss of the shared context pauses every surface (shared fate, ADR-0088).
- Rejected: Gaussian ("soft") key and strip lights (the prototype's blob look);
  rectangle lights with hard ends (clipped tabs at the rim);
  bicubic Catmull-Rom (overshoots near the meniscus); deriving caustics by
  splatting a refracted mesh (the prototype's extra pass and target, and its
  triangle facets).
