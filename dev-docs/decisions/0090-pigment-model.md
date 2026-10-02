# ADR-0090: Pigment model: 12-band Kubelka–Munk, wet-to-deposited transfer, paper height

## Status

Accepted (2026-10-02). First model engine on the shared host (ADR-0088).

## Context

The private ink-on-paper prototype (branch `layer2-proto`, `/lab/ink`) showed
that subtractive pigment on a light page looks like nothing else in the
library: a blue wash crossed by yellow turns green, edges darken as they dry,
and the grain of the paper shows through. The additive dye renderer cannot do
this, since adding yellow to blue light never gives green. The prototype had its own
WebGL context, `Math.random()` seeds, a dark/gouache mode, a glow comparison,
a benchmark hook and no context-loss handling. It reset nothing on resize but
stretched its fields, and read `matchMedia` at mount without SSR guards.

## Decision

**Engine.** `engine/pigment/PigmentEngine.ts` is a sibling class, not a
`FluidEngine` mode. It registers with `acquireGlHost`/`releaseGlHost`, renders
only inside `host.run()`, compiles through the host program cache, and binds
every texture and uniform it reads. It owns only its fields: velocity, wet
(suspended) pigment, deposited pigment, water, pressure scratch, the paper
height texture at simulation and canvas resolution, and the resist SDF.

**Model (after Curtis et al. 1997).** One solver step per 60 Hz frame of wall
time on a grid of about 3 CSS px per cell (cells grow so no side exceeds 512):

1. Brush dabs add water, wet pigment and drag (MRT, 32 per pass).
2. Shallow-water velocity: damped advection, vorticity, 16 warm-started
   Jacobi iterations, and Curtis's outward flow `-eta * grad(water)`, which
   carries pigment to the drying rim (edge darkening).
3. Transport: semi-Lagrangian advection, capillary spread on an isotropic
   8-neighbour stencil through a permeability map with contact-line pinning,
   and evaporation that is faster near dry paper (Deegan's coffee ring).
4. Wet-to-deposited transfer at a per-pigment settle rate, faster in the
   valleys of the paper height for granulating pigments. A cell deposits
   everything as it dries. Rewetting lifts a little non-staining deposit.

**Optics.** 12 spectral bands (equal CIE energy, three vec4s per pigment).
Each pigment colour is solved to a Kubelka–Munk absorbance that reproduces it
at unit concentration over white (transparent watercolour, `S = 0.12`). The
deposited layer sits on the paper and the wet layer is glazed over it. Bare
paper is corrected per channel to show the exact `paper` colour. Paper height
(fbm tooth plus domain-warped fibres, sampled in CSS px so grain is
DPR-independent) adds a raking light; standing water darkens the paper and
adds a faint sheen. Output is sRGB with ±0.5 LSB dither. Light paper only:
the gouache/dark mode, additive glow comparison, bench and debug views were
not promoted.

**Drying is bounded.** Each dab sets a drying clock from its own depth
(`ceil(depth / EVAP) + 30` steps, depth clamped to 1.6). The clock only grows
when input is accepted and counts down one per step. The last step blots any
remaining water, so a dry surface holds no water or wet pigment.

**Model-engine contract.**

- *Sibling, WebGL2-only.* No WebGL1 path and no backend selector. Without
  WebGL2, a bitmaprenderer or float render targets, the constructor throws.
  `InkPaper` then keeps its `paper` background colour and its children are
  untouched (native-control fallback). A runtime fault calls `onError` once
  and hides the canvas.
- *Idle means zero frames.* The engine subscribes to the shared scheduler only
  while wet or after a change that needs one present (resize, options,
  resist). Dry, idle, offscreen (IntersectionObserver in the component) and
  lost surfaces have no subscription.
- *Bounded input (ADR-0079).* At most 512 dabs queued and 64 landed per step.
  Saturated input is dropped. Non-finite dabs are rejected and negative loads
  are clamped. Coalesced pointer samples are capped at 16 per event, and touch
  pointers are capped too. The replay log keeps the newest 2048 dabs.
- *Deterministic.* The paper grain and opening wash come from `seed` through
  mulberry32. No `Math.random`.
- *Options.* `undefined` or invalid values never overwrite resolved ones
  (`pigment/options.ts`).
- *Resize resamples.* Fields are resampled in CSS space, anchored top-left
  like the DOM above them. The painting neither stretches nor resets.
- *Context loss.* The canvas keeps its last frame. On restore the engine
  rebuilds its fields and replays the stroke log invisibly at fixed steps to
  the dry state, then presents once.
- *Half-float fallback.* fp32 fields when `OES_texture_float_linear` and
  RGBA32F rendering exist, else the host's half-float formats. Drying is
  then coarser but still bounded by the step clock.

**Component.** `InkPaper.svelte` is a `<div>` with the paper as its background
colour and an `aria-hidden` canvas behind its children (isolated stacking
context, `z-index: -1`). Props: `paper` (any CSS colour, normalised to opaque hex via
`css-color.ts` after mount, since the spectral solver takes hex), `pigments`
(up to four hex colours), `brush?`,
`seed?`, plus `class` and rest attributes. All prop types live in `types.ts`.

- `[data-ink-resist]` children are masked by their own outline: the border
  box with all four computed `border-*-radius` corners (per-axis radii,
  percentages resolved, CSS overlap scaling via `roundRect`), rasterised
  antialiased and turned into a jump-flood SDF (ADR-0084) through the host
  program cache. The solver reads it at simulation resolution. The display
  reads it with a one-device-pixel edge (`clamp(0.5 - d * pxPerTexel)`), so
  pigment meets a pill's rounded border exactly and cannot bleed under it
  through the bicubic upsample. The first version used bare rects dilated by
  10 px, which left a paper-coloured "card shadow" around rounded controls.
- Focusing or hovering a `[data-ink-wick]` child sends pigment creeping along
  its lower edge, so keyboard users reach the effect too. An integer value picks the pigment.
- Pen pressure scales radius and water. Touch drags paint horizontally and
  scroll vertically (`touch-action: pan-y pinch-zoom`).
- The opening wash is laid around the resists, so it never floods the narrow
  gaps between them. A stroke cut by a resist keeps only its longest
  contiguous run, and a bloom without its centre is dropped. The first
  version filtered dabs one by one, which left an isolated faint dab beside
  the hero button.
- Reduced motion: no pointer painting, and wet paper is solved invisibly (16
  steps per frame) and presented only when dry, so the first present is the
  finished still. `watchReducedMotion` runs in `onMount`, and nothing reads
  `window` or `matchMedia` at import or construction (SSR-safe).

Not root-exported in this change. A later change ships exports, docs and the
changeset.

## Measurements (Apple M1 Max, Chrome 154, ANGLE Metal)

Synced batches (ADR-0089): 30 frames between 1-px readbacks, `gl.flush()`
per frame so tile hidden-surface removal cannot cull the overwritten
display, median of 9 batches, 800×500 CSS, full solver kept wet, one resist.

| DPR | Canvas | Step + display | Step | Display |
|---|---|---|---|---|
| 2 | 1600×1000 | 0.97 ms | 0.84 ms | 0.53 ms |
| 3 | 2400×1500 | 1.46 ms | 0.86 ms | 1.12 ms |

The parts measured alone overlap within a whole frame, so they do not add up.
The budget is < 2 ms per instance per frame. A dry surface costs nothing.

## Consequences

- Second-generation models have a worked template: host registration,
  per-instance fields, idle-zero scheduling, bounded input, replayed restore.
- The Curtis solver is a model, not a calibrated fluid. Parameters (eta,
  pinning, evaporation, settle and granulation rates) are tuned by eye
  against the prototype frames.
- Restore replays at most 2048 dabs. Older marks of a very long session are
  lost on context loss. Snapshotting the deposit field would remove the cap
  at the cost of a CPU readback.
- Resist rects update on resize, DOM mutation and pointer-down/focus. Pure
  position changes without a mutation (transforms) are picked up at the next
  interaction.
- Rejected: a `FluidEngine` mode (keyword permutations and shared config for
  an unrelated model), WebGL1 support (MRT and float render targets are
  load-bearing), and resetting on resize (destroys the user's painting).
