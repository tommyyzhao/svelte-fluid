# Plan: consolidate scratch/test routes into polished, unlisted demo routes

Status: **Proposed** (planning only — not yet implemented)
Owner: TBD · Related: Phase 5 route hygiene, [ADR-0040](../decisions/0040-preset-config-registry.md)

## Goal

The static build currently ships ~32 demo/test/scratch routes, most of them
left over from a homepage design bake-off and from feature/physics testing.
Replace that sprawl with a **small, curated, presentable set of demo routes**
that we'd be happy to show publicly — but keep them **unlisted** (noindex, not
in nav/sitemap) until we choose to feature them.

## Current inventory (32 routes)

Grouped by what they actually are:

### A. Homepage design explorations — 22 routes (the bulk)
`design1`–`design20`, `design3-light`, `design-competition`.
Each is a full alternative landing page (1,500–2,500 lines) with a theme name:
*Liquid Glass, Editorial, Terminal, Velvet, Lagoon, Bubblegum, Vortex,
Flagship, …*. `design-competition` (447 L) is the gallery index. The winner of
this bake-off **is the current homepage**, so these are redundant as standalone
pages but contain reusable visual ideas.

### B. Asset-capture tooling — 2 routes
`capture` (38 L), `hero` (180 L). Internal pages used to render `hero.webp` /
the OG image into `static/`. Not demos. The assets they produce already exist in
`static/`.

### C. Feature / physics demos — 8 routes
`background-fluid` (FluidBackground), `fluid-reveal` (FluidReveal),
`svg` (SVG-path container shapes), `svelte-fluid` (untitled scratch),
`obstruction-lab` + `obstruction-lab/bench` (obstruction physics/perf),
`test-boundary` (boundary conditions), `maze-test` (maze obstruction).
These demonstrate real features but in rough "lab/test" form.

## Target structure

A single curated **`/examples`** section (index + a handful of polished pages),
all unlisted for now:

| Target route | Sourced/folded from | Shows |
|---|---|---|
| `/examples` | new index | grid of the demos below, with one-line blurbs |
| `/examples/backgrounds` | `background-fluid` | `FluidBackground` behind real page content + exclusion zones |
| `/examples/reveal` | `fluid-reveal` | `FluidReveal` scratch-to-reveal + auto-reveal |
| `/examples/shapes` | `svg` + container-shape bits | `containerShape` variants incl. `svgPath`/text mode |
| `/examples/flow` | `obstruction-lab`, `test-boundary`, `maze-test` | obstructions + flow scenes + boundary conditions, one clean CFD-style page |
| `/examples/looks` | best 3–4 of `design1`–`20` | a themed "looks" gallery (not 22 pages) — curated palettes/typography over the fluid |

Notes:
- **Design explorations (A):** do **not** migrate all 22. Pick the 3–4 strongest
  as a single `/examples/looks` gallery (or fold their best ideas into the
  homepage), then **delete the rest** (git history preserves them). Keeping 22
  near-duplicate 2k-line pages is the opposite of "presentable."
- **Tooling (B):** `capture`/`hero` are not demos. Either (i) delete now that
  the assets exist, or (ii) move under a dev-only path excluded from the
  production build (e.g. guarded by an env flag). Recommend **delete**, and if we
  need to regenerate assets later, restore from history.
- **`svelte-fluid` (untitled scratch):** delete or fold into `/examples`.

## Polish bar (what "presentable" means here)

Every `/examples/*` page must:
- share a consistent, responsive layout + a small `/examples` breadcrumb/nav;
- use `lazy` on every `<Fluid>` (WebGL context budget) and respect
  `prefers-reduced-motion`;
- have a real `<title>` + meta description, an `aria-label` on each canvas, and
  a short "what this shows" caption + a **Show code** affordance (reuse the
  `presetScaffoldSnippet` from-scratch pattern);
- carry the unlisting markers below.

## Unlisting mechanism (until we feature them)

- `noindex` per page (see the per-page-noindex plan / `robots.txt` Disallow),
- excluded from `sitemap.xml` and from primary nav,
- reachable by direct URL so we can share previews.

When we decide to feature them, flip: add to nav + sitemap, drop the `noindex`.

## Migration phases

1. **Scaffold** `/examples` index + the shared example layout component.
2. **Port C → `/examples/*`**: rebuild the 4–5 feature demos to the polish bar,
   deleting the `*-lab`/`*-test` originals as each lands.
3. **Curate A → `/examples/looks`**: pick the survivors, delete the other ~18
   `designN` routes.
4. **Remove B** (`capture`, `hero`) and the untitled `svelte-fluid` scratch.
5. **Hygiene**: confirm none of the deleted routes are linked anywhere; update
   `robots.txt`/sitemap; run `bun run build` (adapter-static `strict`) clean.

## Testing

- `bun run build` must stay green under adapter-static `strict: true` after each
  deletion (catches dangling prerender links).
- A small test asserting the `/examples/*` set is the only demo surface beyond
  `/` and `/docs/*` (guards against new scratch routes creeping back in).

## Open questions (need a decision before implementing)

1. **Route name:** `/examples` vs `/demos` vs `/gallery`?
2. **Design explorations:** which specific `designN` survive into `/examples/looks`
   (need a quick visual pass), and is deleting the rest OK?
3. **Tooling:** delete `capture`/`hero` outright, or keep dev-only behind a flag?
4. **Scope of "flow" demo:** merge all three physics labs into one page, or keep
   `obstruction-lab/bench` as a separate perf bench (dev-only)?

## Effort

~1–1.5 days: most cost is rebuilding the 4–5 feature demos to the polish bar and
a visual triage of the 22 design pages; deletions are cheap.
