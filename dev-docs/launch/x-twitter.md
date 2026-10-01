# X / Twitter thread (0.8.0, WebGL)

**Target:** personal X account. **Owner posts**; nothing is automated. Post after Show HN and r/sveltejs; add their links to the last post if they landed.
**Limit:** 280 chars; any URL counts as 23. Counts: raw length / X-weighted length (URLs = 23).
**Media:** MP4/GIF, not animated WebP. Don't tag anyone unprompted.

---

## Post 1 (raw 189 / weighted 187)

```
svelte-fluid 0.8: fluid simulation for Svelte 5. Drag through it, flow it inside text and SVG shapes, use it as a full-page background. Works wherever WebGL does.

https://svelte-fluid.dev/
```

Attach: 10-15 s screen capture of the demo hero (cursor dragging through the fluid page). Fallback: `static/hero.webp` exported to MP4.

## Post 2 (raw 179 / weighted 179)

```
Derived from Pavel Dobryakov's WebGL-Fluid-Simulation (MIT, credited). The Svelte 5 component API, container shapes, flow scenes and 14 presets are new. Zero runtime dependencies.
```

Attach: still or short clip of text-shaped fluid (`FluidText` / `svgPath` text container) filling letterforms.

## Post 3 (raw 129 / weighted 107)

```
Want a splash cursor? One command, via shadcn-svelte:

npx shadcn-svelte@latest add https://svelte-fluid.dev/r/splash-cursor.json
```

Attach: clip of the splash cursor trail over a dark docs page (https://svelte-fluid.dev/docs/recipes/splash-cursor, demo toggled on).

## Post 4 (raw 158 / weighted 139)

```
No WebGL? You get a poster or fallback snippet instead of a blank box. Typed, reactive props.

bun add svelte-fluid
https://github.com/tommyyzhao/svelte-fluid
```

Attach: none, or a still of the poster/fallback state.

---

## Optional post 5 (only if HN/Reddit landed)

```
discussion: [HN link]
r/sveltejs: [Reddit link]
```

## Don't

- Don't repost if it lands flat; a quote-post a week later with new context is fine.
- Don't quote performance numbers; none are published for this release.
