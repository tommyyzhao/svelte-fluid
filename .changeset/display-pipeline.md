---
'svelte-fluid': minor
---

Display pipeline correctness fixes and opt-in tone mapping (ADR-0081).

- **Presets look unchanged by default.** Bloom spread, crispness and saturation match 0.8.0.
- New `toneMapping?: 'none' | 'neutral' | 'agx'` prop, default `'none'` (the 0.8.0 per-channel clip). `'neutral'` (Khronos PBR Neutral) and `'agx'` are opt-in and roll bright dye and bloom off smoothly instead of clipping to white. It is hot-updatable and recompiles only the display program.
- `backColor` is now exact: dark backgrounds are no longer lifted about 11/255 by gamma-encoded dither noise.
- Banding is reduced: every output mode (opaque, transparent, reveal, distortion) is now blue-noise dithered, not just bloom.
- Bloom suppresses single-pixel fireflies (Karis average on the first downsample) at unchanged cost.
- Transparent, reveal and distortion output is strictly premultiplied, so there is no light fringe over page content.
