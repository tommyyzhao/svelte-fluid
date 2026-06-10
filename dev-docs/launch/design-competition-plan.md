# Design Competition — Next-Session Plan

> **READ THIS FIRST.** This plan documents the next round of `/design*`
> work for svelte-fluid: flesh out designs 1–12, 14, 15 to full demo
> coverage (matching `/design13`) while preserving each design's
> distinct voice, and add a `/design-competition` index route titled
> "TZ's Fluid Design Competition" that links to every candidate.
>
> A future Claude reading **only this file** plus the project's
> `CLAUDE.md` and `dev-docs/architecture.md` should be able to start
> work immediately.

---

## TL;DR

1. **Goal:** Bring designs 1–12, 14, 15 from "hero + presets + install"
   to "every demo /design13 has", styled in each design's own voice.
2. **New route:** `/design-competition` with title "TZ's Fluid Design
   Competition" — a hub linking to all 16 candidates (the promoted
   main page + design1–12 + design14–15, plus a link back to the
   original `/design13`-equivalent if applicable).
3. **Coverage spec:** Every design must include 11 demo sections
   (see Section 3 below). Total ~24–30 fluid instances per design,
   gated through `lazy` + `autoPause` + `prefers-reduced-motion`.
4. **Performance budget:** Per-page only one design renders at a time,
   so the absolute upper bound is fine. The competition route uses
   tiny live preview canvases (or static screenshots) lazily.
5. **Order of attack:** Hardest first (designs 14, 15 — already most
   complete but have known rendering issues), then by visual variety.
6. **Constraint:** Engine and `src/lib/` are off-limits unless an ADR
   demands a change. Demo route work only.
7. **End state:** Each design route renders all demos correctly, every
   route on `/design-competition` opens its target, `bun run test`
   and `bun run check` both pass, no new dependencies.

---

## 1. Inventory of existing designs

The previous session built `/design13` as the chosen redesign candidate.
It's already committed and (pending the user's go-ahead) will be
promoted to `src/routes/+page.svelte`. The other 14 design routes are
local-only exploration artifacts. Each has a distinct visual voice
and varying levels of completeness.

| # | Lines | Voice | Hero | Presets | Shapes | Phys | Glass | Stick | Reveal | Distort | Pgrnd | Notes |
|---|------:|-------|:----:|:-------:|:------:|:----:|:-----:|:-----:|:------:|:-------:|:-----:|-------|
|  1 |   513 | Corporate bento, taupe (#fbf5ee), Apple voice | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Bento grid spans |
|  2 |   638 | Editorial print, serif + monospace, light paper | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Numbered serif heads, rules |
|  3 |   640 | Dark glass-morphism, iridescent rims, navy | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Backdrop-blur, float anims |
|  4 |   871 | SaaS dashboard, dark + gradient accents | ✓ | ✓ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | CSS vendor warning L629 |
|  5 |   684 | Warm pastel, Instrument Serif italics | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Animated checkmarks |
|  6 |   664 | Terminal/CLI, monospace, Unicode borders | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | "§ XX" gutter markers |
|  7 |   795 | Scroll-snap magazine, split sections | ✓ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | scroll-snap-type: y mandatory |
|  8 |  1155 | Modern tech (Vercel/Next), auto-theme | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | prefers-color-scheme support |
|  9 |   638 | Dark minimal bento, warm yellow accent | ✓ | ✓ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | Aggressive hero physics |
| 10 |   677 | High-contrast light, gradient nav pill | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | "v0.2.2 — now on npm" |
| 11 |   844 | Dark editorial, orange (#ffb84d) accent | ✓ | ✓ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | 40/60 split hero, serif numerals |
| 12 |  1100 | Reveal-on-scroll, featured splits + bleed | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | IntersectionObserver reveals |
| 14 |  1379 | Full showcase, dark tech, hi-res sticky | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ? | ✓ | ? | **Known hi-res/sticky issue** |
| 15 |  1253 | Reveal + featured-section showcase | ✓ | ✓ | ✓ | ? | ? | ✓ | ✓ | ✓ | ? | **Known hi-res/sticky issue** |

`◐` = partial; `?` = imports suggest yes but file truncated in survey.

### Reference: `/design13` (committed, promoted candidate)
Section list:
1. Nav bar
2. Hero — `FluidBackground` + `FluidText "FLUID"`
3. § 01 Install — bun/npm/pnpm/yarn tabs + copy
4. § 02 Featured Plasma — full-bleed `Plasma` with framework-level body copy
5. § 03 Presets — 6 stylistic preset wrappers in editorial grid
6. § 04 Shapes — 6 shape primitives (Circle/RoundedRect/Frame/Annulus/SvgPath/TextGlyph)
7. § 05 Build — 4 `<Fluid />` physics-tweak cells (default/flat+soft/bold splats/slow+transparent)
8. § 06 Glass — 4 glass refraction cells (Crystal Orb/Soft Lens/Portal Ring/Glass Frame)
9. § 07 Sticky — 2 FluidStick cells (Geist 900 + Georgia ∞)
10. § 08 Reveal — 2 FluidReveal cells (scratch + auto-reveal)
11. § 09 Distort — 2 FluidDistortion cells with bosch-garden.jpg
12. § 10 Try it — interactive playground with 6 preset chips, 9 knobs, snippet gen
13. § 11 Manifest — closing copy
14. Footer — Pavel Dobryakov credit

This is the **canonical coverage spec**. Every design in this round
must render the same set, in the design's own voice.

---

## 2. Voice-preservation principles

Each design has a distinct identity. The fleshing-out work MUST keep
these visual signatures intact. Do **not** unify them on `/design13`'s
layout.

- **Typography stays.** Don't replace a design's font stack.
- **Color palette stays.** Don't change a design's background, accent,
  or text colors. (Exception: if a section's content is unreadable on
  the design's bg, add a section-level scrim consistent with that
  design's existing card-bg treatment.)
- **Section idiom stays.** Match the design's existing section header
  treatment (e.g., design6 uses "§ XX" gutter markers; design11 uses
  big serif numerals; design2 uses serif numbers with rules above).
- **Grid system stays.** A bento design adds bento cells; a scroll-snap
  design adds new snap sections; an editorial design adds a new
  numbered chapter.
- **Copy voice stays.** Each design has a distinct tone in its eyebrows
  and headings. Match it. Don't paste `/design13`'s copy verbatim.

### Adaptation examples

- **Design 6 (terminal CLI):** Glass refraction section becomes
  `╭─ refract ──────────╮` with the 4 glass cells shown as terminal
  panes; sticky section uses `[stick] FLUID > .text`-style prompts.
- **Design 2 (editorial print):** Glass becomes "REFRACTION — A
  FOOTNOTE" with big serif "06" numeral and 2px ink rule. Sticky
  becomes "LETTERFORMS — A STUDY".
- **Design 5 (warm pastel):** Glass cells get pastel-tinted backColors
  (`{ r: 24, g: 16, b: 28 }` for plums, etc.) and `bloom` on. Reveal
  cells use the design's existing pastel gradients (lavender, sage,
  pink).
- **Design 11 (dark editorial w/ orange):** Each new section gets a
  `§ XX.YY` cell-label treatment matching the existing preset gallery.
  The orange accent (#ffb84d) appears on hover states and active
  preset chips.

---

## 3. Coverage spec (the mandatory checklist)

Every design must render these 11 demo sections. Section order can
follow the design's existing rhythm; section names/eyebrows should
match the design's voice.

| # | Section | What it demos | Min instances |
|---|---------|---------------|--------------:|
| 1 | Hero | `FluidBackground` or `FluidText` focal point | 1–2 |
| 2 | Install | Code tabs, no Fluid required | 0 |
| 3 | Stylistic presets | All 6 wrappers: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest | 6 |
| 4 | Shape primitives | Circle, RoundedRect, Frame, Annulus, SvgPath (lightning), TextGlyph | 6 |
| 5 | Build with `<Fluid />` | Default, Flat+soft, Bold splats, Slow+transparent | 4 |
| 6 | Glass refraction | Crystal Orb (circle), Soft Lens (circle), Portal Ring (annulus), Glass Frame (frame) | 4 |
| 7 | Sticky text | FluidStick × 2 with different fonts (e.g., Geist 900 + Georgia ∞) | 2 |
| 8 | Reveal | FluidReveal × 2: scratch-to-reveal + auto-reveal | 2 |
| 9 | Distortion | FluidDistortion × 2 using bosch-garden.jpg (different strengths) | 2 |
| 10 | Playground | Simplified ControlPanel: 9 knobs + 6 preset chips + snippet generator | 1 |
| 11 | Manifest + footer | Closing copy, Pavel Dobryakov credit | 0 |

**Per-design fluid-instance count:** ~24 (6 stylistic + 6 shapes + 4
physics + 4 glass + 2 sticky + 2 reveal + 2 distortion + 1 playground +
hero variants). All non-hero instances must be `lazy`. All must have
`aria-label`. All auto-animations gated through a `reducedMotion` flag.

### Mandatory props on every demo `<Fluid>`-like
- `aria-label="…"` — short descriptive label
- `lazy` — except hero
- `splatOnHover` — on every interactive demo cell
- `autoSplatRate={stickyAutoAnimate ? X : 0}` — gate auto-animations
  through `prefers-reduced-motion` (same pattern as `/design13`)

### Reusable code patterns to copy from `/design13`

| Pattern | Where in `/design13` |
|---------|---------------------|
| `reducedMotion` + `stickyAutoAnimate` derived flag | `src/routes/design13/+page.svelte` script top |
| Preset cells array (`presetCells`) | script top |
| Sticky cells array (`stickyCells`) | script top |
| Distortion cells array (`distortCells`) | script top |
| Playground state + PLAYGROUND_PRESETS + applyPreset/resetPlayground | script top |
| Section scrim CSS pattern | look for `section.reveal { z-index: 1; background-color: rgba(8,8,12,0.86) }` |
| `<FluidBackground>` quiet config | hero section |
| FluidStick tuned config (no bloom, dD=0.92, sR=0.18, autoAnimDur=4) | sticky section |
| Glass exact configs (4 variants) | glass section |
| Reveal exact configs (2 cells) | reveal section |

---

## 4. Per-design execution notes

Rough work estimates assume one engineer-day per design when adding all
missing sections in the design's own voice. Pair-design groups can
share planning passes (e.g., designs 1 + 9 are both bento grids).

### Design 1 — Corporate bento (taupe)
- **Add:** shapes, physics, glass, sticky, reveal, distortion, playground
- **Voice cue:** new cells become bento tiles; rounded corners
  (~16px); subtle shadows; mono UI labels.
- **Section header style:** lowercase "shapes", "glass", "playground"
  with eyebrow caps.
- **Risk:** taupe bg makes glass refraction subtle. Consider darker
  card-bg for glass cells so the refraction reads.

### Design 2 — Editorial print
- **Add:** all 8 missing sections.
- **Voice cue:** big serif numerals (06, 07, 08…), 2px ink rules above
  each section, narrow body column on right, full-bleed canvas on
  left where possible.
- **Section header style:** `06. REFRACTION — A FOOTNOTE`
- **Risk:** light paper bg (#f5f1ea) — glass and sticky physics need
  darker container shapes to be visible. Use `backColor={{ r: 12, …}}`
  inside cells to create dark wells.

### Design 3 — Dark glass morphism
- **Add:** shapes, physics, glass, sticky, reveal, distortion, playground
- **Voice cue:** every new section is a glass card with iridescent
  ::before rim. Cards float-animate on stagger (existing pattern).
- **Section header style:** uppercase + tracked, no numbers.
- **Risk:** lots of backdrop-blur with ~24 fluid canvases = heavy.
  Verify perf on mid-tier hardware before signing off.

### Design 4 — SaaS dashboard
- **Add:** shapes, glass, sticky, reveal, distortion, playground
- **Voice cue:** gradient-mask card borders (existing pattern at
  `src/routes/design4/+page.svelte:629` — fix the vendor-prefix warn
  while you're there: add `mask:` standard property).
- **Section header style:** `Shapes` with subtle gradient underline,
  SVG icon prefix.
- **Risk:** auto-theme support — every new section must work in BOTH
  light and dark via the existing CSS variables.

### Design 5 — Warm pastel + serif
- **Add:** all 8 missing sections.
- **Voice cue:** Instrument Serif italics on section heads ("*Shapes*",
  "*Refract*"), pastel gradient panels (lavender/sage/pink) for
  alternating sections, animated checkmark reveals when scrolled in.
- **Risk:** light bg + colorful fluid = high contrast can clash.
  Lower bloom; consider explicit `colorful={false}` with hand-picked
  palettes on some cells.

### Design 6 — Terminal CLI
- **Add:** all 8 missing sections.
- **Voice cue:** every new section is a "terminal pane" with traffic-
  light dots, monospace label, Unicode-bordered content. Glass cells
  become `╭─ glass.tsx ───╮` panes. Playground becomes a "REPL".
- **Section header style:** `§ 07 ── shapes` with `─`-extended rule.
- **Risk:** the CLI conceit is fragile; new sections must feel like
  natural extensions of the existing terminal idiom, not bolted-on.
  Suggest reusing the existing `.terminal-pane` class.

### Design 7 — Scroll-snap magazine
- **Add:** complete the existing preset set (currently has 4/6),
  then all 8 other missing sections.
- **Voice cue:** every new section is a scroll-snap section (`.snap`,
  `scroll-snap-stop: always`). Split layouts (canvas left, text right)
  alternating. Cream text on warm/navy/white backgrounds.
- **Section header style:** Playfair Display italic, huge clamp().
- **Risk:** scroll-snap with 11 sections × ~24 canvases is heavy on
  scroll perf. Lazy is mandatory; consider `autoPause` for sections
  outside the snap window. Add an end-of-deck "back to top" affordance.

### Design 8 — Modern tech (Vercel/Next)
- **Add:** shapes, physics, glass, sticky, reveal, distortion, playground
- **Voice cue:** feature cards with SVG icon prefix, gradient borders,
  4-column responsive grids. Auto-theme via CSS variables.
- **Section header style:** title + one-line description.
- **Risk:** auto-theme must work for every new section.

### Design 9 — Dark minimal bento (warm yellow)
- **Add:** all 8 missing sections.
- **Voice cue:** new cells slot into the existing bento (6-col grid).
  Yellow #fff8e7 accent appears in hover states and active chips.
- **Section header style:** monospace labels, lowercase.
- **Risk:** aggressive hero physics (`velocityDissipation 1.4`,
  `autoSplatRate 6`) feel intentional — leave alone. New sections use
  /design13's calmer config.

### Design 10 — High-contrast light + gradient pill nav
- **Add:** shapes, physics, glass, sticky, reveal, distortion, playground
- **Voice cue:** every new card has crisp 1px border, white bg, SVG
  icon, code-snippet-on-hover treatment matching existing preset cells.
- **Risk:** light bg → glass/sticky physics need dark inner cells.

### Design 11 — Dark editorial + orange
- **Add:** all 8 missing sections.
- **Voice cue:** `§ XX.YY` cell labels (`§ 06.01 Crystal orb`,
  `§ 06.02 Soft lens`), serif h2s with the orange accent on
  hover/active. 40/60 splits where the rhythm fits; full-bleed
  alternating with split for variety.
- **Section header style:** big serif numeral + serif h2 below.
- **Risk:** dark bg already established — leverage rather than fight.

### Design 12 — Reveal-on-scroll + featured splits
- **Add:** shapes, physics, glass, distortion, playground (already has
  sticky via featured Aurora)
- **Voice cue:** every new section is a `.reveal` IntersectionObserver
  candidate; fades up on scroll-in. Some featured sections (Glass?)
  could be full-bleed alternating with the existing card grid.
- **Risk:** IntersectionObserver chains can mis-fire if too many
  observers — consider consolidating into one observer with multiple
  targets (already the existing pattern).

### Design 14 — Full showcase (existing — DEBUG mode)
- **State:** already imports shapes, glass, sticky, distortion, reveal.
  Already attempts most demos.
- **Known issue (per session-13 handoff):** "FluidBackground +
  sticky high-res variant" with rendering issues. The
  `FluidBackground` defaults to low resolution; when combined with
  sticky physics, the overall scene gets blurry. Fix is to override
  back to `simResolution=128 dyeResolution=1024 pressureIterations=20
  bloomIterations=8` AND bump `stickyMask.maskResolution: 1024,
  blur: 2`.
- **Approach:** read the file end-to-end; identify what's working,
  what's broken; fix sticky+bg conflict; add missing playground if
  not present; complete the coverage spec.

### Design 15 — Reveal + featured-section showcase
- **State:** very close to /design13 but in a different layout
  rhythm. Per survey: featured Aurora/LavaLamp/Plasma splits + card
  grid for others. Reveal animations already wired.
- **Known issue:** same "FluidBackground + sticky high-res" issue
  as design14.
- **Approach:** same as design14. Resolve the sticky+bg issue, fill
  any coverage gaps.

---

## 5. `/design-competition` route spec

**Title:** TZ's Fluid Design Competition
**Path:** `src/routes/design-competition/+page.svelte`
**Purpose:** A single entry point linking to every candidate so the
user (TZ) can compare them side-by-side and pick favorites.

### Layout options (pick one — prototype in this session)

**Option A — Card grid with mini live preview** (recommended)
- 16 cards (the promoted main page + designs 1–12, 14, 15), 4×4 on
  desktop, 2×8 on tablet, 1×16 on mobile.
- Each card: tiny `<Fluid>` instance (or preset wrapper) sized
  ~280×180, the design's name, a one-line aesthetic descriptor, and
  a "→ Open" link to the route.
- All preview canvases `lazy={true}` and `autoPause={true}` so only
  visible cards run.
- Single page; no nav bar (each card visually quotes its design).

**Option B — Static-screenshot grid** (lower-effort, less alive)
- Same grid but each card uses a `.webp` screenshot baked at build
  time. No live previews. Cards still link to the routes.
- Pro: zero GL contexts on the index page.
- Con: requires regenerating screenshots whenever a design changes.

**Option C — List view with sticky preview pane** (richer)
- Left rail: list of 16 designs with name + aesthetic. Right pane:
  iframe or live `<Fluid>`-driven preview of the currently-hovered
  design. Like a Figma file picker.
- Higher dev cost; consider for v2.

### Mandatory features
- **Title** at the top: "TZ's Fluid Design Competition" in a typeface
  matching the project's editorial direction (Geist for ui, Instrument
  Serif italics on key words).
- **Subtitle:** ~1 sentence on the project ("Sixteen redesign passes
  of the svelte-fluid main page. Pick your favorite.").
- **No nav bar** — this is a hub page, not a child of `/`.
- **Each card** must show: design number/name, one-line descriptor,
  open link.
- **Accessibility:** every preview canvas has `aria-label`; every
  open link has descriptive text. Cards are keyboard-navigable.
- **`prefers-reduced-motion`:** suppress preview animations entirely
  when set; show a static representative color/screenshot per card.

### Card descriptors (suggested copy)
| Route | Card name | Descriptor |
|-------|-----------|-----------|
| `/` (or `/design13`) | The Winner — design13 | Cinematic dark, italic-serif emphasis |
| `/design1` | Corporate Bento | Taupe minimal, rounded card grid |
| `/design2` | Editorial Print | Serif numerals, monospace UI, paper bg |
| `/design3` | Glass Morphism | Dark navy, iridescent rims, float anims |
| `/design4` | Modern SaaS | Dashboard grids, gradient accents |
| `/design5` | Warm Pastel | Instrument Serif italics, soft gradients |
| `/design6` | Terminal CLI | Monospace, Unicode borders, blink cursor |
| `/design7` | Scroll-Snap Magazine | Split sections, large serif heads |
| `/design8` | Vercel-Adjacent | Auto-theme, gradient borders, SVG icons |
| `/design9` | Dark Bento + Warm | Compact grid, yellow accent |
| `/design10` | High-Contrast Light | Gradient pill nav, crisp UI |
| `/design11` | Editorial Dark Orange | Serif numerals, split grids, orange accent |
| `/design12` | Reveal on Scroll | Featured splits, IntersectionObserver |
| `/design14` | Full Showcase | Comprehensive, hi-res variant |
| `/design15` | Reveal + Featured | Mixed layouts, scroll-driven anims |

(Adjust card names + descriptors after the redesigns land — pick what
each design's voice has settled into.)

### Add a back-link from each design route
Each `/design*` route gets a small floating "← Competition" link
(fixed top-left) so the user can jump back to the hub without using
browser-back.

---

## 6. Execution order

### Phase 0 — Decisions before execution (you, the user)
1. Confirm `/design13` is promoted to `/+page.svelte`.
2. Decide: live-preview vs static-screenshot for `/design-competition`
   (Option A vs B above).
3. Decide: do designs 14, 15 keep their identity, or merge into
   `/design13`'s "full showcase" niche and get deleted? (Survey says
   they ALREADY have the most coverage — fixing them first is
   leverage.)

### Phase 1 — Plumbing (1 short session)
1. Create `/design-competition` route stub.
2. Stub all 14 design routes' missing sections with placeholder
   `<div>Section coming soon</div>` blocks so navigation works.
3. Add the "← Competition" floating link to each route.

### Phase 2 — Easy wins (parallel-isable)
Run in parallel via worktrees if you have the capacity. Each design is
independent.

Order by complexity-to-impact:
1. **Designs 14, 15** — already most complete; fix the hi-res
   sticky issue + fill gaps. Big payoff, modest effort.
2. **Designs 2, 6, 11** — distinct voices, modest existing coverage.
   Fleshing out is "add 8 sections, each in the design's idiom."
3. **Designs 1, 9, 10** — clean grids, simpler aesthetic. Mostly
   pattern-replication from /design13.
4. **Designs 3, 5, 8, 12** — heavier on animations; need careful
   `lazy` + `autoPause` audit.
5. **Designs 4, 7** — most idiosyncratic (gradient masks, scroll-
   snap). Save for when the patterns are well-rehearsed.

### Phase 3 — Polish + competition route final
1. Replace `/design-competition` stub placeholders with live previews
   or screenshots.
2. Compose final card copy.
3. Add `prefers-reduced-motion` gating + a11y audit.
4. Performance sweep: each route under 60fps on M1 base.

### Phase 4 — Verification + cleanup
1. `bun run test && bun run check && bun run prepack` → green.
2. Visit every `/design*` route in dev; confirm all 11 sections
   render and engines warm up.
3. Visit `/design-competition`; confirm all 16 cards link correctly.
4. Mobile QA at 375/425/768px in DevTools.
5. Commit per-design or batched (suggest one commit per design for
   review readability).

---

## 7. Risks + guardrails

### Performance
- ~24 fluid instances per design route = ~24 WebGL contexts.
- `lazy={true}` on every below-fold instance prevents engine creation
  until viewport entry.
- `autoPause={true}` (default on most components) pauses rendering
  when offscreen — keep on.
- **Hard ceiling:** total simultaneously-running engines on any page
  should be ≤ 8 at any given scroll position. Audit by inspecting
  what's in viewport at typical scroll depths.

### Visual collision
- Lots of FluidBackground-style full-viewport bgs can conflict with
  section content. Pattern from /design13: section-level scrim
  (`section.reveal { z-index: 1; background-color: rgba(8,8,12,0.86) }`).
  Adapt color/opacity to each design's palette.

### Voice drift
- Easy to slide into /design13's editorial idiom as you write more
  sections. Resist. Re-read the design's existing CSS before each new
  section.
- Keep a tally of "voice deviations" in the per-design commit message
  if you make conscious changes — easier to audit later.

### Engine + library off-limits
- No changes to `src/lib/engine/`, `src/lib/Fluid.svelte`,
  `src/lib/Fluid*.svelte`, or any preset wrapper.
- Exception: if a missing feature blocks a demo (e.g., wrapper doesn't
  expose a needed prop), write an ADR per project conventions.

### `prefers-reduced-motion`
- Every new auto-animation MUST gate through the reducedMotion flag
  (existing pattern). No exceptions.

### Mobile
- Every grid MUST collapse correctly at 960 / 720 / 640 / 480px.
- No horizontal scrollbars at 375px.
- Touch targets ≥ 44×44.

### Tests + check
- `bun run test` must stay 276/276.
- `bun run check` must stay 0 errors. The 1 pre-existing warning in
  design4:629 should be FIXED in the design4 pass.

---

## 8. Verification checklist (run at end of each design + final)

Per design:
- [ ] All 11 coverage sections present
- [ ] All non-hero `<Fluid>`-likes have `lazy`
- [ ] All have `aria-label`
- [ ] All auto-animations gated through `reducedMotion`
- [ ] Section content readable above any bg fluid
- [ ] Mobile breakpoints work at 960/720/640/480
- [ ] No horizontal scroll at 375px
- [ ] `bun run check` → 0 errors for that file
- [ ] Visual QA in browser: every section renders, no broken cells
- [ ] Floating "← Competition" link present and works

For `/design-competition`:
- [ ] Title reads "TZ's Fluid Design Competition"
- [ ] 16 cards, all link to correct routes
- [ ] Each card has descriptor copy
- [ ] Live previews are `lazy={true}` (or static screenshots)
- [ ] `prefers-reduced-motion` suppresses preview animations
- [ ] Mobile layout collapses correctly

Final session checklist:
- [ ] `bun run test && bun run check && bun run prepack` all green
- [ ] All 16 routes visit-tested in browser
- [ ] No engine/library changes
- [ ] Commits split per-design for review readability
- [ ] Handoff updated with the new state

---

## 9. Glossary of patterns & code snippets to reuse from `/design13`

Quick-reference snippets. Read the actual file for context before
copying.

**Reduced-motion derived flags (script top):**
```ts
let reducedMotion = $state(false);
$effect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
});
const stickyAutoAnimate = $derived(!reducedMotion);
const titleAutoSplatRate = $derived(reducedMotion ? 0 : 0.5);
```

**FluidStick tuned config (from /design13 commit 05a9f88):**
```svelte
<FluidStick
    text={s.text}
    font={s.font}
    seed={s.seed}
    autoAnimate={stickyAutoAnimate}
    autoAnimateDuration={4}
    colorful
    shading
    bloom={false}
    densityDissipation={0.92}
    splatRadius={0.18}
    lazy
/>
```

**Section scrim CSS:**
```css
section.reveal {
    position: relative;
    z-index: 1;
    background-color: rgba(8, 8, 12, 0.86);
}
```
(Tune the rgba to match each design's palette — see "Voice
adaptation" notes for design2's lighter, design5's pastel, etc.)

**Hero FluidBackground tuned config:**
```svelte
<FluidBackground
    seed={2026}
    colorful
    shading
    bloom
    bloomIntensity={0.3}
    sunrays={false}
    densityDissipation={0.96}
    velocityDissipation={0.55}
    curl={36}
    splatRadius={0.18}
    splatForce={5000}
    initialSplatCount={28}
    exclude=".card, .nav-bar, .footer-bar"
    excludeRadius={20}
/>
```

**Glass cell example (Crystal Orb):**
```svelte
<Fluid
    seed={1111} lazy glass
    glassRefraction={0.7}
    glassReflectivity={0.15}
    glassChromatic={0.5}
    glassThickness={0.08}
    containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
    backColor={{ r: 4, g: 2, b: 12 }}
    curl={35}
    densityDissipation={0.15}
    velocityDissipation={0.06}
    splatRadius={0.38}
    splatForce={5000}
    shading bloom sunrays={false}
    initialSplatCount={12}
    autoSplatRate={stickyAutoAnimate ? 1.2 : 0}
    autoSplatCenterY={0.5}
    autoSplatBandHeight={0.8}
    autoSplatSwirl={500}
    splatOnHover
    aria-label="Crystal orb effect demo"
/>
```

**Playground state pattern (script top):**
- `PLAYGROUND_DEFAULTS` constant (9 fields)
- `PLAYGROUND_PRESETS` constant (6 stylistic preset partials)
- `pgCurl / pgSplatRadius / pgSplatForce / pgDensityDissipation /
  pgVelocityDissipation / pgBloom / pgShading / pgColorful /
  pgBackColor` $states
- `applyPreset(name)` + `resetPlayground()` helpers
- `playgroundSnippet` $derived.by — generates `<Fluid …/>` string with
  only non-default props

Read /design13's script top to see the full implementation.

---

## 10. Open questions for the user before starting

1. **/design13 promotion to `/+page.svelte`** — do this BEFORE the
   competition round, or after? (Recommendation: before. The
   competition route should link to `/` as "the winner".)
2. **Static screenshots vs live previews on `/design-competition`?**
   Option A is more "alive" but heavier. Option B is cheaper but
   needs a screenshot pipeline.
3. **Design14 + Design15 — keep or merge?** They're already 80%
   complete and similar to /design13. If they pass the
   voice-distinctness test for you, fix them. If not, delete.
4. **Single competition winner, or just side-by-side comparison?**
   The title implies a winner gets chosen. Is `/design13`
   self-evidently the winner, or will a new one emerge?
5. **Coverage tolerance:** must every design have every section, or
   can a design (e.g., terminal CLI design6) skip glass refraction
   if the conceit doesn't fit? (Recommendation: every design must
   have every section. Skipping breaks the comparison value.)

---

## 11. Reading order for next-session Claude

1. This file
2. `CLAUDE.md` — project conventions
3. `dev-docs/architecture.md` — system design
4. `.claude/handoff.md` — session-state pointer
5. `src/routes/design13/+page.svelte` — the canonical reference
6. Whichever design you're working on first (e.g., `src/routes/design14/+page.svelte`)
7. `src/routes/+page.svelte` if /design13 has been promoted
8. `src/lib/engine/types.ts` lines 250–350 for glass + FluidConfig

---

— end of plan —
