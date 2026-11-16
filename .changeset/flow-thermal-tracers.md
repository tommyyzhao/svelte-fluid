---
'svelte-fluid': minor
---

**New flow options.** All opt-in; omitting them leaves existing scenes and presets as they were.

- `FlowSource.inflow`: relaxes supplied dye and scalar channels toward their target values instead of accumulating them. Unsupplied scalars are kept; velocity stays additive.
- `FlowScalarField`: `diffusivity`, `diffusionIterations`, `wall` (`'insulated'` or `'isothermal'`), `radiativeCooling` and `temperatureRatio` add thermal conduction, optically thin radiative loss and an inlet/ambient temperature ratio.
- `FlowForce` `kind: 'disturbance'`: seeded, spatially correlated acceleration noise over an optional UV `region`. It is rig noise, not turbulence synthesis.
- `FlowVisualization.emission`: temperature-driven salt emission that feeds bloom. Replaces the dye overlay.
- `FlowVisualization.absorption`: Beer–Lambert transmitted dye with three species and a `backlight`. Mutually exclusive with `emission`.
- `FlowConfig.walls: 'no-slip'`: viscous wall shear. Requires nonzero viscosity.
- `FlowConfig.tracers`: passive streak particles for visualization only. Not concentration.
- `FlowOutlet.velocity: 'relax'` with `relaxRate`: relaxes normal velocity toward the section mean while preserving outlet flux. The default `'damp'` is unchanged, and `'damp'` still removes flux.

**Behaviour changes.**

- Large-aspect grids: the grid-size threshold for paired pressure iterations is raised. Those grids keep the same iteration count but may round differently.
- `walls: 'no-slip'` viscosity iterations are paired on the same bounded grid, so results can differ slightly from earlier 1.2.x builds.
- `glass` on an `svgPath` container with WebGL2 and a mask distance field now renders an interior glass cover with beveled edges and refraction. Analytic shapes and the WebGL1 fallback are unchanged. `glassThickness` is now bevel width relative to mask height for SVG covers.
- Shared-host presentation no longer starves when asynchronous snapshots overlap. Completed frames display while newer ones are pending; stale frames cannot overwrite newer ones.

**Fixes.**

- Container and obstruction coverage is applied once after no-slip viscosity, before pressure projection, including paired iterations.
- Thermal and concentration transport no longer crosses thin solid-mask walls. Paths that would are conservatively rejected, including interpolation donors and MacCormack correction.
- Tracer splat draws are bounded to initialized slots during ring warmup.
