# ADR 0010: Dual MIT license (Pavel Dobryakov + svelte-fluid contributors)

**Status:** Accepted
**Date:** 2026-04-06

## Context

`svelte-fluid` is a derivative work of
[PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation),
which is MIT-licensed. The 22 shader sources are reused byte-for-byte;
the entire engine class is a transliteration of the original
`script.js`. Even the `LDR_LLL1_0.png` dithering texture is the
unchanged upstream file (inlined as base64).

The MIT License requires that "the above copyright notice and this
permission notice shall be included in all copies or substantial
portions of the Software."

## Decision

- Top-level `LICENSE` file contains a *dual* MIT notice:
  1. Pavel Dobryakov (c) 2017 — original WebGL-Fluid-Simulation
  2. svelte-fluid contributors (c) 2026 — Svelte 5 / TypeScript port
- The full upstream MIT permission notice is reproduced verbatim.
- Source files derived from upstream code carry an attribution
  comment block in their header pointing to the upstream repo.
- The README has an "Acknowledgments" section with a link to
  PavelDoGreat/WebGL-Fluid-Simulation.

## Consequences

**Positive:**
- Compliant with the upstream MIT terms.
- Credit to Pavel Dobryakov is unambiguous and visible in three
  places: LICENSE, README, and source file headers.
- Downstream consumers see one license file with both notices and
  understand the full provenance.

**Negative:**
- Slightly more verbose than a single-author MIT file.
- New contributors need to know not to remove the upstream notice.

**Rejected alternatives:**
- *Single-author "svelte-fluid" license:* Violates the MIT terms
  and erases credit. Not an option.
- *Different license entirely (Apache 2.0, ISC):* Can't relicense
  upstream code without permission. Not an option.
