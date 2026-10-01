# Directory and community submissions (0.8.0, WebGL)

Every entry: **owner submits** (nothing here is auto-posted). Submit after `svelte-fluid@0.8.0` is on npm and the demo serves that build. Re-read each target's contributing rules immediately before submitting; formats were checked against live pages on 2026-10-01 but can change.

Shared facts:

- Name: `svelte-fluid`
- Demo: https://svelte-fluid.dev/
- Repo: https://github.com/tommyyzhao/svelte-fluid
- npm: https://www.npmjs.com/package/svelte-fluid
- License: MIT. Zero runtime dependencies; Svelte 5 peer.
- Browsers: WebGL1 or WebGL2; tested on Chrome 120+, Firefox 121+, Safari 17+, iOS Safari 16+.
- Short description (<= 160 chars): `WebGL fluid simulation for Svelte 5: backgrounds, splash cursor, text-shaped fluid, reveals and image distortion. Zero runtime dependencies.` (140)

---

## 1. awesome-svelte (TheComputerM/awesome-svelte) - owner submits

Method: pull request (README says "Add links through pull requests"). Entries are `- [Name](URL) - Sentence.` Add to the existing section list, alphabetical/appended per neighbours; check neighbours before choosing.

Suggested section: **Animations** (under UI Components > Miscellaneous).

```
- [svelte-fluid](https://github.com/tommyyzhao/svelte-fluid) - WebGL fluid simulation components for Svelte 5: full-page backgrounds, splash cursor, text and SVG-shaped fluid, reveals and image distortion.
```

PR title: `Add svelte-fluid`

---

## 2. Svelte Society library form - owner submits

Method: https://sveltesociety.dev/library has a "Submit library" button (login required). The exact form fields were not visible without logging in; the values below follow the fields shown on listings (title, description, links, category, tags). Adjust to the real form.

| Field | Value |
|---|---|
| Name / title | `svelte-fluid` |
| Category | Library |
| Description | `WebGL fluid simulation for Svelte 5. Components for full-page backgrounds, fluid confined to text or SVG shapes, dye-driven reveals and image distortion, solver-native flow scenes and 14 presets, plus a one-command splash cursor via shadcn-svelte. Works wherever WebGL does, with an accessible poster or fallback otherwise. Zero runtime dependencies.` |
| Repository URL | https://github.com/tommyyzhao/svelte-fluid |
| npm / package URL | https://www.npmjs.com/package/svelte-fluid |
| Website / demo | https://svelte-fluid.dev/ |
| Tags | UI Library, Showcase (also Runes only if the form allows more and you want to claim it; props are typed and reactive) |

---

## 3. shadcn-svelte registry directory - owner submits (route unverified)

The splash cursor is a standalone registry item at `https://svelte-fluid.dev/r/splash-cursor.json`. Check the shadcn-svelte docs/repo for a current community-registry listing process before submitting; if none exists, skip. Do not claim an official listing.

---

## 4. This Week in Svelte - owner submits (route unverified)

I could not confirm a submission form. The svelte.dev monthly "What's new in Svelte" posts say to tell them what was missed "on Reddit or Discord", and they list libraries under "Libraries, Tools & Components > UI Components and Animations". Practical route: post in the Svelte Discord (#showcase, below) and reply to the latest monthly post's call for tips if a channel exists; check the show notes/repo for a current tips link before sending.

Tip text:

```
svelte-fluid 0.8: fluid simulation components for Svelte 5 on WebGL. FluidBackground gives a full-page fluid with exclusion zones for your nav and cards; fluid can also be confined to text or SVG shapes, used as a dye-driven reveal, or distort an image. A splash cursor installs with one shadcn-svelte command. Falls back to an accessible poster without WebGL. Zero runtime dependencies, MIT. Demo: https://svelte-fluid.dev/ Repo: https://github.com/tommyyzhao/svelte-fluid
```

---

## 5. Svelte Discord #showcase - owner submits

Read the channel pins/rules first (not verified). Keep it short, lead with the demo, attach the clip from the r/sveltejs post.

```
svelte-fluid 0.8 is out: fluid simulation components for Svelte 5 on WebGL (derived from Pavel Dobryakov's WebGL-Fluid-Simulation, MIT).

Demo: https://svelte-fluid.dev/
Repo: https://github.com/tommyyzhao/svelte-fluid

- <FluidBackground exclude=".nav, .card" splatOnHover> for full-page backgrounds
- fluid confined to text/SVG shapes, reveal and image-distortion wrappers, flow scenes, 14 presets
- splash cursor in one command: npx shadcn-svelte@latest add https://svelte-fluid.dev/r/splash-cursor.json
- accessible fallback when WebGL is missing; zero runtime deps

Feedback welcome, especially on mobile.
```

---

## Not claimed / omitted

- No performance numbers anywhere; none are published for this release.
- Runtime claims cover WebGL only.
