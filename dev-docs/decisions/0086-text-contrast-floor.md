# ADR-0086: Opt-in WCAG contrast floor in the display pass

## Status

Accepted (2026-10-02). Bead svelte-fluid-ddf.

## Context

No component guaranteed WCAG AA (1.4.3) for text. Measured with
`src/lib/engine/__benches__/contrast.browser.test.ts` (5th-percentile
text/backdrop ratio, hardware Chrome, 150 frames):

- **FluidText** (transparent canvas, fluid inside glyphs over the page): worst
  case 1.0:1 on every preset against black and white pages. Dim dye in a
  transparent canvas is simply the page colour, so letters vanish.
- **FluidBackground** (text over opaque fluid): white text 1.1:1 (Aurora,
  FrozenSwirl), black text 1.0-1.1:1 on nearly every preset.
- **FluidReveal**: the content is plain DOM. Revealed pixels (cover alpha < 0.1)
  keep 17.5:1 of 21:1 for black/white text (5th percentile); the cover is
  *meant* to hide the content, so partially covered pixels are a transient
  animation state, not static text.

## Decision

Add `minContrast` (1-21, default off) and `contrastColor` (0-255 RGB, no
default) to `FluidConfig`. When `minContrast > 1` the display
shader (keyword `CONTRAST_FLOOR`, Bucket B on enable/disable, value is a hot
uniform) composites each pixel over the reference colour, and any pixel whose
WCAG ratio against the reference misses the floor is replaced by a corrected colour: brightened
(hue-preserving, then mixed to white) against a dark reference, or scaled down
(hue-preserving) against a light one. A pixel passes if its ratio against the reference is already >= the floor on
either side (darker or lighter than the reference), so black dye over a mid-grey
reference stays black; only failing pixels move. The 0.8.0 look is bit-identical
with the floor off and unchanged where it passes. With no reference colour the
correction is off: the engine never guesses a page colour (an earlier
`backColor` fallback painted whole transparent canvases grey). The keyword
compiles only when a reference exists; an opaque-canvas halo uses `backColor`.
The luminance bound is closed-form (`contrast.ts`, Node-tested); the shader
mirrors `applyContrastFloor`. A 3% margin absorbs 8-bit quantisation and dither.

- `FluidText` defaults `minContrast=3` (AA large text), and measures the page
  colour on mount (`css-color.ts`: a 1x1 2D canvas normalises any CSS colour
  syntax, `oklch()`/`lab()`/`color()`/alpha included; translucent ancestors are
  composited down to the first opaque one, white/black per `color-scheme` at the
  root; a `background-image`/gradient cannot be measured, so its
  `background-color` is used with a one-time dev warning asking for `contrastColor`); `contrastColor` overrides.
- `FluidBackground` leaves it off (opaque canvas, 0.8.0 look) and, when the
  consumer sets `minContrast`, uses the content's computed text colour as the
  reference unless `contrastColor` is given.
- `Fluid` default is off.
- `FluidReveal` gets no shader change: the reveal output is alpha-only over
  consumer DOM. AA means: fully revealed text has its own authored contrast;
  the cover is intentionally opaque. Documented as a consumer responsibility.
- Not covered: glass reflections (composited after the display pass), bloom
  outside the display pass, and `FluidDistortion` (image content).

### FluidText visual revision

Per-pixel correction in FluidText was rejected on visual review: empty glyph
interiors became flat grey slabs. FluidText now uses the WCAG halo/border
technique: a ~1.5 CSS px band outside the glyph boundary, generated from the
existing jump-flood SDF (ADR-0084), anti-aliased over one device pixel via
`pixelCoverage`. The halo colour derives from the page luminance and requested
ratio: dark ink on light pages, light on dark. Interior dye is bit-identical to
`minContrast=1`. Without JFA (WebGL1) the same band is built from neighbouring
coverage-mask taps (no per-pixel floor: it would bring the slabs back).
`contrastMode=outline` selects the halo for svgPath masks; FluidText sets it.
The band follows the glyph boundary only: it is weighted by `1 - cmask` computed
before obstructions and by `1 - obCoverage`, so obstruction holes are not
filled. On an opaque canvas the halo replaces the composite (`mix`, reference
`backColor`) instead of adding. FluidBackground retains the per-pixel floor.
The halo colour is white or black (or the grey that just clears the ratio);
when neither side reaches the ratio, the side with the higher achievable ratio
wins (page L=0.30, 10:1 requested gives black at 7:1), not a false guarantee. Anti-aliased edge pixels are excluded from the solid-band measurement.

### Small-text default evidence (2026-10-03)

`FluidText` now defaults to 4.5; explicit `minContrast=3` remains the large-text
opt-out. `contrast.browser.test.ts`, `FluidText actual small-text AA default`,
mounts the real component with no `minContrast` or `contrastColor` override on
measured white/black pages. Baseline: `c873fdf5d3763fba2d70145fccecdf873e6c03c5`.
Fixture: `Fluid`, `16px Arial, sans-serif`, regular weight, CSS box
34.671875 × 11.640625 px. The existing mask fitter uses 90% glyph padding, so
visible glyphs are approximately 14.4 CSS px, not large text. Seed 42, two
opening splats, reduced-motion still; no runtime rendering changes.

Ordinary installed hardware Chrome, actual DPR 1/2/3, native backing sizes
34×11 / 69×23 / 104×34: minimum default ratios **4.542224959605253:1** (light),
**4.557768319672582:1** (dark), at every DPR. The identical mounted fixture
with only `minContrast=3` changed measured **3.0334698257384747:1** /
**3.0448346617620263:1**. Six tests passed (two themes per DPR).

Sampling: WCAG relative luminance of the composited opaque perimeter foreground
versus the measured adjacent uniform page background. Select full halo coverage
(alpha 255), outside glyph coverage (reveal diagnostic alpha 0), where the same
state with the halo disabled has alpha 0; 96 / 620 / 1485 samples per policy
at DPR 1/2/3. This is a minimum, not a percentile or passing-pixel count.
Partial antialiased edge coverage and interior dye are intentionally excluded.
This proves this small-text halo envelope, not every font, page colour, theme
transition, WebGL1, full-component accessibility, or visual approval.

Twelve current canvas-composite PNGs and six raw JSON records are in
`/tmp/small-text-contrast/` (not committed). `previous-3` versus `default-4.5`
is a same-fixture **policy comparison**, not historical before/after build
screenshots. Reproduce each DPR with
`VITEST_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' SVELTE_FLUID_DPR=1 bun run test:browser src/lib/engine/__benches__/contrast.browser.test.ts -t 'actual small-text'`
(repeat with 2 and 3). Node tests, `bun run check`, `bun run prepack` passed.

## Consequences

Easier: one prop gives a measurable AA guarantee; no new runtime deps.
Harder: the floor flattens the brightest/darkest dye extremes towards the
reference where they would fail; FluidText gains a thin outline, not flattened interiors. A runtime page-theme change needs
`contrastColor` or a remount.

Rejected: always-on floor (alters 0.8.0 look for every consumer); a duplicate CSS
text layer (mismatched font/mask geometry);
clamping dye at splat time (cannot know the final composite).
