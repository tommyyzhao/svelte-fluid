# ADR 0033: Expose `backColor` override on preset wrappers

**Status:** Accepted
**Date:** 2026-05-15

## Context

All nine preset wrappers — six stylistic (`LavaLamp`, `Plasma`,
`InkInWater`, `FrozenSwirl`, `Aurora`, `ToroidalTempest`) and three
shape primitives (`CircularFluid`, `FrameFluid`, `AnnularFluid`) —
hardcoded their `backColor` value inside the wrapper's `<Fluid>`
invocation. The hardcoded value was not surfaced through the wrapper's
`Props` type, so consumers had no way to adapt a preset to their page
background without forking the component.

This created a recurring visual mismatch on light- and mid-tone-themed
pages: of the six stylistic presets, five ship near-black backgrounds
and one (`InkInWater`) ships a near-white background, so at any given
page-bg lightness at least one preset would render as a discordant
plate against the host page. Demo pages worked around this by leaning
into the mismatch as a feature ("dark plates", "vinyl singles",
"sticker book") but every workaround was just a re-framing of the same
constraint.

## Decision

Add `'backColor'` to the `Pick<FluidProps, ...>` of each wrapper,
destructure it alongside the existing props, and forward it to the
inner `<Fluid>` via the null-coalescing pattern that preserves the
preset's shipped default when the prop is omitted:

```ts
export type LavaLampProps = Pick<
    FluidProps,
    'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
>;
```

```svelte
<Fluid
  ...
  backColor={backColor ?? { r: 222, g: 218, b: 215 }}
  ...
/>
```

Three lines of change per wrapper, applied uniformly. No behavioural
change for existing callers — when `backColor` is omitted the inner
`<Fluid>` receives the same literal it did before.

## Consequences

- Every preset can be re-coloured per-page without forking. The
  preset's authored splat palette, dissipation, and dye dynamics all
  remain intact; only the empty-canvas substrate adapts.
- Demo routes with non-default page backgrounds (designs 1, 2,
  3-light, 5, 16, 17, 18, 19) pass `backColor={paperColor}` /
  `backColor={surfaceColor}` to each preset wrapper. The "dark plates
  on cream" awkwardness is removed across the design competition.
- The preset's hand-authored `presetSplats` (initial dye scene) still
  reads correctly against the new substrate — splat colours are HDR
  (often >1.0) and dominate the canvas regardless of `backColor`.
- For very bright background colours, some stylistic presets that rely
  on dark-against-bright contrast (e.g. `Plasma`'s near-black backdrop
  selling the magnetic confinement) will read differently. This is by
  design — the consumer opted into the override and is responsible for
  the visual call.

## Alternatives considered

1. **Replace preset wrappers with raw `<Fluid>` calls in each demo** —
   pulls hundreds of lines of preset configuration into demo routes
   and loses the preset's identity as a single import. Rejected.
2. **Spread `...rest` props through each wrapper** — would expose
   every `FluidProps` knob, dissolving the wrapper's "pinned look"
   contract beyond what this single override needs. Rejected as too
   permissive.
3. **Theme-aware default via context** — adding a `<FluidTheme>`
   provider that supplies `backColor` (and possibly other palette
   props) to wrappers within its subtree. Strictly more powerful but
   adds a new public API surface; defer until multiple props need
   theming.

The chosen approach is the minimum additive change that lets a host
page integrate a preset without visual disruption.
