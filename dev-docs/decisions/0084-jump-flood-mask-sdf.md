# ADR-0084: GPU jump-flood signed distance field for mask edges

## Status

Accepted (2026-10-02). Supersedes the "GPU SDF via Jump Flood" rejected
alternative in [ADR-0024](./0024-svg-path-container-shapes.md) for display edges.

## Context

Analytic container shapes faded their edge with `smoothstep(±0.005)` in UV
space: about 1% of the canvas, so 5 device px on a 512 px canvas at DPR 1 and
15 px at DPR 3. Raster masks (svgPath, text, obstructions) used bilinear
coverage of a 512² texture, so their ramp was one mask texel stretched to
the canvas, 3.6–18 device px in our measurements. Neither width followed
device pixels, so edges were soft at high DPR. The 1.0 goal also needs one
distance primitive for outlines, wetting/meniscus bands and focus rings that
follow any mask shape.

## Decision

1. **`engine/jump-flood.ts` + three GLSL passes in `shaders.ts`.** The input is
   a 0–1 coverage texture. The output is an R16F, `LINEAR` texture holding signed
   distance in texels of that texture, negative inside.
   - **Seed:** texels whose 4-neighbourhood straddles 0.5 store the offset to
     the 0.5 crossing, `-(c − 0.5)·g/|g|²`, clamped to one texel. `g` takes the
     steeper one-sided difference per axis, so a hard 0/1 step lands exactly
     on the half-texel edge. Other texels store a 1e4 sentinel.
   - **Flood:** ⌈log2 max(w, h)⌉ ping-pong passes in RG16F with steps N/2 … 1,
     plus one extra step-1 pass (JFA+1). Each pass keeps the nearest of 9
     candidates.
   - **Distance:** `±length(offset)`, with the sign from coverage.
   - Seeds store a **relative offset**, not an absolute position. Half floats
     then keep ~1e-3 texel precision near the edge, where it matters, instead of
     ~0.25 texel at coordinate 512.
2. **Shipped uses.** The display shader gains a `MASK_SDF` keyword for svgPath
   containers and obstructions:
   `coverage = clamp(0.5 − d·devicePxPerTexel, 0, 1)`, which is one device px
   of anti-aliasing at any DPR. Analytic shapes keep their analytic SDF but use
   the same formula (`d / texelSize`), and the frame/rounded-rect SDFs gain
   their exact interior term. The flow-visualization seam guards read the same
   SDF, with a band equal to the old one-texel coverage ramp dilated by one
   pixel, so overlays do not move.
3. **Lifecycle.** The SDF rebuilds only where the coverage mask is rebuilt:
   construction, shape/obstruction change, aspect change and context restore.
   One `JumpFlood` per engine owns the three programs and the seed ping-pong
   pair. Same-size rebuilds reuse both the seed pair and the output FBO.
   `dispose()` deletes them. Context restore drops the stale handles and the
   normal init path recreates them.
4. **Texture units.** `MASK_SDF` variants sample the SDF instead of the
   coverage mask on the same units (4 container, 6 obstruction), which keeps
   the WebGL1 0–7 unit budget.
5. **Internal sampler.** `FluidEngine#getMaskSdf('container' | 'obstruction')`
   (`@internal`, stripped from declarations) returns `{ texture, width, height }`
   for later edge features.

### WebGL1

JFA needs renderable RG16F seeds and a filterable R16F result. WebGL1 has
neither without `EXT_color_buffer_half_float` plus half-float linear, and the
seeds would have to be packed into RGBA. WebGL1 therefore keeps the coverage
path: svgPath/obstruction edges stay bilinear coverage, `getMaskSdf()` returns
null, and no JFA program is compiled. Analytic shapes switch to pixel-width AA
on both APIs.

### Unchanged

Physics is untouched: `applyMask`, the solid mask, the neighbour and clearance
textures and the glass rim model still read coverage. The CPU-side mask data and
spawn sampling are unchanged. There is no public API or prop change.

## Measurements (Apple M1 Max, Chrome 154, ANGLE Metal)

- JFA alone at 1024²: 11 passes, ~3.7 ms median (3.4 ms without +1). A full
  1024² rebuild including Canvas2D raster and upload takes ~11.7 ms. The default
  512² mask costs less than 1 ms of JFA.
- Accuracy: on a 512² circle mask vs the analytic distance, RMS error is
  0.26 texel over the whole field and the worst error within 4 texels of the
  edge is 0.50 texel. The CPU reference JFA stays within 1 texel of brute force.
- Edge width: the partial-coverage band is ~1 device px at DPR 1 and 3 for
  svgPath, circle and obstruction masks (browser test). In preset captures the
  band shrank from 3.6–18 px to 1.1–3.9 px. Coverage area changed by ≤0.2% and
  there were no leaks.

## Consequences

- Raster mask edges are as sharp as the mask resolution allows. A 512² mask on
  a 1440 px canvas still shows its texel staircase on shallow diagonals;
  `maskResolution` remains the lever for that.
- There is one more 2-byte/texel texture per mask plus a transient
  4-byte/texel seed pair, counted in the profiler's memory estimate.
- Analytic shapes no longer have a fixed-UV soft edge. Glass and `applyMask`
  keep theirs because they are physics/refraction, not display AA.

## Allowed non-JFA edges

"One primitive" means every mask-derived edge uses the JFA SDF. Mask-derived
shapes (SVG paths, text, element masks, resist regions) must use it. These
edges are exempt because the JFA is the wrong tool or adds nothing:

- **Analytic container shapes** (circle, rect, frame, annulus and the like):
  already exact SDFs; they only gain pixel-width AA (see Decision).
- **LiquidDropZone four-wall climb** ([ADR 0094](./0094-liquid-drop-zone-and-caustics.md)):
  the JFA's SDF has a crease on each corner's medial axis, which pinches the
  highlight; the C-infinity four-wall sum is smooth there.
- **FoilSwitch arch** ([ADR 0096](./0096-foil-switch.md)): an analytic
  parabolic beam, not a mask; nothing to rasterise or flood.
- **CSS focus outlines** on a rectangle or pill the browser already outlines:
  the native outline is the accessible, forced-colors-aware choice.

## Rejected alternatives

- **CPU EDT (Felzenszwalb) at upload:** costs about 20–40 ms of main-thread
  time at 1024², and the SDF would need re-uploading on every aspect change.
- **Absolute seed coordinates:** half-float quantisation reaches 0.25 texel at
  512, visible as edge wobble.
- **Central-difference seed gradient:** it misplaces the crossing of a binary
  step by half a texel, which shows up as a one-texel bias in the distance.
