---
"svelte-fluid": minor
---

Accessibility defaults.

- `prefers-reduced-motion` is now honoured by every component: `<Fluid>` holds a
  still frame, `FluidReveal` drops its cover so the content shows in full, and
  `FluidStick` / `FluidDistortion` skip auto-animation.
- The `<canvas>` is now `aria-hidden="true"` by default because it is
  decorative. Supplying `aria-label`, `aria-labelledby` or `role` restores
  exposure. **Behaviour change:** consumers who relied on an unlabelled canvas
  being exposed to assistive technology must now label it.
- `FluidText` and `FluidStick` wrappers expose `role="img"` with an
  `aria-label`; `FluidDistortion` forwards `posterAlt`.
- Component prop types now live in `engine/types.ts` and are still exported
  from the package root and each component.
