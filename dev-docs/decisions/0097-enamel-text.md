# ADR-0097: EnamelText: compliant enamel on glyphs, gather-form pair transport, glyph contrast band

## Status

Accepted (2026-10-02)

## Context

The WebGPU R&D branch found one material useful in a design system: compliant
enamel typography (R&D ADR 0072, exported experimentally under R&D ADR 0078).
Native glyph coverage gets a molded, rounded rest profile; a press displaces
the material, which then relaxes; the outline never moves. Main is WebGL2 on a
shared host (ADRs 0088, 0093), so the model has to be ported, and a static
CSS/SVG bevel of the same text is the baseline it must visibly beat.

The R&D version had three known faults: a CPU two-pass chamfer distance whose
octagonal metric drew "chamfer-normal stripes" along curves (owner review),
52–525 ms of CPU setup per layout, and a satin light that still needed care to
avoid pixel-sized glints.

## Decision

`engine/enamel/` is a sibling model engine (`EnamelEngine`) on the shared host
(`acquireGlHost`/`releaseGlHost`, `subscribeFrame`). It owns a coverage
texture, the jump-flood SDF, the fine rest profile, a coarse rest/geometry
texture, an R32F height ping-pong and a deviation texture.
`EnamelText.svelte` is a native `<span>` (the consumer's heading supplies the
role) with a decorative canvas. Root-exported with a docs section after the tuning pass (see ADR-0095).

**Rest profile.** The DOM text node is redrawn per laid-out line (Range boxes,
computed font) into a device-px coverage image (R&D text-source, unchanged in
substance). Main's Euclidean jump flood (ADR-0084) replaces the chamfer: rest
height is `0.72 · sin(min(d / plateau, 1) · π/2)` with the plateau at
0.085 × font size, then a separable Gaussian (σ = 0.025 × font) on the *rest
surface*, which rounds medial ridges without touching the silhouette. Shading
relief is 0.12 × font at the plateau (the press deviation keeps 0.04 × font:
steeper dent walls turn into grazing Fresnel streaks). A second, wider blur
of the rest (σ = 0.05 × font, setup only) is the cavity term below. Setup is
now GPU passes: 20–25 ms first frame at 3× including the 2D raster, versus
52–525 ms.

**Model** (unchanged from R&D, pure mirror in `profile.ts`). Disjoint pairs
exchange height down the potential `h − rest + contact`, with the exact
two-cell relaxation fraction `½(1 − e^{−2kΔt})` and a donor bound so no cell
goes negative. Four phases (x even/odd, y even/odd) per 240 Hz substep, order
alternating each substep. Cells below 8% coverage are solid (stored as rest
−1) and exchange nothing, so material never crosses a counter or a gap
between letters. Coarse cells are ~font/48 CSS px (2 px at 96 px).

**Fragment port of pairwise transport.** WebGL2 has no compute or storage
buffers, so each phase is a gather pass: every texel derives its pair's A
(left/bottom) cell from coordinate parity and phase, and *both* texels of the
pair evaluate the identical ordered expression `flux(A→B)`; A writes
`hA − flux`, B writes `hB + flux`. Same inputs, same instructions, so the two
results cancel exactly up to float rounding. Height is R32F and the engine
requires `EXT_color_buffer_float`; without it EnamelText shows plain text
(half float would round each exchange and drift mass). Measured on hardware:
1.6 × 10⁻⁸ relative mass change after 500 steps with presses. The R&D
`limitedTransfers` diagnostic atomic is dropped; dynamic-offset uniforms
become per-draw uniforms.

**Lifecycle.** A press is held while the pointer is down (observed on the
root, `pointermove`/`pointerup` on window, never captured or prevented); its
strength eases out over 60 ms on release, and after a 1.6 s tail the field is
reset to rest exactly (the remaining deviation is below 8-bit shading). No
frame subscription at rest or offscreen. Reduced motion draws the static rest
relief and ignores presses; turning it on mid-press snaps to rest. Context
loss drops handles and hides the canvas (DOM text reappears); restore
rebuilds from the raster. `undefined` config fields never overwrite.

**Optics and contrast budget.** Composite at device px: fine rest slope plus
the deviation's cubic B-spline slope (C², so a dent has no cell seams), a
diffuse body with a low ambient floor (0.10 light, 0.12 dark; key at ~37°
elevation, upper left), and Schlick-Fresnel reflection of a room gradient
plus one broad Gaussian soft box (σ 0.5: narrower boxes left a pinpoint on
convex corner domes). Cavity occlusion: where the wide-blurred rest rises
above the local rest (concave corners, edge feet), diffuse and half the
reflection darken by up to 60%. A rim highlight sits on a level set of the
smoothed rest surface near the edge (Gaussian across it, ≥ 0.6 CSS px,
weighted by facing the key), so it is anti-aliased and follows curves; an
SDF-distance rim showed JFA quantisation ticks. No strip lights: a narrow
light turns slope quantisation into pixel glints. The shaded glyph *is* the text,
so `look.ts` computes a luminance band against the measured page colour:
3:1 for large text (≥ 24 px, or bold ≥ 18.66 px), 4.5:1 otherwise, ×1.05
margin. The glyph keeps the side its body colour is on when that side can
reach the ratio. A softplus knee compresses shading into the band (monotone,
identity well inside it, so highlights roll off instead of clipping), scaling
luminance to keep hue and mixing toward white only past a channel's peak.
Node tests sweep shadow to HDR highlight with ±1 LSB dither over seven body
colours and six pages; hardware tests read the worst opaque glyph pixel
(3.11 on the light review pair, where the deepened shading reaches the
band's knee on ~2.5% of interior pixels; 4.0 dark; 3.11 for a grey body
forced into the band).

**DOM text.** Selectable, findable and zoomable; it turns transparent only
after the first frame is presented. Any failure (no WebGL2, no float render
targets, nested markup, vertical or transformed text, > 512 chars, frame
error, lost context) leaves it visible. Forced-colors mode hides the canvas.

## Consequences

- 96 px bold heading at 3×: 0.72 ms median, 1.49 ms worst 30-frame batch with
  a held press (synced batches). Zero GPU work at rest.
- The kill-gate comparison (contact sheets in the lane report) is about
  response: a still relief is roughly matched by a tuned SVG
  `feSpecularLighting` bevel; the press that sinks, bulges beside itself and
  relaxes is not something a static bevel can do.
- Fine reconstruction, masking and partial cells are not exactly
  volume-conserving; only the coarse state is. Layout changes re-deposit at
  rest (a press in flight is dropped).
- Rejected: CPU chamfer (stripes, setup cost); half-float height (mass
  drift); scatter emulation via vertex points (needs atomics or two writes per
  texel); a hard luminance clamp (clipped highlight plateaus).
