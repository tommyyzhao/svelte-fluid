# ADR 0071: Test film materials on native UI

**Status:** Accepted for R&D only
**Date:** 2026-09-08

## Context

The liquid experiments established tactile behavior, but the user clarified that
the intended product is expressive material integrated with predominantly 2D web
interfaces. A standalone liquid canvas is not a sufficient design demonstration.

## Decision

Extend ADR 0070's private experiment scope to `/lab/interfaces/`: native editorial
typography and a product photograph with a movable coating blade. Both reuse the
existing film solver and session clock. Add only static shape boundaries,
high-resolution presentation coverage, transparent material rendering, and a
conservative moving barrier. Do not add a new solver for each visual effect.

Text, selection, navigation, images, and controls stay in the DOM. A passive
canvas supplies the material layer; pointer observation does not capture input
or prevent scrolling. Explicit buttons provide keyboard/touch alternatives.
Reduced-motion settings disable ambient motion, not native content or controls.
These routes remain outside the library package and import no production engine.

## Consequences

Typography rasterization is an explicit display-text adapter, not arbitrary DOM
capture. Layout/font changes rebuild the geometry and reinitialize the coating;
this prototype does not claim volume conservation across a changed physical
domain. During a fixed scene, masks and blade motion must conserve material.
Retreating the blade releases space; it does not recreate paint. Recoat is an
explicit reset. No physical wetting, surface tension, or live-DOM refraction is
implied by the appearance. Further work is selected by integrated visual results.
