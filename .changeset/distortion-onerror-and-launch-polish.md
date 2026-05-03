---
"svelte-fluid": patch
---

Fix: `FluidDistortion` no longer leaves a null texture bound when its `imageUrl` fails to load (404 or network error). The engine now resets the loaded-URL cache and rebinds the 1x1 fallback texture in `image.onerror`, so subsequent frames keep rendering instead of producing white/black output.

Also: refreshed `package.json` description and keywords for npm discoverability, corrected the `FluidDistortion` `initialSplats` default in the component docs (it's `20`, not `5`), and swapped the broken bundlephobia badge in the README for a packagephobia install-size badge.
