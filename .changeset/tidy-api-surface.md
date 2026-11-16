---
'svelte-fluid': minor
---

Make API names consistent, fix restored scenes, and correct the docs. Nothing is removed: every old name still works as a `@deprecated` alias until 2.0.

**Wrapper props now share their config-field names.** When you pass both an old and a new name, the new one wins.

- `FluidDistortion`: `strength` → `distortionPower`, `fit` → `distortionFit`, `scale` → `distortionScale`, `autoDistort` → `autoAnimate`, `autoDistortSpeed` → `autoAnimateSpeed`.
- `FluidReveal`: `sensitivity` → `revealSensitivity`, `curve` → `revealCurve`, `autoReveal` → `autoAnimate`, `autoRevealSpeed` → `autoAnimateSpeed`, `coverColor` → `revealCoverColor`, `accentColor` → `revealAccentColor`, `fringeColor` → `revealFringeColor`, `fadeSpeed` → `densityDissipation`.
- `FluidStick`: `strength` → `stickyStrength`, `stickyPressureAmount` → `stickyPressure`, `amplify` → `stickyAmplify`.

**Deprecated root helpers.** `mulberry32`, `randomSeed`, `generateColor`, `HSVtoRGB`, `normalizeColor`, `Rng` and `GetContextOptions` were never documented. They will be removed in 2.0.

**New exports.**

- Types: `ContextProbeAttributes` (the parameter of `isWebGLAvailable`), `Obstruction`, `FlowSourceKind`, `FlowProfile`, `FlowScalarName`, `FlowAdvection`, `FlowVisualizationField`, `FlowTransfer`, and the shared preset prop types `PresetBaseProps` and `InteractivePresetProps`.
- `LiquidSegmented` now accepts fieldset HTML attributes and an `onchange(value)` callback.

**Fix.** Calling `setConfig` with a construct-only field (`seed`, `initialSplatCount*`, `requireHardwareAcceleration`, `advectionScheme`) no longer changes the scene replayed after a WebGL context restore. These fields are now ignored at runtime, as documented.

**`svelte-fluid/experimental`** (no semver promise) gets neutral names. The old names remain as deprecated aliases for one minor.

- Renamed: `Rect` → `CellRect`, `Vec` → `CellVec`, `Counts` → `SpeciesCounts`, `Species` → `LiquidSpecies`, `Wind` → `LiquidWind`, `RenderOptions` → `LiquidRenderOptions`.
- New named types: `LiquidFill`, `LiquidRegion` and `LiquidEmit`.
- Terrain constants are now `Cell.Air` (0) and `Cell.Solid` (1). Values 2..6 are also solid and free for caller tags. `AIR`, `STONE`, `LOAM`, `INK`, `GATE`, `VINE` and `ROOT` are deprecated.
- `SteppedFluidEngine` no longer types `pause`, `resume` or `isPaused`, so it is no longer assignable to `FluidEngine` or `FluidHandle`. Drive it with `advance` and `renderOnce`.
- `Rgb` is deprecated.
- A `LiquidEngine` without float render targets now throws `WebGLUnavailableError` with reason `'no-float-textures'` instead of `'no-webgl'`.

**Docs.**

- Corrected the README claim of "no shared GL state", the prop counts, the browser-support claims and the security note on network requests.
- Removed internal jargon from the public pages.
