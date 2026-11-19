---
'svelte-fluid': minor
---

Add `FlowSource.pulse` and `FlowSource.dyeCycle` (types `FlowPulse`, `FlowDyeCycle`): an opt-in periodic velocity gain and a wrapping dye colour cycle for a flow source, both clocked by solver time so they pause with the solver and repeat under `deterministicMode`. Hot values; no rebuild when they change.

Visible change: `<TeslaValve />` is now the pulsed flame-salt jet (copper, potassium and sodium emission, cold isothermal walls, glass cover) on white walls in a 3:1 letterbox. What changes for existing users:

- `pointerInput` and `splatOnHover` now default to off. Pass them to turn them back on.
- `class`, `style`, `width` and `height` now apply to the outer frame, which fills its parent, not to the inner `<Fluid>` container.
- GPU cost is higher than before (sim 128, dye 384, pressure 60, bloom and glass); `autoPerformance` sheds pressure iterations on slower GPUs.

To keep the old look, pin `svelte-fluid@1.3` or fork the old recipe from the `v1.3.0` tag.
