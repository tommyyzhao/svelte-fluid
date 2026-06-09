# ADR 0035: Obstruction-based fluid-dynamics presets + demos

**Status:** Accepted
**Date:** 2026-05-28

## Context

ADR-0034 added interior obstructions — arbitrary SVG/text obstacles the fluid
flows around, orthogonal to `containerShape`. That ADR established the
*mechanism*; this ADR records the *content* built on top of it: a set of
fluid-dynamics presets and demos that turn the obstruction primitive into
recognisable physical scenes (a gas flare, a Venturi throat, a river delta, a
Tesla valve, a maze, a vortex street, and an airfoil).

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

Ship **4 library presets** (exported from `src/lib/index.ts`, documented in the
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
- **`RiverDelta`** — muted flow braiding around five staggered teardrop islands.
  Wide left-edge inlet via persistent live `flow` source plus constrained
  muted tracer packets from the same edge.
- **`TeslaValve`** — reference SVG conduit with side buckets and even-odd
  internal slots. Live incompressible forward throughflow through a closed SVG
  container, with high-viscosity left-edge multicolor auto-splats and
  bypass-pocket recirculation cues rather than hard-stop valve behavior.

**Demo-only showcases** (`src/routes/obstruction-demos/`):

- **`Maze`** — flood-fill through a single-channel maze using a declarative
  inlet, scalar field, gravity, and a physically open bottom exit.
- **`Karman`** — pressure-driven flow past a cylinder, evoking a vortex street.
- **`Airfoil`** — pressure-driven tracer dye split over/under a cambered body.
  Karman, Airfoil, and RiverDelta keep all canvas edges open and pair that
  with four-edge dye drains so tracer can leave through any border instead of
  collecting at the display frame; velocity damping is reserved for downstream
  outlets.

The throughflow scenes set edge boundaries explicitly through `flow.boundary`.
The **maze** uses physical wall obstructions with an open bottom edge only at
the exit gap, so the outlet is a pressure-open boundary rather than merely a
dye-clearing sponge. Momentum/scalar injection now comes from declarative scene
config in these presets/demos: most use `flow.sources`, while TeslaValve uses
`flow.forces` for throughflow and left-band `autoSplat*` fields for dye packets.
Visual presets such as `InkInWater` should not be converted to `flow` merely
because the API exists; if a preset's identity is intermittent droplet splats,
keep the intermittent auto-splat recipe.

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
| Maze flood-fill | **QUALITATIVE but connected** | Single-channel topology and open bottom exit let scalar/dye reach and drain through the outlet; it is not a free-surface liquid solve. |
| RiverDelta branching | **QUALITATIVE routing** | Continuity routes flux through open channels between islands; it is not sediment transport or a free-surface river. |
| GasFlare jet/plume | **QUALITATIVE but solver-native** | The jet, obstruction slot, entrainment, advection, and scalar buoyancy are live incompressible simulation. Combustion chemistry, compressibility, radiation, soot, and heat release are not modeled. |
| TeslaValve routing | **QUALITATIVE throughflow** | Forward dye throughflow is expected; the preset shows bypass recirculation and separation cues, not one-way shutoff or a measured reverse/forward pressure-drop ratio. |
| Venturi color ramp | **VISUALIZATION** | The blue→red ramp maps velocity magnitude; it is not dye or physical luminance. |
| Karman vortex shedding | **ASPIRATIONAL / unreliable** | Not a validated shedding sim; shedding emerges weakly/intermittently from masked shear layers, frequency is NOT a real Strouhal number, and the look leans on post-hoc masking. |
| Airfoil | **STREAMLINE SPLIT ONLY** | The split over/under the body is real (the mask blocks fluid); there is NO real lift or circulation from post-hoc velocity masking. |

## Consequences

**Positive:**
- Four defensible fluid-dynamics presets join the library as pure `<Fluid>`
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

1. **Ship a rocket-nozzle library preset.** The nozzle idea is attractive,
   but the declarative incompressible-flow version did not meet the visual bar
   and still invited over-reading as rocket/exhaust physics. Removed rather
   than polishing a weak public preset. Rejected.
2. **Ship every obstruction scene as a library preset.** Karman (unreliable
   shedding), Airfoil (no real lift), and Maze (not a free-surface solve) would
   be easy to overinterpret as validated solvers. Kept demo-only. Rejected.
3. **A single generic "obstruction maze" preset parameterised by path.** The
   maze's single-channel, no-sealed-pocket topology and flood-fill
   tuning are bespoke; a generic knob would expose footguns (sealed pockets
   pressure-lock the flood). Kept as a hand-authored demo. Rejected.
4. **Market the scenes as validated CFD.** The obstruction and `flow` APIs make
   the scenes physically legible, but the solver is still a compact visual
   Navier-Stokes approximation with coarse masks and practical sponge outlets.
   Keep the claims scoped to qualitative routing, jets, advection, and
   buoyancy. Rejected.
