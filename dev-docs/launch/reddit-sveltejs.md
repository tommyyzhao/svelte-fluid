# r/sveltejs launch post

**Target:** r/sveltejs (~25k members)
**Recommended day/time:** Tuesday–Thursday, 9–11am ET (general programming-sub peak)
**Sequence:** Goes second, after Show HN. Different framing than HN.
**Image:** Attach hero.webp (or carve a smaller GIF from it). Reddit prefers visual posts in visual subs.
**Pre-flight (manual):** Open r/sveltejs sidebar, confirm no rule against launch posts, no required flair, no weekly project-share megathread.

---

## Title (90 chars)

```
svelte-fluid — WebGL fluid simulation as 6 Svelte 5 components, 10 presets, MIT
```

## Body

```
Demo: https://tommyyzhao.github.io/svelte-fluid/

Built this as a Svelte 5 component library wrapping a WebGL Navier-Stokes fluid sim. It's a port of Pavel Dobryakov's 2017 fluid sim, with a Svelte 5 component API in front of the original shaders rather than a vanilla-JS wrapper:

- 5 container shapes including arbitrary SVG paths and text glyphs — the fluid actually flows inside the letterforms
- Multiple independent instances per page, each with its own GL context (lazy-loaded so iOS Safari doesn't hit the WebGL context cap)
- `<Fluid />` with 70+ typed props, live reactive updates via runes, full cleanup on unmount
- Deterministic seeding — same `seed` reproduces the splat pattern across resize
- Glass post-processing (Snell refraction + chromatic aberration) on any shape
- 10 presets (LavaLamp, Plasma, InkInWater, Aurora, ToroidalTempest, FrameFluid, AnnularFluid, SvgPathFluid, …)
- Imperative `splat()` / `randomSplats()` via `bind:this`

Shaders are Pavel's, unchanged (both MIT). The Svelte 5 component API, container-shape boundary enforcement, glass post-processing, presets, and engine lifecycle are mine.

276 tests and 32 ADRs in the repo if you want to dig into design choices.

npm: https://www.npmjs.com/package/svelte-fluid
repo: https://github.com/tommyyzhao/svelte-fluid
```

---

## First-30-minutes engagement plan

- Be at the keyboard the moment the post goes live.
- Reply to every comment in the first hour, including one-liners.
- Tone: acknowledge → clarify, never defensive.
- If the "yet another wrapper" critique appears: redirect to what's actually new (container-shape boundary enforcement on SVG paths/text glyphs, glass post-processing, the Svelte 5 reactive surface).
- Don't ask anyone to upvote.
