# ADR-0094: Liquid drop zone (and caustics overlay)

## Status

Accepted (2026-10-02)

## Context

The `layer2-proto` surface lab had two scenarios that were not promoted with
ADR-0092: drag to a drop target (the liquid climbs the target's wall as the
item approaches, then one ripple on drop) and light over live text (caustics
and glints over a DOM paragraph). The drop target was a custom draggable card
with its own keyboard model. The text overlay was so faint it barely read.
Both need native semantics, a contrast guarantee and the ADR-0091 lifecycle.

## Decision

`LiquidDropZone` on the existing `SurfaceEngine`. `SurfaceControl` gains two
kinds, `'dropzone'` and `'overlay'`, and `SurfaceConfig` gains `drag` (the
dragged pointer, or null) and `overlay` (the clamped peak strength). Button and
segmented behaviour are unchanged.

- **`LiquidDropZone`** is a `<label>` around a visually hidden but focusable
  `<input type="file">`. Click, Enter, Space, touch and pen all open the
  browser's own picker. HTML5 drag and drop: the label accepts file drags
  (`preventDefault` on dragenter/dragover). A window-level dragover listener
  tracks the pointer, so the climb starts before the pointer reaches the zone.
  Drops are filtered by `accept` and cut to one file unless `multiple`, as the
  input would. Each drop is mirrored into `input.files` for forms, sends one
  press from the drop point, then calls `onfiles` (through `notifyHost`) and
  updates a polite `role="status"` region (`'2 files selected'`, overridable
  with `announce`). An empty result (cancelled picker, rejected types) does
  nothing. The focus ring is the SDF ring of ADR-0092.
- **Climb.** Proximity is `smoothstep` over 220 CSS px of rounded-rect
  distance outside the zone (1 on or inside it), eased with τ = 0.12 s. The
  height is analytic in the composite, like the meniscus: a sum over the four
  straight walls of `rise·s·(f + (1 − f)·N)·exp(−d/ℓ)`, with rise 9 px,
  ℓ = 18 px and floor f = 0.15. N is a Gaussian of the distance from the
  pointer to the wall point beside the pixel, so the wall nearest the pointer
  climbs highest. Its exact slope and Hessian feed the refraction, Fresnel
  and caustic terms. **Rejected:** deriving the climb from the JFA SDF (the
  first attempt). The SDF has a crease on each corner's medial axis, and an
  18 px climb reaches it: a pinched highlight at every corner. The four-wall
  sum is C∞ and rises slightly more into corners, as a real meniscus does.
  Settled, the step pass is skipped (the climb needs no field), so a held
  drag costs one composite per eased frame and none once eased.
- **Caustics overlay (engine only).** The `'overlay'` kind, its composite
  variant and the contrast helpers in `look.ts` (`overlayPixel`,
  `overlayContrast`, `overlayBudget`, `overlayCap`) land here as shared surface
  code. The `LiquidCaustics` component and its optics are a later amendment
  to this ADR.
- **Reduced motion.** The climb snaps to its target, a static hint while
  dragging, with no ripples and no loop.
- **Fallback.** Without WebGL2, the drop zone is a styled native label
  (gradient tray, inset border, native outline, dashed system border in
  forced colors).
- **Native DPR** (ADR-0089). Props are one appended block in `types.ts` with
  no GL types. Not exported from `index.ts`, and no docs route yet.

## Consequences

- GPU per instance (synced 1-px-readback batches, busy frames with an impulse
  every frame, Apple M1 Max, Chrome): drop zone 480×200 while dragging 0.46 ms
  at DPR 2 (native) and 0.58 ms at DPR 3. Budget 2 ms.
- The drop zone cannot see a drag's files before the drop (browser privacy),
  so the climb responds to any file drag. `accept` filtering happens on drop.

## Amendment: LiquidCaustics (2026-10-02)

**Decision.**

- **Component.** `LiquidCaustics` wraps arbitrary content. A canvas sits
  above it with `pointer-events: none` and `aria-hidden`. The `OVERLAY`
  composite draws only a premultiplied tint × k. Dark tones use
  `mix-blend-mode: screen` (cool white, adds light, never darkens); light
  tones use source-over toward a deep blue. Content is never resampled: text
  is not displaced or blurred, stays selectable, and zoom works. In forced
  colors the canvas is hidden. Props: `tone`, `intensity`.
- **Interaction only.** Caustics appear only as ripples from where you act:
  - pointer moves, throttled (≥ 60 ms and ≥ 10 px of travel) into the
    bounded 16-impulse queue at strength 1.1;
  - `focusin`, one ripple at strength 1.5 at the focused descendant.

  Each ripple spreads and fades over about 1 s (wave decay 0.45 s). At rest
  the field is flat, so the overlay is blank. Once the settle frame has
  cleared it, the engine renders nothing and schedules nothing until the
  next ripple.
- **Intensity is the area ratio**, I = 1/|J| with J = det(I + s·H) and
  s = 400 px × (1 − 1/n). H is the smoothed wave Hessian (ADR-0091). The fold
  singularity is regularized by the sun's angular size: I = 1/√(J² + ε²) with
  ε = |∇J| × 0.6 CSS px, never less than one pixel's change of J. So lines
  taper and dim where J crosses zero steeply, and widen and brighten where it
  crosses slowly and at cusps. No contour threshold and no fixed-width
  stroke.
  - Dark tone: x = max(I − 1, 0), eased as x²/(x + 0.25) so the edge of the
    lit region is C¹, then tone-mapped as x/(x + 2.5).
  - Light tone: light cannot be added to near-white, so only the defocused
    trough of a ripple shades, 0.7 · smoothstep(0, 0.8, 1 − I).
- **Edge fade** is a smooth product of four `smoothstep` ramps (28 px) on the
  analytic rect.
- **Contrast.** The 4.5:1 proof and clamp above are unchanged, and the shader
  clamps the dithered k to the cap. A browser readback over the text through
  a pointer ripple asserts the drawn k never exceeds the cap.
- **Reduced motion.** No ripples and nothing drawn: the content alone.
  The effect carries no information, so the unchanged content is the still
  final state.
- **Fallback.** Without WebGL2, offscreen or in forced colors: plain
  content.
- **Rejected.**
  - Ambient waves (seeded wave trains always running). They read as
    smudges or dirty glass, worst on the light tone. They broke "zero frames
    while idle". And they exposed the hard-edge bug below.
  - Thresholding the fold contour into a fixed-width line. It read as a
    uniform "doodle" net.
  - Mapping the capped ratio straight to strength. It read as grey blobs.

**The straight cut-offs, and the guard.** The rejected build showed hard
vertical and horizontal edges. Cause: the edge fade came from the JFA SDF,
but the overlay's rect is the whole canvas, so its coverage mask has no edge
along the straight sides. The SDF measured distance to the corner arcs only.
Light therefore ran at full strength into the canvas's straight edges, a cut
measured at 35–53 luma codes (dark) and 13–19 (light). A secondary hinge,
max(I − 1, 0) with a slope jump at I = 1, turned a straight crest into a
crease. The fade now uses the rect, and the knee is C¹.

A browser test runs ripples at the centre, near an edge and in a corner on
both tones. It requires that no row or column boundary carries a straight
step above 2 codes: the median one-pixel spike along 120 CSS px, or the step
from page to canvas edge. Dither alone is ±1 LSB, so a 2-code straight line
is the smallest that can stand out of it. The shipped build measures 0 at
the canvas edge and ≤ 0.29 inside. A self-check confirms the metric passes
a soft ring and catches a 3-code cut.

**Consequences.**

- GPU per instance, 720×400 busy (impulse every frame): 0.33 ms at DPR 2
  (native), 0.40 ms at DPR 3. Budget 2 ms. Zero at rest.
- The overlay is feedback, not decoration. A page that never receives a
  pointer move or focus shows no caustics.
- The overlay budget is the minimum over visible nonempty native DOM text
  runs, including root text, links and form labels, using each parent's
  computed colour and solid ancestor background stack. Authored colours and
  semantics are never rewritten. A pair already below 4.5:1 (or lacking the
  encoding safety margin) disables the whole overlay; this is nondegradation,
  not a claim that authored content meets AA.
- Unsupported content disables the whole overlay: gradients/images, filters,
  backdrop filters, non-normal blending, opacity, text fill/stroke differences,
  shadows, transforms, CSS animations/transitions, generated content, shadow or
  custom elements, embedded/replaced content and out-of-flow descendants.
  Measurements cap at 128 text runs, 512 elements and 64 root ancestors;
  overflow stays native rather than truncating the proof.
- Measurement happens at startup, update and resize, never per frame. Subtree
  text/child/class/style/hidden mutations, ancestor class/style theme changes,
  font loading and pointer/focus state transitions hide the canvas immediately
  and coalesce one remeasurement. Arbitrary CSSOM stylesheet replacement and
  externally driven overlapping layers are outside the supported static-solid
  contract; this is not a general page contrast auditor.
