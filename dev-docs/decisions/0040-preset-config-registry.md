# ADR 0040: Internal preset config registry (single source of truth)

## Status

Accepted

## Context

The 14 preset wrappers (`LavaLamp`, `Karman`, `Venturi`, …) are hard-coded
`<Fluid>` configurations: each `.svelte` file inlines its pinned props
(scalars plus nested `flow`, `obstructions`, `containerShape`, `presetSplats`,
`obstructionColor`). That was fine while the only consumer was the component
itself.

The demo site now needs the *same* configuration in three other places:

- a per-preset **Show Code** snippet,
- a **View in Playground** action that loads the preset's exact config into the
  interactive playground (faithfully, including Flow scenes and SVG-obstruction
  geometry — not a nearest-scene approximation), and
- **generated agent docs** (`/llms.txt`, `/llms-full.txt`, `/SKILL.md`) that
  describe each preset.

Duplicating the config across the component, the docs page, the playground, and
the agent-docs generator guarantees drift. We also cannot assert equivalence at
test time: the vitest setup has no DOM/component-mount environment (preset tests
import `.svelte?raw` and match source strings), so "does the component render
the documented config?" is not directly checkable.

The only way to make drift *structurally impossible* is to keep exactly one copy
of the data and have every consumer — including the component — read from it.

## Decision

Introduce `src/lib/presets/registry.ts`:

- One serializable `PresetConfig` (`Partial<FluidProps>`) per preset, exported as
  a named const (`LAVA_LAMP_CONFIG`, `KARMAN_CONFIG`, …). This is the canonical
  pinned config — the exact props the wrapper passes to `<Fluid>`, including the
  default `backColor`.
- A `PRESETS` aggregate mapping id → `{ id, name, category, blurb, config }` for
  the demo site and doc generators.

Each preset component imports its own config const and **spreads** it:

```svelte
<Fluid bind:this={inner} {...LAVA_LAMP_CONFIG}
  {width} {height} class={className} {style} {seed} {lazy} {splatOnHover}
  aria-label={ariaLabel}
  backColor={backColor ?? LAVA_LAMP_CONFIG.backColor} />
```

So there is exactly one copy of each preset's data.

Boundaries:

- **Forwarded props** (`width`, `height`, `class`, `style`, `seed`, `lazy`,
  `pointerInput`, `splatOnHover`, `aria-label`, `backColor` override) stay
  component-level — they are per-instance, not part of the preset identity.
- **Runtime behavior** that is not config stays in the component (e.g. Toroidal's
  `onMount` 2 s re-injection interval). The registry captures `<Fluid>` props,
  not imperative side effects.
- **FrameFluid** keeps its forwarded `innerCornerRadius`/`outerCornerRadius` by
  merging them over the registry's base `containerShape`.

The registry is **internal**: it is not re-exported from `src/lib/index.ts`, so
it adds no public API surface and no semver commitment. The file ships in `dist`
(svelte-package publishes all of `src/lib`) but is undocumented. It can be
promoted to a public, documented export later without breaking anyone.

## Consequences

- Show Code, Playground transfer, and agent docs all read the same objects the
  components render. Drift is structurally impossible, not merely discouraged.
- Preset tests assert on registry **data** (`KARMAN_CONFIG.flow.forces[0]…`),
  which is stronger and less brittle than matching source-string fragments.
- Per-preset configs stay tree-shakeable: components import only their own named
  const, and `package.json` already declares `sideEffects: false`, so importing
  one preset does not pull the whole registry.
- One new internal module ships in the package. If we later want a public
  `presets` API, the promotion is additive.
