# ADR 0035: Obstruction-based fluid-dynamics presets + demos

**Status:** Accepted
**Date:** 2026-05-28

## Context

ADR-0034 added interior obstructions — arbitrary SVG/text obstacles the fluid
flows around, orthogonal to `containerShape`. That ADR established the
*mechanism*; this ADR records the *content* built on top of it: a set of
fluid-dynamics presets and demos that turn the obstruction primitive into
recognisable physical scenes (a gas flare, a Venturi throat, a river delta, a
maze, a vortex street, and an airfoil).

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
`/docs` routes) and keep **3 demo-only showcases** (in
`src/routes/obstruction-demos/`, not exported, not documented as public API).
The split is honesty-driven: the library presets are physically defensible, the
demos are evocative-only and would mislead if shipped as "presets".

**Library presets:**

- **`GasFlare`** — hot vertical jet through a short flare-stack nozzle.
  Continuous live `flow` source, temperature scalar, and scalar-coupled
  buoyancy.
- **`Venturi`** — Bernoulli throat from two concave islands. A horizontal
  body-force drive acts like a pressure gradient so the inlet is not
  overpainted with velocity, leaving the throat speed-up visible.
- **`RiverDelta`** — flow braiding around five staggered teardrop islands.
  Wide left-edge inlet via persistent live `flow` sources.

**Demo-only showcases** (`src/routes/obstruction-demos/`):

- **`Maze`** — flood-fill through a single-channel maze (`setInterval` inject).
- **`Karman`** — flow past a cylinder, evoking a vortex street (`autoSplat`).
- **`Airfoil`** — streamlines split over/under a cambered body (`setInterval`).

Five of the six set `openBoundary: true` so the flow vents off-canvas; the
**maze** alone uses a closed boundary so it floods and exits only through the
hole. Injection now comes from the declarative `flow` scene API in the
believable-flow presets/demos, with older wrapper timers kept only where a demo
has not been migrated. Every wrapper-side timer or media query is SSR-guarded
(`typeof window`) and reduced-motion-guarded, so a static opening scene remains.

**Deferred:** a Pinwheel/turbine demo should return only after the engine has
rotatable obstructions with explicit axes of rotation and torque/angular
velocity coupling. The removed static-vane version read as a rotor while the
geometry was fixed, which was too easy to misinterpret.

### Honest faithful-vs-evocative ledger

The whole point of the library/demo split is to be honest about which physics
is real. One row per scene:

| Scene | Status | What is / isn't real |
| --- | --- | --- |
| Venturi acceleration | **FAITHFUL** | Incompressible continuity genuinely speeds flow through the throat. |
| Maze flood-fill | **FAITHFUL** | Zero dissipation + single open channel → dye truly floods the one corridor to the exit. |
| RiverDelta branching | **FAITHFUL** | Continuity routes flux through the open channels between islands. |
| GasFlare jet/plume | **QUALITATIVE but solver-native** | The jet, obstruction slot, entrainment, advection, and scalar buoyancy are live incompressible simulation. Combustion chemistry, compressibility, radiation, soot, and heat release are not modeled. |
| Venturi color ramp | **VISUALIZATION** | The blue→red ramp maps velocity magnitude; it is not dye or physical luminance. |
| Karman vortex shedding | **ASPIRATIONAL / unreliable** | Not a validated shedding sim; shedding emerges weakly/intermittently from masked shear layers, frequency is NOT a real Strouhal number, and the look leans on post-hoc masking. |
| Airfoil | **STREAMLINE SPLIT ONLY** | The split over/under the body is real (the mask blocks fluid); there is NO real lift or circulation from post-hoc velocity masking. |

## Consequences

**Positive:**
- Three defensible fluid-dynamics presets join the library as pure `<Fluid>`
  recipes over the ADR-0034 obstruction primitive (which was refined so
  obstruction physics stays active under an open boundary — see ADR-0034).
- The library/demo split keeps the public surface honest: only the faithful (or
  honestly-captioned faithful+evocative) scenes are exported and documented.
- The three demos exercise the obstruction feature across mazes, bluff bodies,
  and airfoils without committing the project to maintaining their
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

1. **Keep the old rocket/de Laval preset name.** A rocket nozzle implies
   compressible flow, choking, shocks, and pressure-driven thrust that this
   incompressible WebGL solver does not compute. Reframing the scene as
   `GasFlare` keeps the hot-plume visual while aligning the claim with a
   solver-native jet, obstruction slot, advection, and buoyancy model. Rejected.
2. **Ship all six as library presets.** Karman (unreliable shedding) and Airfoil
   (no real lift) are evocative-only; exporting
   them as "presets" alongside the faithful ones would imply a physical
   fidelity they don't have. Kept demo-only. Rejected.
3. **A single generic "obstruction maze" preset parameterised by path.** The
   maze's single-channel, no-sealed-pocket topology and zero-dissipation flood
   tuning are bespoke; a generic knob would expose footguns (sealed pockets
   pressure-lock the flood). Kept as a hand-authored demo. Rejected.
4. **Market the scenes as validated CFD.** The obstruction and `flow` APIs make
   the scenes physically legible, but the solver is still a compact visual
   Navier-Stokes approximation with coarse masks and practical sponge outlets.
   Keep the claims scoped to qualitative routing, jets, advection, and
   buoyancy. Rejected.
