# Design 13 — Next Session Plan (2026-05-13 → next session)

> **READ THIS FIRST**. The user is locking in `/design13` as the eventual main page and wants it polished end-to-end. This file is a complete handoff so you can resume without rebuilding context.

---

## TL;DR for future-me

The current `/design13` is good but needs:
1. **Language trim** — drop bloat in hero + Plasma section + audit all copy.
2. **Same image** in distortion section (both bosch).
3. **Add the Playground** (interactive ControlPanel) — main missing demo.
4. **Add other missing demos** from `src/routes/+page.svelte` (FluidReveal, Glass, "Build with `<Fluid />`" physics-tweak examples, transparent demo).
5. **Polish pass** — anything else suboptimal.

Implement end-to-end in one session. Verify with `bun run check && bun run test` after each major chunk.

---

## Current state of design13 (entering this session)

- File: `src/routes/design13/+page.svelte` (~1480 lines, all-in-one)
- Live at: http://localhost:5173/design13
- Hero: `FluidText "FLUID"` (per-letter) layered over a quiet `FluidBackground` (`initialSplatCount={15}`, no auto-splats)
- FluidText title settings finalized this session: `autoSplatRate=0.5`, `autoSplatCount=1`, `autoSplatSwirl=100` (was 2/4/300 — toned down per user)
- Sections in order: Hero → Install → Featured Plasma (cinematic) → Stylistic presets gallery (6) → Shape primitives gallery (6, incl. TextGlyph) → Sticky text gallery (2) → Distortion gallery (2) → Manifest → Footer
- Every interactive cell has `splatOnHover` enabled
- All 6 stylistic preset wrappers (`LavaLamp`, `Plasma`, `InkInWater`, `FrozenSwirl`, `Aurora`, `ToroidalTempest`) were modified this session to expose `splatOnHover` in their Pick<> Props type, prop destructure, and `<Fluid>` forwarding — mirroring the shape wrappers' API
- `prefers-reduced-motion` handling present via a `reducedMotion` $state flag
- All cells have `cursor: crosshair`

### Files modified this session
- `src/lib/presets/{LavaLamp,Plasma,InkInWater,FrozenSwirl,Aurora,ToroidalTempest}.svelte` — added `splatOnHover` to Pick type, destructure, and `<Fluid>` invocation (3 lines each)
- `src/routes/design13/+page.svelte` — tuned title auto-splats, added `splatOnHover` on raw `<Fluid>` shape cells + stylistic preset cells, added "Hover to splat" copy hints, added cursor styles, distortion uses `${base}/${cell.src}` template
- `src/routes/design14/+page.svelte` — bumped FluidBackground resolution for sticky physics (not focus next session)
- `src/routes/design15/+page.svelte` — same as 14 (not focus next session)

### Tests / typecheck status
`bun run check` → 0 errors, 1 unrelated warning in `design4/+page.svelte`.
`bun run test` → 276/276 pass.

### Library-change ADR status — NOT WRITTEN
The 6-wrapper API change (splatOnHover exposed) was discussed with the user but **no ADR written yet**. Per CLAUDE.md convention, engine changes need an ADR in `dev-docs/decisions/`. The wrapper change is additive (no behavior change for callers who don't pass the prop), but it IS a public API change. **Decide next session whether to write a small ADR** (probably yes, for completeness) OR defer until publishing.

---

## Task 1 — Language audit and trim (small, do FIRST)

### Hero eyebrow (line ~199 in design13)
**Currently:** `<div class="eyebrow">WebGL · Svelte 5 · MIT</div>`
**Change to:** `<div class="eyebrow">Svelte 5</div>`
(Drop "WebGL" and "MIT" — keep only "Svelte 5".)

### Featured Plasma section heading (around line 282–292)
**Currently:**
```svelte
<aside class="glass-caption">
    <div class="eyebrow muted">§ 02 · Preset · electric</div>
    <h3 class="display small">
        <span class="italic">Plasma</span>.
    </h3>
    <p class="body-copy small">
        High-frequency curl, saturated to the edge of the gamut. Best deployed sparingly — a
        single fluorescent accent across an otherwise muted page.
    </p>
    <a class="source-link" href="{base}/docs/presets#plasma">→ View source</a>
</aside>
```
**Change to:**
- Eyebrow: `§ 02 · Preset · PLASMA` (user's exact ask — "electric" → "PLASMA" since that's the actual preset name)
- Heading: `<span class="italic">Fluid</span>.` (user wants it generic — about the framework, not this specific preset)
- Body copy: rewrite to explain what svelte-fluid is generally, e.g.: *"A real-time WebGL fluid simulation, dropped in as a Svelte component. One tag for a finished look; eighty-plus props when you want to design your own physics, palette, and motion."*
- "View source" link → still useful, point to `{base}/docs` (general docs, not preset-specific) since the heading is now generic

### Audit all other section copy for similar errors
- Section eyebrows currently: `§ 01` (hero), `§ 02` (Plasma), `§ 03` (Presets), `§ 04` (Shapes), `§ 05` (Sticky), `§ 06` (Distortion). These literary `§` marks may feel affected — **decide whether to keep, simplify (`01 / 06`), or drop entirely.** Recommend: keep, they work as quiet wayfinding. But re-evaluate after other changes.
- Section subheadings (sample audit):
  - "Six stylistic presets. Each fills its parent. Hover any cell to splat." — OK
  - "Six primitives — circle, rounded rect, frame, annulus, SVG path, and text glyph. Hover to splat." — OK
  - "FluidStick masks the simulation with text or SVG paths. Hover to engage." — OK
  - "FluidDistortion warps any source with the velocity field. Hover to engage." — OK
- Verify preset captions in `presetCells` array match the actual component names (no typos)
- Verify shape cell captions (CIRCLE, ROUNDED RECT, FRAME, ANNULUS, SVG PATH, TEXT GLYPH) — confirm they describe what they show
- Footer credit line — confirm it cites Pavel Dobryakov correctly

### Manifest section
Currently 6 lines ("multi-instance / resize-stable / deterministic seeding / MIT licensed / sticky text masks / image distortion"). Re-read once more; tighten if any felt redundant.

---

## Task 2 — Distortion images (one-line change)

In `src/routes/design13/+page.svelte`, the `distortCells` array currently has:
```ts
const distortCells = [
    { seed: 311, src: 'bosch-garden.jpg', strength: 0.3, intensity: 20, scale: 1.0, caption: 'SUBTLE · STRENGTH 0.3' },
    { seed: 322, src: 'hero.webp',       strength: 0.45, intensity: 28, scale: 1.0, caption: 'STRONG · STRENGTH 0.45' }
];
```
**Change:** second cell `src` from `'hero.webp'` → `'bosch-garden.jpg'`. Both cells use the same image; the variance comes from the physics, which is the demo's point.
Same captions are fine.

---

## Task 3 — Add the Playground to design13

This is the largest task. The main page has a working playground at `<section id="playground">` around line 1607 of `src/routes/+page.svelte`.

### Components to reuse (already exist in `src/routes/components/`)
- `ControlPanel.svelte` — the slider/checkbox panel with all physics props. Exports a `D` constant of default values. (~ many lines, complex.)
- `Card.svelte` — preset/example card wrapper. May or may not be needed.
- `ShapePreview.svelte` — small SVG visualizer for container shapes.
- `CopyPageButton.svelte` — copy markdown of the page (probably not needed in design13).

### How the main page uses it
The main page wires up `$state` for every physics prop (curl, splatRadius, etc.), then both the `<Fluid>` canvas and the `<ControlPanel>` read/write the same state. Mode-switching (fluid / reveal / sticky / distortion) snapshots and restores values per ADR-0005's 4-bucket setConfig system.

### What to do in design13
- **Read `src/routes/+page.svelte` lines 29–500 fully** before starting. That's where all the `$state` declarations, mode-switching logic, presets-loading, URL serialization, and hash-deeplinking live.
- **Read `src/routes/components/ControlPanel.svelte`** to know the prop surface.
- Add a new section to design13 at the END (before the manifest, or as a final showcase): a `<section class="playground">` with:
  - Section heading "Try it." (italic on "it") — or "Play."
  - A wide `<Fluid>` canvas (height ~520px, max-width 1100px, hairline border, rounded 12px, dark surface)
  - A `<ControlPanel>` panel either docked to the right (split layout) on desktop or below the canvas on mobile
  - Mode switcher pills at the top (fluid / reveal / sticky / distortion) — match main page UX
  - Preset chip row above the panel: clicking "LavaLamp"/"Plasma"/etc. loads that preset's config into the playground state (use `PRESET_CONFIGS` from `src/routes/components/ControlPanel.svelte` if exported, else mirror the wiring from main page)
- **Decision needed**: Use the heavy main-page playground wholesale (copy the state + effects wiring), OR build a SIMPLIFIED playground showing only the 10–12 most-tweaked props (curl, splatRadius, splatForce, densityDissipation, velocityDissipation, bloom toggle, shading toggle, colorful toggle). Recommend: **simplified version**. The main playground exposes 70+ knobs which is overwhelming for a marketing demo. Group: Physics (curl/splatRadius/splatForce/dissipation), Visuals (bloom/shading/colorful), Background (back color). Skip preset-splat and FBO-rebuild props.
- Add a "Reset" button that resets to `D` defaults.
- Code snippet generator below the panel that shows the current `<Fluid>` invocation with all non-default props inlined — copyable.

### Implementation notes
- The playground `<Fluid>` should NOT be `lazy` (it's the focal point of this section, user will scroll to it expecting it active).
- Performance: the page already has many GL canvases; the playground adds one more. Consider pausing offscreen canvases via the `autoPause` prop (defaults true on most components).
- Wire the mode switcher to `playgroundMode = $state('fluid')` and use `$effect`/`untrack` to apply mode-specific defaults (see main page lines 167–230 for the pattern).

---

## Task 4 — Other missing demos from main page

Audit `src/routes/+page.svelte` for demos NOT yet in design13. Found so far (from this session's scan):

### 4a. "Build with `<Fluid />`" — physics-tweak examples (main page section starting ~L1176)
Multiple side-by-side `<Fluid>` cards showing how different physics props change the look. Examples in main page:
- Default `<Fluid />`
- "Flat + soft": `<Fluid bloom={false} curl={5} densityDissipation={0.4} />`
- "Bold splats": `<Fluid shading={false} splatRadius={0.8} splatForce={9000} />`
- "Sticky persistent": `<Fluid velocityDissipation={0.05} densityDissipation={0.5} transparent />`

**Plan:** Add a 4-cell "Physics" gallery in design13 between the shape gallery and the sticky gallery, with these four examples. Each cell: ~280px tall, the `<Fluid>` config, a tiny mono code snippet below showing the variant invocation. This demonstrates the prop surface without overwhelming the user with the full ControlPanel.

### 4b. Glass refraction demos (main page L1284 — "Container effects")
The `glass` prop on `<Fluid>` adds a lens. Variants shown in main page:
- `<Fluid glass glassRefraction={0.7} glassChromatic={0.5} ... />`
- `<Fluid glass glassRefraction={0.25} glassChromatic={0.1} ... />`
- `<Fluid glass glassThickness={0.05} glassRefraction={0.6} glassChromatic={0.7} ... />`
- `<Fluid glass glassThickness={0.06} glassRefraction={0.5} glassChromatic={0.4} ... />`

**Plan:** Add a "Glass" section showing 2–4 glass variants. Each cell needs a `containerShape` (per CLAUDE.md: glass requires container). 2-column grid, ~360px cells. Reuse `<LavaLamp />` for one (already uses glass), then add custom `<Fluid glass ...>` variants for others.

### 4c. FluidReveal section (main page L1407)
The `<FluidReveal>` component uses the simulation as an OPACITY MASK — cursor movement reveals content behind a fluid cover. NOT YET demoed in design13.

Variants in main page:
- "Scratch to reveal": gradient revealed, fadeBack
- "Pinned ribbons": `fadeBack={false}` — permanent reveals
- "Auto-reveal": `autoReveal autoRevealSpeed={0.8}` — animates revealing

**Plan:** Add a "Reveal" section between sticky and distortion (or anywhere that makes sense). 2-cell gallery: one "scratch to reveal" (gradient revealed by hover), one "auto-reveal" (animates). Use the gradient pattern from the main page snippet (`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`). Cells ~360px tall.

### 4d. Transparent fluid demo
The `transparent` prop renders the bg as transparent (showing the CSS parent through). Mentioned in main page snippet at L835. Worth a tiny cell or sidebar to call out.

### 4e. Coverage map after additions
After adding 4a, 4b, 4c, 4d, design13 will demo:
- `<Fluid />` (base, hero title via FluidText, playground, "Build with" gallery)
- `<FluidBackground />` (hero)
- `<FluidText />` (hero title)
- `<FluidStick />` (sticky gallery)
- `<FluidDistortion />` (distortion gallery)
- `<FluidReveal />` (reveal gallery — NEW)
- All 6 stylistic presets
- All 4 shape preset wrappers + raw `<Fluid containerShape>` for rounded rect + svgPath + textGlyph
- `glass` prop variants (NEW)
- `transparent` prop (NEW, small)
- Physics tweak variants (NEW)

This is comprehensive — matches/exceeds the main page's demo coverage with a tighter editorial layout.

---

## Task 5 — Polish pass (after content is complete)

### Hero
- The hero FluidBackground is now very quiet (no auto-splats, only `initialSplatCount=15`). Verify it doesn't feel dead. Options if it does: bump `initialSplatCount` to 25–30, bump `splatForce` slightly, or add a single autoSplat at t=0–2s only.
- The FluidText title auto-splat rate is 0.5/sec per letter (5 letters × 0.5 = 2.5 splats/sec across the title). Verify this feels alive without being frantic.
- CTAs: currently "Read the docs" + "GitHub". Consider whether two is right. Recommend: keep two — primary action + escape hatch.
- Scroll-down chevron at bottom of hero — verify it animates well and serves a purpose.

### Section eyebrows
- `§ 01`, `§ 02`, etc. — re-evaluate after content lands. They may now feel decorative noise.
- Alternative: drop the `§` glyph, use just "01" "02" or section name caps ("INSTALL", "PRESETS", etc.).

### Typography
- Italic-serif emphasis on single words (e.g. *Presets*, *any shape*, *letterforms*) — used 6+ times. Verify it doesn't feel gimmicky after the changes. May want to reduce frequency.

### Performance
- Total GL contexts after adding playground + 4 physics tweaks + 4 glass + 2 reveal = current ~14 + ~10 = ~24 GL contexts on the page. Verify `lazy` on everything below the hero.
- Test on a mid-tier laptop (Intel UHD, M1 base). If GPU melts, reduce simultaneous-on canvases by adding `IntersectionObserver`-based pause/resume via the `handle.pause()` / `handle.resume()` API.

### Mobile
- Verify breakpoints: 3-col grids → 2-col at <960px → 1-col at <640px.
- Shape grid (3×2 square cells) → 2-col at <720px, never 1-col.
- Playground panel should stack below canvas on mobile.

### Accessibility
- Verify `prefers-reduced-motion` still gates new sections (playground, reveal, glass, physics tweaks).
- Add `aria-label` to every new `<Fluid>` instance.
- Verify color contrast on muted text reads against the dark surfaces.

---

## Implementation order (recommend)

1. **Language audit** (Task 1) — small, low risk, high clarity. Do it in 10 minutes.
2. **Distortion image swap** (Task 2) — one line. Do it in 30 seconds.
3. **Survey** — read `src/routes/+page.svelte` lines 1176–1605 fully to extract exact configs for the "Build with", Glass, and Reveal sections.
4. **Read** `src/routes/components/ControlPanel.svelte` to understand the prop surface.
5. **Add Physics tweak section** (Task 4a) — small win, validates the new-section pattern in design13's CSS.
6. **Add Glass section** (Task 4b).
7. **Add Reveal section** (Task 4c).
8. **Add Playground section** (Task 3) — biggest task. Use simplified panel.
9. **Polish pass** (Task 5).
10. **Final verification**: `bun run check && bun run test`, visual QA, mobile QA.
11. **Decide on ADR**: write one for the splatOnHover prop addition? Recommend yes — short ADR titled "Expose splatOnHover on stylistic preset wrappers" in `dev-docs/decisions/`.

---

## Files to read first next session (in order)
1. `.launch-drafts/design13-next-session-plan.md` ← this file
2. `src/routes/design13/+page.svelte` (full — 1480 lines)
3. `src/routes/+page.svelte` lines 29–500 (state wiring) and 1176–1900 (target sections to port)
4. `src/routes/components/ControlPanel.svelte` (full)
5. `src/lib/FluidReveal.svelte` (for prop reference — not modified yet)
6. `src/lib/engine/types.ts` 250–300 (glass props on FluidConfig)

---

## Hard constraints (per CLAUDE.md and user)
- Svelte 5 runes only.
- `.js` extensions on `$lib` imports.
- Tabs.
- No filler comments.
- `bun run check && bun run test` must pass at the end.
- `bun run prepack` before any commit.
- DO NOT modify engine files (`src/lib/engine/`). Wrapper changes OK with consideration.
- The 6 stylistic preset wrappers were already modified this session to expose `splatOnHover` — that's the only library change so far. Any further library changes need user sign-off.

## What NOT to do
- Don't replace any of design14/15 (the sticky-title variants). User chose FluidText. They stay as archives.
- Don't delete designs 1–12. They're useful reference.
- Don't add new dependencies.
- Don't add a theme toggle (light/dark) unless explicitly asked — the dark cinematic feel is the chosen direction.
- Don't refactor the FluidBackground performance defaults — those override at the call-site level (see design14/15 for the pattern with sticky physics).

---

## Quick-reference: API surface used in design13

### Components
| Component | Where | Notes |
|---|---|---|
| `Fluid` | base, used in shape cells, playground, Build-with cells | full prop surface |
| `FluidBackground` | hero | `exclude` / `excludeRadius` for card holes |
| `FluidText` | hero title | per-letter canvases |
| `FluidStick` | sticky gallery | `text` / `font` / `autoAnimate` / `autoAnimateDuration` |
| `FluidDistortion` | distortion gallery | `src` / `strength` / `intensity` / `scale` — cap strength ≤ 0.45 |
| `FluidReveal` | NOT YET — add next session | `fadeBack` / `autoReveal` / `autoRevealSpeed` |
| Shape wrappers | shape gallery | `CircularFluid`, `FrameFluid`, `AnnularFluid`, `SvgPathFluid` |
| Stylistic presets | preset gallery | `LavaLamp`, `Plasma`, `InkInWater`, `FrozenSwirl`, `Aurora`, `ToroidalTempest` — all now expose `splatOnHover` |

### Static assets
- `${base}/bosch-garden.jpg`
- `${base}/hero.webp` (use only if needed; user wants distortion to use bosch)

### Key invariants
- Glass requires a `containerShape` (CLAUDE.md note)
- `FluidBackground` defaults to low resolution; override `simResolution=128 dyeResolution=1024 pressureIterations=20 bloomIterations=8` when using sticky physics
- ContainerShape uses NDC (0–1). Circles render as ellipses in non-square containers — keep shape cells `aspect-ratio: 1 / 1`

---

## Session output verification checklist (run at end of next session)

- [ ] `bun run check` → 0 errors
- [ ] `bun run test` → 276/276 pass (or higher if new tests added)
- [ ] `bun run prepack` → publint passes
- [ ] Visual: `/design13` renders all new sections
- [ ] Visual: playground responds to slider changes in real time
- [ ] Visual: reveal section works on hover
- [ ] Visual: glass section shows refraction edge highlights
- [ ] Mobile (DevTools 375px): no horizontal scroll, all grids collapse correctly
- [ ] Distortion: both cells show bosch-garden image
- [ ] Hero: only "Svelte 5" eyebrow, no "WebGL"/"MIT"
- [ ] Plasma section: heading reads "Fluid.", eyebrow has "PLASMA" (not "electric")
- [ ] No `autoSplatRate` on FluidBackground (still — don't reintroduce)
- [ ] All new `<Fluid>` instances have `splatOnHover`, `aria-label`, and either `lazy` (below fold) or not (above fold)
- [ ] `prefers-reduced-motion` gating applied to new sections

If the user has additional asks during the next session, append them to a fresh draft and address them after these tasks.

— end of handoff —
