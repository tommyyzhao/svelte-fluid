---
'svelte-fluid': minor
---

Add `distortionField: 'pressure' | 'acceleration' | 'velocity'` (also a `FluidDistortion` prop) to choose what pushes a distorted image: pressure bulges it where fluid crowds together and sinks it into the centre of swirls, acceleration moves it only where the flow speeds up, slows or turns, and velocity slides it along the flow. Changing it at runtime recompiles the display shader; acceleration keeps one extra velocity-sized texture while it is active.

Visible default change: the default is `'pressure'`, so `FluidDistortion` and `distortion: true` now warp by pressure. Pass `distortionField="velocity"` to restore the previous look (velocity output is byte-identical). Each field is scaled so the same `distortionPower` looks comparably strong.
