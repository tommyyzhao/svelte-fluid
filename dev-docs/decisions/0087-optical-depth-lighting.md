# ADR-0087: Lighting from optical-depth dye geometry

## Status

Accepted (2026-10-02).

## Context

The 0.8.0 `shading` pass took central differences of `length(rgb)` and
lit them with `clamp(dot(n, z) + 0.7, 0.7, 1.0)`. Colour brightness stood in
for height, so a saturated red and a dim white of equal |rgb| had the same
relief and HDR dye drove the slope. There was no geometry to light, so
specular or refraction could not be built on it. The 1.0 goal asks for
lighting from real geometry, while every preset keeps its 0.8.0 look at
defaults.

## Decision

1. **Height is optical depth.** Dye is treated as a thin absorbing layer whose
   per-channel transmittance is `T_i = 1 / (1 + c_i)`. Thickness is
   proportional to optical depth, `h = k · mean_i(−ln T_i) = k · mean_i ln(1 + c_i)`,
   with `k = 0.06` canvas heights per unit optical depth. This is zero with no
   dye, monotone, finite for any HDR value, hue-symmetric and saturating, so
   HDR splats (LavaLamp's 1.8 wax, `fire` at 1.5) no longer make cliffs. Beer–
   Lambert with a literal `exp(−c)` was rejected: dye is unbounded HDR
   concentration with no calibrated absorption coefficients, and its
   linear-in-c depth reproduced the old HDR spikes.
2. **Normals in physical units.** `DYE_GEOMETRY_GLSL` samples the dye texture
   at ±one dye texel and divides by the texel span in canvas-height units
   (x scaled by the aspect). The normal depends on the dye field, not on the
   output target, so it is the same at every DPR and canvas resolution
   (`lighting.test.ts`).
3. **Diffuse keeps the 0.8.0 envelope.** `diffuse = clamp(0.7 + n_z', 0.7, 1)`
   with an artistic slope gain of 100 on `∇h` (6 on the optical-depth
   gradient), fitted offline against 8cdf74f dye dumps of every shaded preset
   (gain sweep 0.5–12; 6 had the lowest worst-case error, 0.63/255, and 5
   the lowest mean, 0.32/255). The gain is a lighting
   exaggeration, not a change to the geometry used by the optics.
4. **Opt-in optics.** `specular` (0–1, default 0): normalized Blinn-Phong
   (n = 128) with Schlick Fresnel (dielectric F0 = 0.02), studio key light from
   the upper left, weighted by layer coverage `1 − e^{−h/k}`, added in linear
   light and re-encoded. `refraction` (0–1, default 0): a vertical view ray
   refracted by water (η = 1/1.33) through the layer; the displacement is
   `h · tanθ_t` in canvas units. It applies where the engine already owns an
   image under the dye: the distortion image (display pass) and the glass
   scene texture (glass pass, before the glass optics). Plain fluid and reveal
   have nothing under the dye in the engine, and DOM content behind a
   transparent canvas is unreachable, so `refraction` does nothing there.
5. **Buckets.** `specular > 0` / `refraction > 0` are Bucket B keywords
   (`SPECULAR`, `REFRACTION`) gated on crossing zero; positive values are
   Bucket A uniforms. No new framebuffer is allocated in any mode
   (`lighting.browser.test.ts`). `refraction` under glass is a uniform in the
   always-compiled glass program (0 skips the extra taps).
6. **WebGL1.** All code is GLSL ES 1.00 (`log`, `refract`, `inversesqrt`),
   compiled by the browser suite on a WebGL1 context.

## Measurements

Same-seed captures, 800×500 CSS, 150 frames, before = 8cdf74f, at
`/tmp/lane-lighting/compare/`. MAE in /255 over RGB, Δmean/Δstd of luminance:

| Scene | MAE DPR 1 | MAE DPR 2 | Δmean DPR 1 | Δmean DPR 2 | Δstd DPR 1 |
|---|---|---|---|---|---|
| default | 0.20 | 0.17 | −0.21 | −0.17 | −0.49 |
| LavaLamp | 0.26 | 0.25 | −0.10 | −0.10 | +0.26 |
| Plasma | 0.35 | 0.23 | −0.24 | −0.18 | −0.00 |
| InkInWater | 0.01 | 0.01 | −0.00 | −0.00 | +0.00 |
| FrozenSwirl | 0.13 | 0.09 | −0.10 | −0.08 | −0.16 |
| Aurora | 0.38 | 0.27 | −0.32 | −0.23 | +0.02 |
| CircularFluid | 0.24 | 0.19 | −0.14 | −0.11 | −0.17 |
| FrameFluid | 0.35 | 0.26 | −0.25 | −0.20 | −0.09 |
| AnnularFluid | 0.32 | 0.27 | −0.18 | −0.15 | −0.19 |
| SvgPathFluid | 0.11 | 0.09 | −0.09 | −0.07 | −0.16 |
| Toroidal | 0.34 | 0.26 | −0.19 | −0.15 | −0.33 |
| GasFlare, Venturi, Karman, TeslaValve, distortion | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

Every shaded preset is within 0.4/255 MAE and 0.4/255 mean luminance; the
unshaded ones are bit-identical. Side-by-sides were reviewed by eye at both
DPRs: no visible change.

GPU, synced-batch method (ADR-0089), 800×500, Apple M1 Max: defaults
unchanged within noise (worst median 1.62 ms, Karman; display pass
0.05/0.08/0.18 ms at DPR 1/2/3). With `specular: 1, refraction: 1`: display
+0.04–0.06 ms at DPR 2, LavaLamp glass 0.14 ms at DPR 2; worst median 1.48 ms.

## Consequences

- The shading gradient is now a function of concentration, not colour
  brightness; the old normal is gone from the source.
- Highlights and refraction share one geometry, so they track each other and
  are DPR-independent.
- Refraction of arbitrary page content would need a captured background
  texture (a new resource and API); out of scope.
