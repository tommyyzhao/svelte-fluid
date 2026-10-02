# ADR-0081: Display pipeline with opt-in tone mapping, exact backColor and dithering

## Status

Accepted (2026-10-02). Revised 2026-10-02: default `toneMapping` is `'none'`
and the 0.8.0 box-chain bloom is restored (see "Revision").

## Context

The 0.8.0 display pass (inherited from upstream) added gamma-encoded bloom to
gamma-encoded dye and wrote the sum straight to the 8-bit canvas. HDR dye
(splat colours above 1, bloom energy, flow transfer `fire` peaking at 1.5) was
clipped per channel to white. Dithering only ran when bloom was on, and its
noise was added before the gamma encode, so it lifted every black background
by about 11/255 and still left bloom-off presets banding. Reveal and
distortion wrote straight (non-premultiplied) colour into a premultiplied
canvas, so semi-transparent pixels brightened the page (a light fringe).

The renderer had no notion of which space authored colours were in, so any
correction risked changing every preset's look.

## Decision

**Authored colours are display-referred sRGB.** Dye, preset splat colours,
`backColor` and `obstructionColor` mean what they meant in 0.8.0. 0.8.0 is
the visual reference for every preset, and the default config must
reproduce it.

Display pass:

1. Sunrays multiply dye and bloom, then bloom is encoded (exact IEC 61966-2-1
   `linearToSrgb`) and added to the display-referred dye, as in 0.8.0. This
   happens before container/obstruction coverage, as in 0.8.0.
2. Tone map (`toneMapping`, Bucket B keyword):
   - `'none'` (default): no transfer round trip. The dye + glow sum is
     composited over `backColor` unclamped, exactly as 0.8.0 did (HDR
     coverage above 1 darkens the back term, which keeps LavaLamp's wax
     saturated over its light back), and the 8-bit write clips.
   - `'neutral'` (opt-in): decode with `dyeToLinear` (HDR dye keeps the hue
     0.8.0 displayed and its peak scales linear energy), apply the Khronos
     PBR Neutral shoulder with its exact constants (`startCompression 0.76`,
     `desaturation 0.15`), encode once. Its toe offset (up to −0.04 linear,
     a PBR Fresnel-F0 compensation) is omitted: with display-referred input
     it crushed every dark background and dim dye. Without it, colours below
     the shoulder (≈0.89 sRGB) round-trip unchanged; only highlights roll off.
   - `'agx'` (opt-in): AgX default look (bwrensch polynomial), with a 2.2 EOTF
     back to linear so there is still exactly one encode.
3. Composite over `backColor` and paint the obstruction fill in display
   space. This is the operation the browser performs for a transparent
   canvas over a page of the same colour, so opaque and transparent modes
   agree. A linear-light composite was tried and rejected: it washed
   LightBackground dye to grey.
4. Dither every output mode (display, reveal, distortion) after the encode
   with ±1 LSB blue noise scaled by alpha, so transparent pixels stay exactly
   zero, `backColor` is exact, and every output stays premultiplied (no
   fringe).

**Bloom** is 0.8.0's 4-tap box pyramid (`bloomBlurShader`/`bloomFinalShader`,
same framebuffers, same prefilter) with one addition: the first downsample
uses a Karis (luminance-weighted) average to suppress single-texel fireflies.
The prefilter keeps 0.8.0's max-channel brightness key; a luminance key was
tried and rejected because it starved saturated blue, red and purple dye of
bloom. Cost: 0.546 ms per pass vs 0.538 ms for 0.8.0 (410×256, 7 levels,
Plasma at DPR 2, Apple-silicon Chrome; within run-to-run noise).

**Presets** use the defaults. No preset sets `toneMapping`; GasFlare keeps its
0.8.0 `bloomThreshold: 0.48` / `bloomIntensity: 1.0`.

## Revision (why `'none'` and the box chain)

The first version defaulted to `'neutral'`, added bloom in linear light and
replaced the bloom with a dual-Kawase pyramid. Side-by-side renders against
0.8.0 showed every bloom preset hazier and duller (Plasma lost punch,
FrozenSwirl's crisp wisps went soft) and needed per-preset `'none'`
overrides plus a GasFlare retune. Isolation renders (bloom and sunrays off)
matched 0.8.0, so the haze came from the bloom path. Restoring the box chain
alone did not fix it; the cause was adding bloom in linear light, which
lifts the dark gaps between wisps far more than an encoded add does.
Restoring 0.8.0's encoded add, with the box chain and `'none'` as the
default, reproduces 0.8.0 within 1–2/255 mean on every preset scene. Neutral
and AgX remain available for users who want highlight roll-off.

## Consequences

- Default output matches 0.8.0 except for the correctness fixes: exact
  `backColor` (dark backgrounds no longer lifted by about 11/255 by encoded
  dither noise; most visible on InkInWater and DefaultRandom), dithering in
  every mode, and premultiplied reveal/distortion/transparent output.
- Opt-in Neutral keeps the 0.8.0 bloom spread and crispness and recovers some
  structure in clipped highlights (Aurora, Plasma whites). AgX is softer.
- `toneMapping` is a hot keyword. Toggling it recompiles only the display
  program and allocates or deletes no framebuffers (covered by
  `display-pipeline.browser.test.ts`).
- `display-pipeline.test.ts` pins that no preset sets `toneMapping`; any
  preset opt-in needs an entry here.

## Known issue

GasFlare's jet core shows aliasing from the pre-existing scalar-transfer
mapping (temperature to `fire` colour on a 160² simulation grid sampled at
dye resolution). It is hidden by clipping under the default and visible as
fine stair-stepping under opt-in Neutral/AgX. This is a simulation or
visualization issue, left for a separate change.
