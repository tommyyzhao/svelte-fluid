# ADR-0081: Linear display pipeline with tone mapping, dual-Kawase bloom and dithering

## Status

Accepted (2026-10-02)

## Context

The 0.8.0 display pass (inherited from upstream) added gamma-encoded bloom to
gamma-encoded dye and wrote the sum straight to the 8-bit canvas. HDR dye
(splat colours above 1, bloom energy, flow transfer `fire` peaking at 1.5) was
clipped per channel to white, so bright regions became flat white blobs with
hue shifts at the clip boundary. Dithering only ran when bloom was on, so
dark gradients banded. The 4-tap box bloom pyramid shimmered on single bright
texels.

The renderer had no notion of which space authored colours were in, so any
correction risked changing every preset's look.

## Decision

**Authored colours are display-referred sRGB.** Dye, preset splat colours,
`backColor` and `obstructionColor` mean what they meant in 0.8.0: the value a
viewer sees for in-range colours. 0.8.0 is the visual reference for every
preset.

Display pass, opaque and transparent alike:

1. Decode dye with the exact IEC 61966-2-1 transfer (`dyeToLinear`). HDR dye
   keeps the hue 0.8.0 displayed (per-channel clip of the authored value) and
   its peak scales linear energy so the tone map has a highlight to roll off.
2. Sunrays multiply dye before decode (display-referred, as in 0.8.0; ray
   contrast is unchanged). Bloom is masked by sunrays and added in linear
   light.
3. Tone map once (`toneMapping`, Bucket B keyword):
   - `'neutral'` (default): the Khronos PBR Neutral shoulder with its exact
     constants (`startCompression 0.76`, `desaturation 0.15`). Its toe offset
     (up to −0.04 linear, a PBR Fresnel-F0 compensation) is omitted: with
     display-referred input it crushed every dark background and dim dye.
     Without it, colours below the shoulder (≈0.89 sRGB) round-trip unchanged;
     only highlights roll off.
   - `'agx'`: AgX default look (bwrensch polynomial), with a 2.2 EOTF back to
     linear so there is still exactly one encode.
   - `'none'`: per-channel clamp, the 0.8.0 highlight behaviour.
4. Encode to sRGB once. Composite over `backColor` and paint the obstruction
   fill in display space using display-referred coverage. This is the same
   operation the browser performs for a transparent canvas over a page of the
   same colour, so opaque and transparent modes agree, and pale dye over a light
   `backColor` keeps its hue as in 0.8.0. A linear-light composite was tried and
   rejected: it washed LightBackground dye to grey.
5. Dither every output mode (display, reveal, distortion) with ±1 LSB blue
   noise scaled by alpha so transparent pixels stay exactly zero and every
   output stays premultiplied (no fringe).

**Bloom** is a dual-Kawase pyramid (Bjørge, SIGGRAPH 2015): a 5-tap downsample
with a Karis (luminance-weighted) average on the first level to suppress
fireflies, then an 8-tap tent upsample accumulated additively. The prefilter
keeps 0.8.0's max-channel brightness key. A luminance key was tried and
rejected: it starved saturated blue, red and purple dye of bloom and darkened
every bloom preset by 30–60 %. The cost is equal to 0.8.0's box pyramid
(≈0.5 ms per pass at 410×256 with 7 levels on Apple-silicon Chrome, within
run-to-run noise), using the same framebuffers and no new allocations.

**Preset retunes** (minimal, verified against 0.8.0 renders):

- GasFlare: `toneMapping: 'none'`, `bloomThreshold: 0.3`, `bloomIntensity: 1.2`.
  Neutral's shoulder desaturates the `fire` transfer's 1.5-peak core toward
  pink. The retune keeps the yellow-white core and restores the halo that the
  softer pyramid spreads more thinly.
- LavaLamp: `toneMapping: 'none'`. Its HDR wax (`r` 1.5–1.8) over a light
  back desaturates to salmon under Neutral. The clamp keeps 0.8.0's saturated
  red and orange. Hot cores now show internal structure instead of a flat fill.

## Known issue

GasFlare's jet core shows aliasing from the pre-existing scalar-transfer
mapping (temperature to `fire` colour on a 160² simulation grid sampled at dye
resolution). In 0.8.0 the clipped highlights hid it. With roll-off it is
visible as fine stair-stepping in the brightest column. This is a simulation
or visualization issue, not a display-pipeline one, and is left for a separate
change.

## Consequences

- In-range colours are unchanged. Highlights roll off instead of clipping to
  white, so bright presets (Aurora, Plasma, FrameFluid) show detail and hue
  where 0.8.0 had flat white. Their overall brightness drops 5–15 % because
  clipped white no longer dominates.
- Dark-gradient banding is reduced in every mode, including bloom-off presets.
- Bloom is softer and wider with no fireflies. Halos over empty backgrounds
  match 0.8.0's colour.
- `toneMapping` is a hot keyword. Toggling it recompiles only the display
  program and allocates or deletes no framebuffers (covered by
  `display-pipeline.browser.test.ts`).
- Presets that set `toneMapping` are pinned by `display-pipeline.test.ts`.
  Any new opt-out needs an entry here.
