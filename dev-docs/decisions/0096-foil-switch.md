# ADR-0096: FoilSwitch — the R&D snap foil as a borderless native switch

## Status

Accepted (2026-10-02). Number 0095 is the lead's disposition ADR.

## Context

On the private WebGPU branch (`rd/webgpu-replacement`, ADR 0078 there) the
owner trimmed the material library to one thing: a borderless foil
appearance switch. The "clicky" bistable snap, with no box around it, was the
part that was liked. Main ships WebGL2 only (ADR 0088), so the material
must be ported to GLSL ES 3.00 on the shared host without changing its feel.

## Decision

**Model (verbatim).** `engine/foil/model.ts` copies `advanceCommittedFoil`
unchanged: a one-mode quartic double well `E = k(q² − 1)²/4` (k 42), a
finite actuator `clamp(80·(target − q), ±40)` that is removed once the foil
is captured (|q − target| < 0.002, |q̇| < 0.12), damping 14/s, and a uniform
time scale of 8 integrated at 1/1920 s. Hover is a small load
`12·(y − 0.5)` (|load| ≤ 6, well below the 10.8 snap load); touch adds none.
Retargeting keeps position and momentum. Measured, both directions:

| Rate | Crosses zero | Captured | Overshoot |
|---|---|---|---|
| 60 Hz | 83.3 ms | 200.0 ms | 4.30% |
| 120 Hz | 75.0 ms | 191.7 ms | 5.39% |
| 240 Hz | 70.8 ms | 191.7 ms | 5.39% |

This matches the R&D record (about 0.2 s capture, ≤5.4% overshoot).
Off arches up (q = +1); on bows down (q = −1), as in R&D.

**Render (port).** One analytic fragment pass, a line-for-line port of the
R&D WGSL: the parabolic arch band, a Fresnel term, the studio environment
(overhead strip, warm left rim, cool floor), fine grain, rolled edges, and
the two rounded mounts. The R&D transparent variant is kept: premultiplied
alpha, with nothing outside the arch and mounts (no backdrop, no shadow).
Port notes:
- The WGSL `uv` y-flip is folded into the point mapping (GL `vUv` is y-up).
- `fwidth` AA and the aspect fit (`max(1, aspect)`) are unchanged.
- The R&D tone map `1 − e^−x` is kept. Its `pow(1/2.2)` encode is replaced
  by main's exact `linearToSrgb` (ADR 0081), then ±1 LSB blue-noise dither
  scaled by alpha, so transparent pixels stay exactly zero.
- The hover view tilt and its uniforms (hover x, hover y, hovered) are the
  R&D ones.

**Contrast budget (deliberate difference).** The arch shape carries the
state, so the metal is a WCAG 1.4.11 graphical object and must reach 3:1
against the page. Measured from R&D captures at 3×, the R&D light-tone metal
reaches only 1.79:1 at the 5th percentile and 2.93:1 at the median on
`#f7f7f2`. `look.ts` derives a luminance bound from the measured page
(`contrastFloor` with a 1.05 margin). The shader applies `clampMetal`: on
light pages, a soft exponential roll-off above 30% of the bound (it keeps
hue and the highlight gradient); on dark pages, a just-enough lift toward
white. The Node test sweeps the linear unit cube with ±2/255 encode error
for both tones and a grey page sweep. A hardware readback asserts ≥3:1 for
every opaque arch pixel, in both tones, both states and with hover. Dark
tone is unchanged in practice (R&D already measured 5.1:1). Light tone is
visibly darker, a pewter rather than a bright steel. The mounts are dark
fixtures, not state, and are exempt.

**Engine.** `FoilEngine` follows the pattern of the other model engines
(ADR 0088, ADR 0091):
- It shares the host via `acquireGlHost`/`releaseGlHost`. It owns only a
  dither texture and two floats of state. All its GL work runs inside
  `host.run()` with every uniform bound.
- It subscribes to `subscribeFrame` only while the foil is moving or dirty.
  At rest, offscreen, while `document.hidden` or under forced colors it has
  zero subscriptions and zero submissions.
- A state change made while offscreen or hidden lands in its well, so a
  stale snap never replays later.
- Context loss and restore come through the host callbacks. Consumer
  callbacks go through `notifyHost`.
- `undefined` in a config patch keeps the resolved value (`null` hover is a
  value).
- A redundant patch costs no frame.
- Measured GPU cost, as synced throughput (ADR 0089 method: 60-frame batches
  bracketed by a 1-px readback): 0.012–0.015 ms per frame at 96×48 and
  192×96 CSS, DPR 2 and 3 (Apple M1 Max, hardware Chrome).

**Control policy (ADR 0092 applied).**
- `FoilSwitch` wraps `<button type="button" role="switch"
  aria-checked>`. The label is DOM `children`; native attributes are
  forwarded.
- `checked` is `$bindable` and flips synchronously in the click handler,
  before `onchange`, so the physics never gates the state. Space and Enter
  are the browser's.
- No chrome: no border, background, shadow or pill. The button still
  gives a hit area of at least 48×48 CSS px.
- The outline appears on `:focus-visible` only.
- The canvas sits in an `aria-hidden` wrapper with `pointer-events: none`.
- Under reduced motion the arch is drawn in its final well and nothing
  animates.
- In forced-colors mode, without WebGL2, or after a frame failure, an SVG
  arch in the same shape (as R&D) shows the state, drawn in `ButtonText`
  under forced colors.
- Input to visible motion is one animation frame. In headless hardware
  Chrome, the first rAF after the click already shows motion in 8 of 8
  trials (1.5–17 ms, one frame interval at most).
- Props live in `engine/types.ts` (`FoilSwitchProps`, reusing `LiquidTone`).
  The component is not exported from `index.ts` and has no docs route yet.

## Consequences

- Main gains a WebGL2 foil with no WebGPU dependency. The look and timing
  are the R&D ones, except that light-tone metal is darker to meet 3:1.
- Not ported: the free (unactuated) foil and pointer-flick loading,
  `settleLoad`, and the explicit memory reservation. The R&D runtime's
  retry status and GPU error scopes are also left behind; WebGL2 failures
  go through host callbacks and the vector fallback. The composition with
  other materials is out of scope by owner direction.
- Rejected: keeping the R&D brightness and adding an outline halo, because
  that is chrome. A hard luminance clamp was not used, because it would cut
  every highlight above the bound to one flat value. The soft knee keeps the
  ordering (tested as monotone).
