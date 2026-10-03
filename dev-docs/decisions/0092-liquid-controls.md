# ADR-0092: Liquid controls: native elements, label contrast budget, still states

## Status

Accepted (2026-10-02)

## Context

The prototype painted labels into a canvas texture, used `role="radio"`
buttons with a hand-written arrow-key handler (`segKey`) and had review-only
toggles. Controls built on the surface of ADR-0091 must keep native semantics,
stay legible over moving light and degrade to an ordinary control.

## Decision

- **`LiquidButton`** wraps a real `<button>`. Rest attributes are forwarded;
  `type` defaults to `'button'`. The label is DOM text above an `aria-hidden`,
  `pointer-events: none` canvas that overhangs the button by 6 CSS px so the
  focus ring can follow the button's SDF. Pointer, touch and pen presses ripple
  from the contact point (pen pressure scales 0.5–1.5×, as ADR-0083); Enter and
  Space ripple from the centre and activate natively. Keyboard focus shows a
  2 px ring 2 px outside the SDF plus a still light lift.
- **`LiquidSegmented`** is `<fieldset>` + `<legend>` + native radios inside
  `<label>`s. Arrow keys, Tab, form submission and `bind:value` are the
  browser's. The selected label's rect is the lens target; the lens follows a
  damped spring (ω 11 s⁻¹, ζ 0.8, settles in ≈0.5 s) and 40% of each move is
  released into the field as a free wave, so it sloshes across.
- **Tone** `'light' | 'dark' | 'auto'`; auto measures the page colour behind
  the control (`measurePageColor`, ADR-0086) and picks dark below the WCAG
  crossover luminance 0.179.
- **Label contrast budget.** Under each DOM label box (feathered 1–4 CSS px)
  the composite clamps the background's relative luminance into a band that
  keeps the label ≥ 4.5:1 × 1.05 against it: light text caps added light,
  dark text caps shade. A Node test sweeps added light (0–5 linear) and shade
  (0–1) for all four control/tone palettes, including ±2/255 encode+dither
  error, and asserts ≥ 4.5:1; another asserts the shader clamp mirrors the
  CPU one. Helpers live in `engine/surface/look.ts` and reuse
  `engine/contrast.ts`.
- **Reduced motion.** Presses add nothing; lens moves snap; the step pass
  writes only the settled lens. Focus and selection remain visible as stills;
  no frame is subscribed once drawn.
- **Fallback.** If WebGL2 or the host is unavailable, or the frame callback is
  evicted, the `live` class is removed: the canvas hides and CSS draws a fully
  styled native control (gradient fill, native outline, checked tint). In
  forced-colors mode the canvas is hidden and system colours and the native
  outline are used.
- **Not promoted:** the paint-to-texture path (`paint.ts`), the `liquid`
  action, the floating-card drag demo and the review toggles. Base `main`
  never contained them; nothing to delete.
- The components are not exported from `src/lib/index.ts` and have no docs
  route yet; props live in `engine/types.ts`.

## Consequences

- Assistive technology sees an ordinary button or radio group; the liquid is
  decoration.
- Labels cannot be refracted; they ride above the liquid. Only light under
  them is budgeted.
- Rejected: canvas-painted labels (no selection, translation or system text
  rendering); a custom radiogroup (re-implements native keyboard handling).

## Component policy amendment (2026-10-02)

`LiquidToggle` replaces the owner-rejected metal switch. It wraps a native checkbox with `role="switch"` in its visible DOM label, forwarding name/value/form and using `bind:checked` (including native reset). Its 96×48 CSS px track uses the existing segmented palette, rounded rectangle, lens target, damped spring and wave release unchanged. The target is the checked half of the track; Off/On text stays DOM-based, contrast-budgeted and visibly marks the selected endpoint. No new engine mode, stencil, solver or shader permutation. Reduced motion snaps the lens. CSS represents the checked endpoint without WebGL2; forced colours reveal a plain native checkbox. Focus uses the palette ring; consumer callbacks use `notifyHost`. Presentation retains fractional content-box sizing × actual DPR.
