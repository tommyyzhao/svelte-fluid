---
"svelte-fluid": minor
---

WCAG contrast floor and FluidText halo.

Text masks use an outline halo by default; other displays retain the floor.

- New `minContrast` / `contrastColor` config: the display pass lifts or darkens
  any pixel whose contrast against the reference colour is below the ratio.
  Off by default, so the 0.8.0 look is unchanged. Pixels already passing are
  untouched; without a `contrastColor` the correction does nothing.
- `FluidText` now defaults to `minContrast={4.5}` (AA for all text sizes) against the
  page colour (measured via a 1x1 canvas: oklch/lab/alpha safe; gradients need `contrastColor`), using a ~1.5 CSS px SDF halo (WCAG border technique). Interior dye stays
  unchanged, WebGL1 included (halo from the coverage mask). Pass `minContrast={1}` to restore the previous output, or `3` for
  large text. **Behaviour change**: a thin outline around `FluidText` letterforms.
- `FluidBackground` accepts `minContrast`; the reference is the content's text
  colour unless `contrastColor` is set.
- Docs describe the guarantee and what stays with the consumer (FluidReveal
  cover, glass reflections, text colour changes at runtime).
