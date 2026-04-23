# Planned Fixes — Playground & Demo Page Polish

**Created**: 2026-04-23, end of session 9
**Status**: Pending — implement all items next session, then delete this file.

---

## 1. Reveal Playground — Underlying Content Controls

### 1a. Rename & restructure content controls
- Section header: "Underlying Content" (not "Content")
- Dropdown options: "Gradient + Text" (not "Text"), "Tile Mosaic" (not "Mosaic")
- Remove the "Type" label — the section header is sufficient

### 1b. Color picker: single accent color
- Replace the two color pickers ("Color 1", "Color 2") with a **single** "Accent color" picker
- The gradient is always `linear-gradient(135deg, <accent-color>, transparent)` — the transparent stop is mandatory for reveal to make visual sense
- Gradient angle hardcoded at 135deg — not user-configurable (it's sample content, not the product)
- The accent color applies to **both** content types:
  - Gradient + Text: `linear-gradient(135deg, <accent>, transparent)` with "Hello World" text
  - Tile Mosaic: use accent as the `background` behind the mosaic grid (currently hardcoded `#1a1a2e`)
- State var: `revealAccentColor` (replaces `revealColor1` + `revealColor2`)
- Update `+page.svelte` playground template, ControlPanel props/bindings, and CSS

### 1c. Default reveal physics must match "Scratch to reveal" card
- When switching playground to Reveal mode, snap physics to FluidReveal defaults:
  - `curl = 0` (not 30)
  - `velocityDissipation = 0.9` (not 0.2)
  - `splatRadius = 0.2` (not 0.25)
  - `sensitivity = 0.1, curve = 0.1, fadeBack = true`
  - `bloom = false, sunrays = false, shading = false`
- When switching back to Fluid mode, restore previous Fluid values
- Implementation: store Fluid-mode physics in a snapshot object on mode switch, restore on switch back

---

## 2. Code Preview — Consistent `</>` Pattern Everywhere

### 2a. Playground code preview as `</>` dropdown
- Replace the "Copy code" button at the bottom of ControlPanel with a `</>` toggle button (same style as Card's code toggle)
- When toggled, show an inline code preview panel (below the actions area) with the generated snippet + a "Copy" button inside
- The snippet switches between `<Fluid .../>` and `<FluidReveal ...>` based on playground mode
- Keep the "Share" button separately

### 2b. FluidBackground code preview
- Add a floating `</>` button in the top-right corner of the page (or near the header)
- Toggles a code snippet showing the `<FluidBackground>` configuration used on the demo page
- On mobile: collapsed to just the icon, expands on tap
- Snippet content: the exact `<FluidBackground exclude="..." ...>` markup from the demo page

---

## 3. Customize Button on ALL Cards

### 3a. Missing Customize buttons
Currently missing on:
- "Default" config card (trivial — config is `{}`)
- Container shape cards: Circle, Frame, Annulus, Rounded frame, SVG path, Text glyph
- Glass effect cards: Portal ring, Glass frame
- Reveal cards: Scratch to reveal, Permanent reveal, Auto-reveal, Soft reveal

### 3b. Add PRESET_CONFIGS entries for each
For container shape cards, extract the props from the actual `<Fluid>` / wrapper component used in the card. For reveal cards, the config should set `playgroundMode = 'reveal'` and include the FluidReveal-specific props.

### 3c. Refactor for maintainability
Consider a pattern where each card's config is defined once and used for both `onCustomize` and the code snippet. Currently configs are duplicated between `PRESET_CONFIGS` and the inline `snippet` strings. Options:
- Generate snippets from the config objects (DRY but complex)
- Accept the duplication but document the mapping (pragmatic)
- At minimum, ensure every Card with non-trivial props has `onCustomize`

---

## 4. Share Button Feedback

- "Share" button should show "Copied!" feedback after clicking (same `copyState` pattern as the code copy button)
- Currently it silently copies the URL with no visual confirmation

---

## 5. Language & Label Audit

- ControlPanel heading could say "Controls" → keep as-is (concise)
- "Random Splats" accordion → fine
- "evenSpacing" label → "Even spacing" (readability)
- "show outline" checkbox → "Show shape outline"
- Playground section description: current wording is good
- Ensure all accordion section names are consistent: Title Case, no parenthetical technical notes (e.g., remove "(hot)", "(recompile)", "(FBO rebuild)" — those are engine internals, not user-facing concepts)
  - "Physics (hot)" was already removed in the accordion redesign ✓
  - Check that no accordion headers leak bucket terminology

---

## 6. Remaining Audit Findings Not Yet Fixed

### Finding #3 (Medium): `{#key revealAutoReveal}` semantics
- The key remounts the entire FluidReveal on toggle. This is needed because `autoReveal` starts a `requestAnimationFrame` loop in `onMount`. But toggling it twice destroys/rebuilds the fluid state unnecessarily.
- **Decision**: Accept current behavior. The alternative (making autoReveal reactive inside FluidReveal) would require engine changes. Document the remount behavior.

### Finding #10 (Low): `controlsRef` type is imprecise
- Type it as `{ handle: FluidHandle } | undefined` using the proper import.
- Low priority but improves code clarity.

### Finding #15 (Low): Card "Copy" button has no feedback
- Add a `copyState` to Card.svelte with "Copied!" flash, same as ControlPanel pattern.

### Finding #20 (Low): `backColor` derived creates new object every render
- Consider using `$state` for backColor and updating in an `$effect` only when R/G/B change.
- Low priority — doesn't cause visible bugs, just unnecessary setConfig calls.

---

## Implementation Order

1. Fix #1 (content controls, accent color, reveal defaults) — biggest UX impact
2. Fix #3 (Customize on ALL cards) — consistency
3. Fix #2 (code preview pattern) — visual consistency
4. Fix #4 (Share feedback) — trivial
5. Fix #5 (language audit) — trivial
6. Fix #6 (remaining nits) — as time permits
7. Delete this file
