# Show HN launch post (0.8.0, WebGL)

**Target:** Hacker News
**Critical:** URL field gets the **demo link**, not GitHub or npm. HN ignores the text field when a URL is set, so everything goes in the first comment.
**Gate before posting:** `svelte-fluid@0.8.0` is live on npm, the demo at https://svelte-fluid.dev/ serves that build, `https://svelte-fluid.dev/r/splash-cursor.json` resolves, and the README matches what is shipped.

## Recommended posting sequence

Basis: `launch-research.md` (Show HN best on Sunday, 11:00-16:00 UTC; r/sveltejs Tue-Thu morning ET; X after both). **Owner posts every step; nothing here is automated.**

| When | Where | Notes |
|---|---|---|
| Sun, 12:00 UTC (8am ET / 5am PT) | Show HN | Post first comment within 60 s. Stay at keyboard 2 h. Backup: Sat 14:00-20:00 UTC. |
| Sun, same day | Svelte Discord #showcase | Only if HN is going well or flat; low-risk, no ranking effect. |
| Tue, 9-11am ET | r/sveltejs | Different framing (Svelte-specific). Read sidebar rules first. |
| Tue-Wed, after Reddit | X thread + Bluesky thread | Add HN/Reddit links to the last post if they landed. |
| Wed-Fri | Directory PRs / forms | See `directory-submissions.md`. Newsletter tips before the next weekly issue. |
| Only if HN dies | Email hn@ycombinator.com for second-chance pool | Per `launch-research.md`. Do not resubmit. |

Do not ask anyone to upvote or comment (Show HN rules).

---

## Title (63 chars; limit 80)

```
Show HN: svelte-fluid – fluid simulation as Svelte 5 components
```

Em-dash, names the framework and the surface. No "I built".

## URL field

```
https://svelte-fluid.dev/
```

## First comment (post immediately after submission; ~240 words)

```
Author here. svelte-fluid is a fluid simulation for Svelte 5: <Fluid />, plus wrappers for full-page backgrounds, text-shaped fluid, dye-driven reveals, and image distortion. 14 presets, including solver-native flow scenes (Venturi, Karman vortex street, Tesla valve). Zero runtime dependencies; Svelte is a peer.

Credit first: the solver is a port of Pavel Dobryakov's WebGL-Fluid-Simulation (MIT). What I added is the Svelte 5 layer: typed reactive props, container shapes (arbitrary SVG paths and text as boundaries, so the fluid flows inside the letters rather than being clipped), glass refraction, flow scenes, and presets.

It runs on plain WebGL, WebGL1 or WebGL2, so it works wherever WebGL does. I tested Chrome 120+, Firefox 121+, Safari 17+, iOS Safari 16+. Where WebGL is missing you get your fallback snippet, a poster image, or an accessible color fill instead of a blank box.

Many canvases on one page are a real concern because browsers cap WebGL contexts. `lazy` builds an engine only while a canvas is near the viewport; `autoPause` stops the loop in hidden tabs. Resize keeps live dye and velocity.

One more thing: a splash cursor (full-viewport, pointer-following, clicks pass through) installs with one command via shadcn-svelte:
npx shadcn-svelte@latest add https://svelte-fluid.dev/r/splash-cursor.json

Repo: https://github.com/tommyyzhao/svelte-fluid. Feedback welcome, especially on mobile browsers and on the fallback experience.
```

## First-30-minutes engagement plan

- Be at the keyboard the moment the post goes live; first comment within 60 seconds.
- Reply to every top-level comment within minutes. Acknowledge, then clarify; never defensive.
- Expected critiques: "another wrapper around Pavel's sim" (answer: credited; the shapes, flow scenes, Svelte 5 reactive API and lifecycle are the new part); "why not a newer GPU API" (answer: WebGL runs in every current browser, one backend, no feature-gating); accessibility (poster/fallback text, native text kept; don't overclaim AT coverage); "battery/CPU" (`lazy`, `autoPause`, no numbers claimed).
- Do not quote performance numbers. None are published for this release.

## Anti-patterns

- "I built X" titles; GitHub or npm in the URL field; update-post framing ("0.8 is out"); generic "UI library" positioning.
