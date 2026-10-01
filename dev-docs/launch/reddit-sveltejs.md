# r/sveltejs launch post (0.8.0, WebGL)

**Target:** r/sveltejs
**Day/time:** Tue-Thu, 9-11am ET (see `launch-research.md`). After Show HN; Svelte-specific framing.
**Owner posts this**; nothing is automated.
**Media:** Attach a short clip: the demo's `FluidBackground` hero with the cursor dragging through text/cards, cards carved out via `exclude` (MP4/GIF, not animated WebP). Fallback: `static/hero.webp`.
**Pre-flight (manual):** Re-read the sidebar rules, apply the self-promotion flair if one exists, check for a project-share megathread. Account history is thin; reply to everything for the first hour.

---

## Title (76 chars)

```
[Self Promotion] svelte-fluid 0.8: fluid backgrounds and cursor for Svelte 5
```

## Body

````
Demo: https://svelte-fluid.dev/

svelte-fluid is a fluid simulation for Svelte 5, built on WebGL so it works wherever WebGL does. The solver derives from Pavel Dobryakov's WebGL-Fluid-Simulation (MIT); the component API, shapes, flow scenes and presets are the new part.

A full-page background where your nav and cards punch holes in the fluid:

```svelte
<script>
  import { FluidBackground } from 'svelte-fluid';
</script>
<FluidBackground exclude=".nav, .card" splatOnHover>
  <nav class="nav">...</nav><main>...</main>
</FluidBackground>
```

(Give interactive children `pointer-events: auto`; the slot is `pointer-events: none` so window pointer input keeps feeding the sim. README has the full CSS.)

What's in it:

- `Fluid`, `FluidBackground`, `FluidReveal`, `FluidDistortion`, `FluidStick`, `FluidText`, plus 14 presets (LavaLamp, Plasma, Venturi, Karman...)
- Container shapes: circle, frame, annulus, arbitrary SVG paths, or text. The fluid is confined by the shape, not clipped.
- Flow scenes: solver-native Venturi, Karman vortex street, Tesla valve and gas flare.
- A splash cursor in one command via shadcn-svelte (full viewport, pointer events pass through, respects `prefers-reduced-motion`):
  `npx shadcn-svelte@latest add https://svelte-fluid.dev/r/splash-cursor.json`
- `lazy` and `autoPause` for dense pages (browsers cap WebGL contexts). Resize keeps live dye and velocity.
- `<Fluid>` props are typed and reactive. Zero runtime dependencies; Svelte is a peer.

Browsers: WebGL1 or WebGL2; tested on Chrome 120+, Firefox 121+, Safari 17+, iOS Safari 16+. Without WebGL you get your `fallback` snippet, a `poster`, or an accessible color fill. `isWebGLAvailable()` lets you branch yourself.

npm: https://www.npmjs.com/package/svelte-fluid
repo: https://github.com/tommyyzhao/svelte-fluid

Feedback welcome, especially on mobile and low-end devices.
````

---

## First-30-minutes engagement plan

- At the keyboard when it goes live; reply to every comment in the first hour.
- Acknowledge, then clarify; never defensive. Don't ask for upvotes.
- "Yet another wrapper": credited upstream; shape-confined fluid, flow scenes, Svelte 5 reactive surface and lifecycle are the new work.
- "Why not a newer GPU API": WebGL runs in every current browser; one backend, no gating.
- "Heavy on the page?": point to `lazy`, `autoPause`, and the splash cursor's reduced-motion handling. Don't quote numbers.
