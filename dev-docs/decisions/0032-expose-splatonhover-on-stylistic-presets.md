# ADR 0032: Expose `splatOnHover` on stylistic preset wrappers

**Status:** Accepted
**Date:** 2026-05-13

## Context

The library ships ten preset wrappers, split into two families:

- **Shape primitives** — `CircularFluid`, `FrameFluid`, `AnnularFluid`,
  `SvgPathFluid`. Their Props pick `splatOnHover` from `FluidProps` and
  forward it to the inner `<Fluid>`.
- **Stylistic presets** — `LavaLamp`, `Plasma`, `InkInWater`,
  `FrozenSwirl`, `Aurora`, `ToroidalTempest`. Their Props historically
  picked only `width | height | class | style | seed | lazy |
  'aria-label'`. `splatOnHover` was not exposed and not pinned, so it
  defaulted to undefined → false inside the wrapped `<Fluid>`.

The asymmetry meant a consumer could not enable hover-interactive
splatting on `<LavaLamp />` etc. without forking the wrapper or
attaching a manual pointermove handler to a `bind:this={handle}`.
This surfaced when building a demo page where every showcase cell
should respond to cursor movement.

## Decision

Add `'splatOnHover'` to the Pick<> Props type of all six stylistic
preset wrappers, destructure it alongside the existing props, and
forward it to the inner `<Fluid>` invocation via `{splatOnHover}`.

```ts
export type LavaLampProps = Pick<
    FluidProps,
    'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label'
>;
```

This mirrors the shape primitives' API exactly. Three lines of change
per wrapper (Pick type, prop destructure, `<Fluid>` attribute). No
behavioural change for existing callers — when the prop is omitted,
the inner `<Fluid>` receives `undefined`, identical to the prior
behavior.

## Consequences

- All ten preset wrappers now have a uniform "interactive" surface.
- Demo pages (notably `/design13`) can enable hover splatting on
  stylistic presets without imperative wiring.
- The preset's hand-authored `presetSplats` (initial dye scene) remains
  the canonical look; user cursor splatting layers on top.
- Documentation updated in `src/routes/docs/presets/+page.svelte` and
  `src/routes/skills.md/+page.svelte` to remove the "some presets
  also accept splatOnHover" qualifier.

## Alternatives considered

1. **Imperative pointermove handler per cell** — works without library
   changes but adds ~10 lines of state and effects per consumer. Reuse
   gets painful when many presets need it.
2. **Spread `...rest` props through the wrapper** — would allow ANY
   `FluidProps` to be passed, dissolving the wrapper's "pinned look"
   contract. Rejected as too permissive.

The chosen approach is the minimum additive change that aligns the
two preset families' APIs.
