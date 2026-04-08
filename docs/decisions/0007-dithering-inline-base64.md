# ADR 0007: Inline LDR_LLL1_0.png as base64

**Status:** Accepted
**Date:** 2026-04-06

## Context

The bloom effect uses a 64×64 grayscale dithering texture
(`LDR_LLL1_0.png`, 7115 bytes) sampled in the display fragment shader
to break up bloom banding. The original `script.js` loads it from a
relative URL via `new Image()`.

A library can't ship a "loose file at a relative URL" because every
consumer's bundler handles assets differently:

- Vite/Rollup: `?url` import or `import.meta.url` tricks
- Webpack: `file-loader` / `asset/resource` with config
- esbuild: similar config story
- CDN consumers: no bundler at all

## Decision

Encode the PNG bytes as a base64 string in
`src/lib/engine/dithering.ts` and use a `data:image/png;base64,…`
URL inside `createDitheringTexture`. The string is generated once
from `bun -e` and pasted into the file.

```bash
bun -e "
const orig = await Bun.file('./WebGL-Fluid-Simulation/LDR_LLL1_0.png').arrayBuffer();
console.log(Buffer.from(orig).toString('base64'));
"
```

## Consequences

**Positive:**
- Library has zero asset/bundler dependencies. Works identically
  under Vite, Webpack, esbuild, plain ESM CDNs, and bundle-free
  imports from `bun -e`.
- The PNG bytes are versioned alongside the source code in git, so
  there's no "missing asset" failure mode.
- Tree-shakable — if a consumer disables BLOOM, the inlined string
  still ships but is referenced only inside `createDitheringTexture`,
  and modern bundlers can drop it if `bloom={false}` is statically
  known. (In practice it's <10 KB so this rarely matters.)

**Negative:**
- ~9.5 KB inflation in the source/bundle. Gzips to ~5 KB. For a
  WebGL library that already ships ~50 KB of shader source, this is
  noise.
- The base64 string is opaque in PRs and code reviews — can't visually
  diff a texture change. Mitigation: regenerate from the upstream PNG
  with the documented `bun -e` command and verify round-trip.

**Rejected alternatives:**
- *Static asset import (`?url`):* Forces every consumer's bundler to
  understand asset URLs. Breaks for CDN consumers and edge runtimes.
- *Procedural generation:* The original PNG is a tuned blue-noise
  pattern. Generating a visually equivalent texture procedurally is
  its own research project.
- *External CDN URL:* Cross-origin texture upload + privacy
  implications + reliability dependency on a third-party host. Hard
  no.
