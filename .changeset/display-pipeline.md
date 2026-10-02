---
'svelte-fluid': minor
---

Linear display pipeline with tone mapping, dual-Kawase bloom and dithering (ADR-0081).

- New `toneMapping?: 'neutral' | 'agx' | 'none'` prop (default `'neutral'`). It is hot-updatable and recompiles only the display program.
- **Visual change:** bright dye and bloom now roll off smoothly instead of clipping to flat white. Very bright presets (Aurora, Plasma, FrameFluid) show more hue and detail in their highlights and read somewhat dimmer overall. Colours below the highlight shoulder are unchanged. Set `toneMapping: 'none'` for the 0.8.0 clipped look.
- Banding is reduced: every output mode (opaque, transparent, reveal, distortion) is now blue-noise dithered, not just bloom.
- The bloom is softer and wider, with no single-pixel fireflies (dual-Kawase pyramid with a Karis average). Its cost is unchanged.
- GasFlare was retuned (`toneMapping: 'none'`, `bloomThreshold: 0.3`, `bloomIntensity: 1.2`) and LavaLamp now uses `toneMapping: 'none'`, so both keep their saturated fire and wax colours.
- Transparent, reveal and distortion output is strictly premultiplied, so there is no light fringe over page content.
