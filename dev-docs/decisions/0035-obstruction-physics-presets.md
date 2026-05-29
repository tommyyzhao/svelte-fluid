# ADR 0035: Obstruction-based fluid-dynamics presets + demos

**Status:** Accepted
**Date:** 2026-05-28

## Context

ADR-0034 added interior obstructions — arbitrary SVG/text obstacles the fluid
flows around, orthogonal to `containerShape`. That ADR established the
*mechanism*; this ADR records the *content* built on top of it: a set of
fluid-dynamics presets and demos that turn the obstruction primitive into
recognisable physical scenes (a rocket nozzle, a Venturi throat, a river delta,
a maze, a vortex street, an airfoil, a turbine stator).

The unifying mechanism comes from ADR-0034: **obstruction physics (velocity +
dye zeroed inside the mask, so the pressure solver routes flow around the
obstacle) is always active — it applies whether the boundary is open or
closed.** Unlike a container shape (which becomes a visual-only crop under
`openBoundary`), an obstruction is a solid wall regardless of the canvas-edge
condition. The throughflow scenes therefore set **`openBoundary: true`**: fluid
enters at an inlet, flows around the obstacles, and vents off the canvas edge
rather than recirculating and saturating a sealed box. Continuous inlet
injection sustains the stream; density dissipation cools/clears it downstream.
The one exception is the **maze**, which keeps a closed boundary on purpose so
the fluid is contained and floods the channel until it finds the exit hole.

## Decision

Ship **3 library presets** (exported from `src/lib/index.ts`, documented in the
`/docs` routes) and keep **4 demo-only showcases** (in
`src/routes/obstruction-demos/`, not exported, not documented as public API).
The split is honesty-driven: the library presets are physically defensible, the
demos are evocative-only and would mislead if shipped as "presets".

**Library presets:**

- **`RocketEngine`** — converging-diverging (de Laval) nozzle from two
  obstruction slabs. Continuous hot-jet injection at the chamber head via
  `onMount` + `setInterval` (120ms).
- **`Venturi`** — Bernoulli throat from two concave islands. Five inlet
  streamlines re-injected via `onMount` + `setInterval` (320ms).
- **`RiverDelta`** — flow braiding around five staggered teardrop islands.
  Wide left-edge inlet via `autoSplat` (`autoSplatBandHeight` 1.2).

**Demo-only showcases** (`src/routes/obstruction-demos/`):

- **`Maze`** — flood-fill through a single-channel maze (`setInterval` inject).
- **`Karman`** — flow past a cylinder, evoking a vortex street (`autoSplat`).
- **`Airfoil`** — streamlines split over/under a cambered body (`setInterval`).
- **`Pinwheel`** — jet deflected through a ring of static vanes (`autoSplat`).

Six of the seven set `openBoundary: true` so the flow vents off-canvas; the
**maze** alone uses a closed boundary so it floods and exits only through the
hole. Injection is either `onMount` + `setInterval` (Rocket, Venturi, Maze,
Airfoil) or `autoSplat` (RiverDelta, Karman, Pinwheel). Every one is SSR-guarded (the
`setInterval`/`matchMedia` work is gated on `typeof window`) and
reduced-motion-guarded (the `setInterval` demos bail out of the interval; the
`autoSplat` demos gate `autoSplatRate` to 0), so a static opening scene remains.

### Honest faithful-vs-evocative ledger

The whole point of the library/demo split is to be honest about which physics
is real. One row per scene:

| Scene | Status | What is / isn't real |
| --- | --- | --- |
| Venturi acceleration | **FAITHFUL** | Incompressible continuity genuinely speeds flow through the throat. |
| Maze flood-fill | **FAITHFUL** | Zero dissipation + single open channel → dye truly floods the one corridor to the exit. |
| RiverDelta branching | **FAITHFUL** | Continuity routes flux through the open channels between islands. |
| RocketEngine throat acceleration | **FAITHFUL** | Same continuity as Venturi — the de Laval throat really accelerates the jet. |
| RocketEngine color gradient | **EVOCATIVE** | White→yellow→orange is dye dissipating over distance, NOT a blackbody temperature falloff. |
| Venturi throat glow | **EVOCATIVE** | Dye concentration crossing the bloom threshold, not a physical luminance. |
| Karman vortex shedding | **ASPIRATIONAL / unreliable** | Not a validated shedding sim; shedding emerges weakly/intermittently from masked shear layers, frequency is NOT a real Strouhal number, and the look leans on post-hoc masking. |
| Airfoil | **STREAMLINE SPLIT ONLY** | The split over/under the body is real (the mask blocks fluid); there is NO real lift or circulation from post-hoc velocity masking. |
| Pinwheel | **STATIC vanes** | The vanes are fixed masks — no rigid-body rotation. It reads as a stator: tangential deflection is real, "rotation" is read in by the eye. |

## Consequences

**Positive:**
- Three defensible fluid-dynamics presets join the library as pure `<Fluid>`
  recipes over the ADR-0034 obstruction primitive (which was refined so
  obstruction physics stays active under an open boundary — see ADR-0034).
- The library/demo split keeps the public surface honest: only the faithful (or
  honestly-captioned faithful+evocative) scenes are exported and documented.
- The four demos exercise the obstruction feature across mazes, bluff bodies,
  airfoils, and vane rings without committing the project to maintaining their
  aspirational physics as a public contract.
- Each preset/demo carries its faithful-vs-evocative caveat in its own source
  header, so the honesty travels with the code.

**Negative:**
- Even with an open boundary venting the outflow, these are still post-hoc
  masked velocity fields, not a true open-domain CFD solver (free-slip walls,
  ~1-texel boundary, no real boundary layer). The faithful-vs-evocative caveats
  in the table above still apply.
- The demos live in a route folder and are not tree-shaken into the package, but
  they are deliberately not part of the published API, so they need their own
  maintenance discipline (they are visual-QA artifacts, not shipped components).

## Rejected alternatives

1. **Author the rocket as a `containerShape` `svgPath` instead of two
   obstruction slabs.** A container becomes a visual-only crop under
   `openBoundary`, so the nozzle walls would stop being physical exactly when we
   want the plume to vent off the right edge. Obstruction slabs stay physical
   regardless of the boundary, so the flow is forced through the throat *and*
   the exhaust exits cleanly. Rejected.
2. **Ship all seven as library presets.** Karman (unreliable shedding), Airfoil
   (no real lift), and Pinwheel (static vanes) are evocative-only; exporting
   them as "presets" alongside the faithful ones would imply a physical
   fidelity they don't have. Kept demo-only. Rejected.
3. **A single generic "obstruction maze" preset parameterised by path.** The
   maze's single-channel, no-sealed-pocket topology and zero-dissipation flood
   tuning are bespoke; a generic knob would expose footguns (sealed pockets
   pressure-lock the flood). Kept as a hand-authored demo. Rejected.
4. **Open boundary + obstructions for "real" throughflow.** Physically the most
   intuitive, but ADR-0034's post-hoc masking only routes flow around obstacles
   when the boundary bounces (closed). Open boundary breaks the obstacle. The
   closed-box + injection pattern is the working alternative. Rejected.
