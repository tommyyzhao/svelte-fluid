---
'svelte-fluid': minor
---

Six interface primitives are now exported (ADR-0090, 0091/0092, 0094, 0096). Each is a real native element with a decorative WebGL2 surface. They share one WebGL2 context per page (ADR-0088/0093), so they do not count against the browser's context cap. Without WebGL2 each falls back to a plain, fully styled native control. All honour `prefers-reduced-motion`.

- `InkPaper`: a `div` of paper that takes watercolour from pointer, touch and pen strokes. Props `paper`, `pigments`, `brush`, `seed`; `data-ink-resist` keeps a child dry, `data-ink-wick` blooms pigment on focus.
- `LiquidButton`: a native `<button>` with a lit liquid surface that ripples on press.
- `LiquidSegmented`: a native radio group whose selected option sits on a liquid lens that sloshes across on change.
- `LiquidDropZone`: a native file picker and drop target with a meniscus along its edge; `accept`, `multiple`, `onfiles`, `announce`.
- `LiquidCaustics`: caustic light over live content where the user acts; label and body text keep 4.5:1.
- `FoilSwitch`: a native `role="switch"` button drawn as a bistable metal arch; the metal keeps 3:1 against the page.

New types: `InkPaperProps`, `InkBrush`, `LiquidButtonProps`, `LiquidSegmentedProps`, `LiquidSegmentedOption`, `LiquidDropZoneProps`, `LiquidCausticsProps`, `FoilSwitchProps`, `LiquidTone`. See `/docs/components`.
