---
"svelte-fluid": minor
---

Resolution-normalized `viscosity` and `curl` (Phase 5).

`viscosity` and `curl` are now interpreted with a resolution-anchored gauge so a
given value produces the same look across `simResolution` values. At the default
`simResolution` (128) behavior is unchanged. **If you set a non-default
`simResolution` and tuned `viscosity`/`curl`, the effective diffusion/confinement
will change** (that is the point — it is now resolution-invariant); re-check those
values. The 4 built-in flow presets were re-tuned to preserve their look.

Also: vorticity confinement is now attenuated next to solid boundaries so it no
longer injects momentum into walls and fight the pressure projection — near-wall
vorticity around obstructions/container shapes is slightly reduced versus prior
versions, independent of the new optional `vorticityAdaptive` knob (0 = off).
