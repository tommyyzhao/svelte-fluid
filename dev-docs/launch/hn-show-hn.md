# Show HN launch post

**Target:** Hacker News
**Recommended day/time:** Sunday 11:00–16:00 UTC (7am–noon ET) — Sunday is empirically the highest-breakout day for Show HN (157k-post analysis: ~12–14% breakout vs 9.45% weekday baseline).
**Backup window:** Saturday 14:00–20:00 UTC.
**Sequence:** Goes after r/sveltejs in your stated order, but research suggests HN-Sunday-first is materially higher-EV. Confirm sequence before posting.
**Critical:** URL field gets the **demo link**, not GitHub or npm.

---

## Title (under 80 chars; aim for 50–60)

```
Show HN: svelte-fluid – WebGL fluid simulation as a Svelte 5 component
```

(70 chars. Em-dash, not colon. Names framework + novel surface. No "I built".)

## URL field

```
https://tommyyzhao.github.io/svelte-fluid/
```

## Text field (1–3 paragraphs)

```
A Svelte 5 component library wrapping Pavel Dobryakov's WebGL Navier-Stokes fluid simulation. Pavel's shaders run unchanged under MIT; what's new is the component API, container-shape boundary enforcement (the fluid physically flows inside arbitrary SVG paths and text glyphs), glass post-processing (Snell refraction + chromatic aberration), and a lifecycle that survives multiple instances per page without exhausting iOS Safari's WebGL context cap.

Six components (Fluid, FluidBackground, FluidReveal, FluidDistortion, FluidStick, FluidText), ten presets, five container shapes. 70+ typed props live-reactive via runes. Deterministic seeding so the same `seed` reproduces splat patterns across resize.

276 tests, 32 ADRs documenting design tradeoffs. MIT. Demo above; repo at https://github.com/tommyyzhao/svelte-fluid.
```

---

## First comment (post immediately after submission, before the front-page race begins)

```
Author here. Some context on what's mine vs Pavel's, since "another framework wrapper" is a fair first read:

The shaders are Pavel's iconic 2017 sim, reused unchanged. What I added is the surrounding API — container-shape boundary enforcement that makes the fluid physically respect arbitrary SVG paths and text glyphs (so you can have fluid flowing inside the word "fluid"), glass post-processing for refraction effects on any shape, a lifecycle that releases GL contexts on unmount and lazy-loads them on viewport entry (iOS Safari caps at ~16 contexts per tab; this matters for grid pages), and deterministic seeding so resizes don't flash a different splat pattern.

The setConfig hot-update path was the most interesting to design: 70+ props sorted into 4 buckets (hot scalars, keyword recompiles, FBO rebuilds, construct-only) so live prop changes don't drop frames. There's an ADR for it if anyone wants to dig in.

Happy to talk about any of it — boundary SDFs, the glass refraction math, the bucket dispatch, the dogfooding harness, whatever.
```

---

## First-30-minutes engagement plan

- Be at the keyboard the moment the post goes live.
- Post the first comment within 60 seconds of submission.
- Reply to every top-level comment within minutes.
- Tone: acknowledge → clarify, never defensive. The Svader thread (HN 42416230) is the model — the author replied to even the accessibility critique he disagreed with, kept the thread alive past the algorithm's velocity-decay window.
- Don't ask anyone to upvote (HN bans this and shadow-flags posts).
- If it dies in /newest, you can email hn@ycombinator.com asking for second-chance pool re-up. This is real, undocumented but well-documented in IndieHackers writeups.

---

## Anti-patterns to avoid

- "I built X" titles consistently underperform.
- GitHub or npm in the URL field — kills the visual-first hit.
- Update posts ("0.2.2 is out") — HN does not reward incremental versions.
- Generic positioning ("UI library for Svelte"). Threlte (now *the* Svelte 3D library) launched at 11/1 and Skeleton at 4/2 because of generic framing. Quality alone does not save you.
