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
