---
"svelte-fluid": minor
---

Add the `flow` scene API for persistent sources, edge-drain outlets, scalar fields, forces, prescribed fields, and field-aware visualization. Migrate GasFlare, Venturi, InkInWater, Karman, Airfoil, and the maze demo toward believable flow controls instead of timer-driven splats, and add a TeslaValve preset that demonstrates asymmetric obstruction routing. `flow.boundary` is authoritative per edge, prescribed mode keeps velocity purely prescribed, scalar fields support per-channel dissipation/range/color, velocity visualization supports field ranges and a CFD-style transfer ramp, and line/rect emitters use a batched shader path.
