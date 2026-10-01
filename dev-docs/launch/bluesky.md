# Bluesky thread (0.8.0, WebGL)

**Target:** personal Bluesky account (Svelte community is active there; svelte-fluid fits "creative coding" and "Svelte" feeds). **Owner posts**; nothing is automated.
**Limit:** 300 graphemes. Counts are raw character counts including URLs (Bluesky link facets can shorten display, but count conservatively).
**Media:** up to 4 images or one video per post; use MP4 for motion (3 min / 50 MB cap). Alt text required on every attachment; suggested alt given.

---

## Post 1 (203 chars)

```
svelte-fluid 0.8: fluid simulation for Svelte 5 as components. Drag through it, flow it inside text and SVG shapes, use it as a full-page background. Works wherever WebGL does.

https://svelte-fluid.dev/
```

Attach: video of the demo hero, cursor dragging through the fluid page.
Alt: "Colorful fluid simulation reacting to a cursor on a dark web page."

## Post 2 (199 chars)

```
It descends from Pavel Dobryakov's WebGL-Fluid-Simulation (MIT, credited). The Svelte 5 component API, container shapes, flow scenes and 14 presets are new. Zero runtime dependencies, Svelte as peer.
```

Attach: clip or still of text-shaped fluid filling letterforms.
Alt: "Large letters filled with swirling colored fluid."

## Post 3 (191 chars)

```
A splash cursor in one command via shadcn-svelte:

npx shadcn-svelte@latest add https://svelte-fluid.dev/r/splash-cursor.json

Pointer events pass through; it respects prefers-reduced-motion.
```

Attach: clip of the cursor trail over the dark docs page.
Alt: "A glowing multicolored fluid trail following the cursor across a dark page."

## Post 4 (162 chars)

```
Without WebGL you get a poster or fallback snippet instead of a blank box. Typed, reactive props.

bun add svelte-fluid
https://github.com/tommyyzhao/svelte-fluid
```

Attach: none, or a still of the poster fallback.
Alt (if used): "Static poster image shown when WebGL is unavailable."

---

## Notes

- Quote-post nothing; no hashtags needed (Bluesky discovery runs on feeds), though `#svelte` is harmless.
- Add HN / Reddit links as a fifth post only if they landed.
- No performance numbers; none published.
