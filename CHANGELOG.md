# Changelog

## 1.0.0

### Major Changes

- [`a170f39`](https://github.com/tommyyzhao/svelte-fluid/commit/a170f39c5ea3386ef6c272ef4e60916aa072662d) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Seven interface primitives are now exported (ADR-0090, 0091/0092, 0094, 0096, 0097). Each is a real native element with a decorative WebGL2 surface. They share one WebGL2 context per page (ADR-0088/0093), so they do not count against the browser's context cap. Without WebGL2 each falls back to a plain, fully styled native control. All honour `prefers-reduced-motion`.

  - `InkPaper`: a `div` of paper that takes watercolour from pointer, touch and pen strokes. Props `paper`, `pigments`, `brush`, `seed`; `data-ink-resist` keeps a child dry, `data-ink-wick` blooms pigment on focus.
  - `LiquidButton`: a native `<button>` with a lit liquid surface that ripples on press.
  - `LiquidSegmented`: a native radio group whose selected option sits on a liquid lens that sloshes across on change.
  - `LiquidDropZone`: a native file picker and drop target with a meniscus along its edge; `accept`, `multiple`, `onfiles`, `announce`.
  - `LiquidCaustics`: caustic light over live content where the user acts; label and body text keep 4.5:1.
  - `LiquidToggle`: a native checkbox `role="switch"` with the existing height-field liquid lens sliding between Off and On. Replaces the removed `FoilSwitch` and its exclusive metal renderer.
  - `EnamelText`: display text in glazed enamel, placed inside your own heading (`<h2><EnamelText text="Harbour" /></h2>`). A press dents the relief and it relaxes; the text stays a selectable native `<span>`. Props `text`, `tone`, `color`; glyph pixels keep 3:1 (large) / 4.5:1 contrast.

  New types: `InkPaperProps`, `InkBrush`, `LiquidButtonProps`, `LiquidSegmentedProps`, `LiquidSegmentedOption`, `LiquidDropZoneProps`, `LiquidCausticsProps`, `LiquidToggleProps`, `EnamelTextProps`, `LiquidTone`. See `/docs/components`.

  Breaking: removes `FoilSwitch`/`FoilSwitchProps`; use `LiquidToggle`/`LiquidToggleProps`. Native checkbox semantics replace the button switch. No metal renderer remains.

- [`287e0bd`](https://github.com/tommyyzhao/svelte-fluid/commit/287e0bd0cb6009e623bb0cddacbef2241a5b15ff) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Remove the internal WebGL types from the public API so every root-exported declaration is GL-type-neutral, and remove the deprecated `ToroidalTempest` alias.

  **Removed** from the `svelte-fluid` root: the types `FBO`, `DoubleFBO`, `ExtInfo` and `ResolvedConfig`. They exposed WebGL handles (`WebGLTexture`, `WebGLFramebuffer`) and the engine's internal SCREAMING_CASE config; they were marked `@deprecated` in 0.8 and no public API returned or accepted them. **Replacement: none.**

  **Migration:** most consumers need no change. Only code that imported these four names (type-only) must drop the import; if you need a config shape, use `FluidConfig` (the camelCase input type, unchanged) and `FluidHandle`.

  **Also removed:** the `ToroidalTempest` component and `ToroidalTempestProps` type (aliases deprecated since 0.4.0). Use `Toroidal` and `ToroidalProps`; they are the same component and type.

  **Also removed:** `FlowSource.samples`, a deprecated hint ignored by the analytic source renderer. Delete the property from source objects; no replacement or runtime change is needed.

  **Signature changes:** `isWebGLAvailable(attributes?)` now takes `{ failIfMajorPerformanceCaveat?: boolean }` instead of `WebGLContextAttributes`. This is wider-compatible for existing callers that passed only that field; a caller that passed a full `WebGLContextAttributes` object literal with other keys now gets an excess-property error (pass only `failIfMajorPerformanceCaveat`). `WebGLUnavailableError`, `WebGLUnavailableReason` and `GetContextOptions` are unchanged and now live in a GL-free module. No runtime behaviour changes.

  `bun run prepack` now compiles a strict consumer against `dist/` and fails if any declaration names a `WebGL*`, `GPU*`, `FBO`, `DoubleFBO`, `ExtInfo`, `ProgramWrap` or `ResolvedConfig` identifier.

### Minor Changes

- [`54055cd`](https://github.com/tommyyzhao/svelte-fluid/commit/54055cdec62a49976eb06a4026706d259e93902e) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Accessibility defaults.

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

- [`5b6206e`](https://github.com/tommyyzhao/svelte-fluid/commit/5b6206ef562d5259c3109435d60c9f1c16f15678) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Display pipeline correctness fixes and opt-in tone mapping (ADR-0081).

  - **Presets look unchanged by default.** Bloom spread, crispness and saturation match 0.8.0.
  - New `toneMapping?: 'none' | 'neutral' | 'agx'` prop, default `'none'` (the 0.8.0 per-channel clip). `'neutral'` (Khronos PBR Neutral) and `'agx'` are opt-in and roll bright dye and bloom off smoothly instead of clipping to white. It is hot-updatable and recompiles only the display program.
  - `backColor` is now exact: dark backgrounds are no longer lifted about 11/255 by gamma-encoded dither noise.
  - Banding is reduced: every output mode (opaque, transparent, reveal, distortion) is now blue-noise dithered, not just bloom.
  - Bloom suppresses single-pixel fireflies (Karis average on the first downsample) at unchanged cost.
  - Transparent, reveal and distortion output is strictly premultiplied, so there is no light fringe over page content.

- [`befc547`](https://github.com/tommyyzhao/svelte-fluid/commit/befc547259ad66f37f979d3201076fa104ffd56b) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Lighting from independently deposited thickness (ADR-0100 supersedes ADR-0087's geometry claim).

  - `shading` now uses the same thickness-derived unit normal as specular/refraction. Pigment RGB, including black, does not determine height. The passive thin layer is not a calibrated free-surface solve. Shaded presets intentionally differ from 0.8.0; no parity or RGB-proxy mode is retained.
  - New opt-in `specular` (0–1): a Fresnel highlight from a studio key light.
  - New opt-in `refraction` (0–1): refracts the distortion image, or the fluid under `glass`.
  - Both default to 0, are hot-updatable, and allocate no extra textures.

- [`c2c5a13`](https://github.com/tommyyzhao/svelte-fluid/commit/c2c5a1340360763d3a1b2f2b400df1c16ff08804) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Replace RGB-derived surface geometry with independent deposited thickness in the existing dye alpha channel. Equal splats, including black pigment, have equal geometry regardless of hue or HDR brightness. Thickness is passively transported and removed with dye, not a calibrated free-surface solve. No additional framebuffer or render pass, public prop or backend selector.

  Shaded appearances intentionally change; exact 0.8.0 shaded parity is not retained. Internal `readField('dye')` RGBA alpha now reports thickness in canvas-height units, not padding or display opacity (a breaking internal-test assumption for the 1.0 transition). Public premultiplied output coverage still derives from pigment/display RGB. Height-exposing optics cannot incorrectly settle solely because RGB is black; arbitrary amplified optics conservatively retain their idle limitation.

- [`32b94e7`](https://github.com/tommyyzhao/svelte-fluid/commit/32b94e759f95c695ab642d9e4a1bea94d084aab3) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Rendering now uses the native device pixel ratio by default (`maxPixelRatio` default `2` → `null`).

  - DPR 3 screens (most phones, some laptops) now get crisp edges instead of an upscaled DPR 2 canvas. DPR 1 and 2 screens are unaffected.
  - Cost: measured on an M1 Max, every preset stays under 2 ms per frame at a full 1440×900 viewport on DPR 3 (worst is GasFlare at 1.76 ms). See `dev-docs/benchmarks/gpu-budget.md`.
  - To keep the old behaviour, pass `maxPixelRatio={2}` to `<Fluid>` or to any wrapper or preset. This is worth doing for full-bleed backgrounds on low-end integrated GPUs.
  - An invalid cap (`0`, a negative number or `NaN`) now falls back to native DPR, the new default, instead of 2.
  - Mounted Fluid canvases follow DPR changes at unchanged fractional CSS dimensions through rearmed resolution media queries; explicit caps remain respected. Without resolution notifications, DPR updates remain CSS-resize-driven; this does not expand legacy browser support or change the reduced-motion listener requirements.

- [`cbb604f`](https://github.com/tommyyzhao/svelte-fluid/commit/cbb604f940312a63818de0bcded70ab9b0d36801) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Pointer Events input (ADR 0083).

  - The engine uses Pointer Events instead of mouse/touch events: pen works
    natively, each touch is tracked per `pointerId`, and fast strokes use
    coalesced events (bounded per frame).
  - A drag that starts on the canvas keeps splatting after leaving it, until
    release (pointer capture).
  - Pen pressure modestly scales splat force (0.5x-1.5x); mouse/touch unchanged.
    `splatOnHover` works for mouse and pen, never touch.
  - **Behaviour change:** `touch-action: none` is no longer set by the component
    stylesheet. The engine applies it only while the canvas owns pointer input
    (`pointerInput` true and `pointerTarget: 'canvas'`). Decorative canvases
    (`pointerInput={false}`) and window-target instances such as
    `FluidBackground` no longer block touch scrolling. Set your own
    `touch-action` if you need different behaviour on an interactive canvas.

- [`d525bc8`](https://github.com/tommyyzhao/svelte-fluid/commit/d525bc885522dbbfaf3b497f0b31aa7be1aa7aa6) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Add opt-in hot `maxFps` presentation control (default `0`, present every frame; set `60` to halve presentation work on high-refresh displays). Simulation, input, automatic splats and wrapper animations keep their existing RAF cadence; only rendering and presentation are capped on faster displays. Paused invalidations, lifecycle first frames, explicit renders and the final settle image bypass the cap.

- [`900e472`](https://github.com/tommyyzhao/svelte-fluid/commit/900e4723d2bc2076b320c10db17158d54414f20c) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Reduced-motion still frame and visible frame failures.

  - Under `prefers-reduced-motion: reduce` every component now advances the
    opening scene a fixed 60 steps, renders one finished frame and stays still
    (no animation loop, no pointer response) instead of freezing raw splats. The
    preference is followed live in both directions.
  - A frame that throws at runtime now calls `onError` once and shows the
    existing fallback with the new `WebGLUnavailableReason` `'render-failed'`; it
    is not retried. `fallback` snippets that switch on `reason` should handle it.

- [`db2f437`](https://github.com/tommyyzhao/svelte-fluid/commit/db2f437289b0b30fe64cb997ea3638aaff8bf9da) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - A visible `<Fluid>` whose fluid has settled stops rendering until the next input.

- [`2b3e079`](https://github.com/tommyyzhao/svelte-fluid/commit/2b3e079867ce0e4acf712ccb6952da2168e14b09) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Pages with many fluid instances no longer lose WebGL contexts: beyond 8 live instances, new ones share one context.

  - The first 8 live WebGL2 instances on a page keep their own context and render exactly as before.
  - Each further instance renders on one shared hidden context with a shared compiled-program cache, and presents to its own canvas. Output is pixel-identical, including transparent and reveal. Measured on an M1 Max: shared instances construct in about 7 ms instead of about 30 ms, and 24 visible instances all stay live (8 were lost before).
  - A shared instance costs about 0.45 ms more GPU per frame at DPR 2 (0.7 ms at DPR 3) to present. A context loss on the shared context pauses all shared instances at once, and they restore automatically.
  - WebGL1 browsers and `requireHardwareAcceleration` always keep a context per canvas.

- [`ae7de67`](https://github.com/tommyyzhao/svelte-fluid/commit/ae7de6725620b5d8dee9191c845e131b825e77d2) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - WCAG contrast floor and FluidText halo.

  Text masks use an outline halo by default; other displays retain the floor.

  - New `minContrast` / `contrastColor` config: the display pass lifts or darkens
    any pixel whose contrast against the reference colour is below the ratio.
    Off by default, so the 0.8.0 look is unchanged. Pixels already passing are
    untouched; without a `contrastColor` the correction does nothing.
  - `FluidText` now defaults to `minContrast={4.5}` (AA for all text sizes) against the
    page colour (measured via a 1x1 canvas: oklch/lab/alpha safe; gradients need `contrastColor`), using a ~1.5 CSS px SDF halo (WCAG border technique). Interior dye stays
    unchanged, WebGL1 included (halo from the coverage mask). Pass `minContrast={1}` to restore the previous output, or `3` for
    large text. **Behaviour change**: a thin outline around `FluidText` letterforms.
  - `FluidBackground` accepts `minContrast`; the reference is the content's text
    colour unless `contrastColor` is set.
  - Docs describe the guarantee and what stays with the consumer (FluidReveal
    cover, glass reflections, text colour changes at runtime).

### Patch Changes

- [`e325e9a`](https://github.com/tommyyzhao/svelte-fluid/commit/e325e9a4817b40556bfd8631364a5d569d194070) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Agent docs (`/llms-full.txt`, `/SKILL.md`) now include a complete typed prop reference generated from the public types, per-component accepted props, typed handle patterns for TypeScript and strict JavaScript, and structured config types. Measured on the ADR 0107 E3 eval: held-out integration pass rate rose from 33% to 67% (Haiku) and 61% to 100% (Sonnet).

- [`6bfdfcf`](https://github.com/tommyyzhao/svelte-fluid/commit/6bfdfcfda902409b455bdaeeb929e9e2392be134) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Stop stationary deposited layers only when an inert solver and exactly zero velocity prove identity transport. Preserve raw-field validity, conservative unproven-mode exclusions, staged float/byte probes and input/config wake behavior.

- [`8cdf74f`](https://github.com/tommyyzhao/svelte-fluid/commit/8cdf74fa474ba89b6cc334033b14995f04579568) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Crisper mask edges at high DPR (ADR-0084).

  - Container shapes, SVG/text masks and obstructions now anti-alias over about one device pixel at any pixel ratio. Before, the soft edge was a fixed fraction of the canvas and grew to 4–18 px at DPR 3.
  - SVG path, text and obstruction masks get their edges from a GPU jump-flood signed distance field (WebGL2). WebGL1 keeps the previous bilinear mask edge.
  - No API or prop changes. Physics, spawning and glass are unchanged.

- [`afd0336`](https://github.com/tommyyzhao/svelte-fluid/commit/afd033679e027f24f1be5d87c9ac4b7efffa69c5) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - `Karman` preset GPU cost cut from ~4-11 ms to under 2 ms per frame (M1 Max, DPR 1-3). It now runs one 1/60 s solver step per frame instead of two 1/120 s substeps; outlet clearing, wall friction and the pressure-gradient drive are retuned so the inflow speed, streak brightness and vortex street look the same.

- [`1ee0a91`](https://github.com/tommyyzhao/svelte-fluid/commit/1ee0a91751baead3bba696b447b8c6c7e00d801f) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Fix: opening random splats in small container shapes (e.g. a circle on a wide canvas) are no longer occasionally dropped, so a masked scene no longer sometimes opens empty for certain seeds.

## 1.0.0-rc.0

### Major Changes

- [`a170f39`](https://github.com/tommyyzhao/svelte-fluid/commit/a170f39c5ea3386ef6c272ef4e60916aa072662d) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Seven interface primitives are now exported (ADR-0090, 0091/0092, 0094, 0096, 0097). Each is a real native element with a decorative WebGL2 surface. They share one WebGL2 context per page (ADR-0088/0093), so they do not count against the browser's context cap. Without WebGL2 each falls back to a plain, fully styled native control. All honour `prefers-reduced-motion`.

  - `InkPaper`: a `div` of paper that takes watercolour from pointer, touch and pen strokes. Props `paper`, `pigments`, `brush`, `seed`; `data-ink-resist` keeps a child dry, `data-ink-wick` blooms pigment on focus.
  - `LiquidButton`: a native `<button>` with a lit liquid surface that ripples on press.
  - `LiquidSegmented`: a native radio group whose selected option sits on a liquid lens that sloshes across on change.
  - `LiquidDropZone`: a native file picker and drop target with a meniscus along its edge; `accept`, `multiple`, `onfiles`, `announce`.
  - `LiquidCaustics`: caustic light over live content where the user acts; label and body text keep 4.5:1.
  - `LiquidToggle`: a native checkbox `role="switch"` with the existing height-field liquid lens sliding between Off and On. Replaces the removed `FoilSwitch` and its exclusive metal renderer.
  - `EnamelText`: display text in glazed enamel, placed inside your own heading (`<h2><EnamelText text="Harbour" /></h2>`). A press dents the relief and it relaxes; the text stays a selectable native `<span>`. Props `text`, `tone`, `color`; glyph pixels keep 3:1 (large) / 4.5:1 contrast.

  New types: `InkPaperProps`, `InkBrush`, `LiquidButtonProps`, `LiquidSegmentedProps`, `LiquidSegmentedOption`, `LiquidDropZoneProps`, `LiquidCausticsProps`, `LiquidToggleProps`, `EnamelTextProps`, `LiquidTone`. See `/docs/components`.

  Breaking: removes `FoilSwitch`/`FoilSwitchProps`; use `LiquidToggle`/`LiquidToggleProps`. Native checkbox semantics replace the button switch. No metal renderer remains.

- [`287e0bd`](https://github.com/tommyyzhao/svelte-fluid/commit/287e0bd0cb6009e623bb0cddacbef2241a5b15ff) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Remove the internal WebGL types from the public API so every root-exported declaration is GL-type-neutral, and remove the deprecated `ToroidalTempest` alias.

  **Removed** from the `svelte-fluid` root: the types `FBO`, `DoubleFBO`, `ExtInfo` and `ResolvedConfig`. They exposed WebGL handles (`WebGLTexture`, `WebGLFramebuffer`) and the engine's internal SCREAMING_CASE config; they were marked `@deprecated` in 0.8 and no public API returned or accepted them. **Replacement: none.**

  **Migration:** most consumers need no change. Only code that imported these four names (type-only) must drop the import; if you need a config shape, use `FluidConfig` (the camelCase input type, unchanged) and `FluidHandle`.

  **Also removed:** the `ToroidalTempest` component and `ToroidalTempestProps` type (aliases deprecated since 0.4.0). Use `Toroidal` and `ToroidalProps`; they are the same component and type.

  **Also removed:** `FlowSource.samples`, a deprecated hint ignored by the analytic source renderer. Delete the property from source objects; no replacement or runtime change is needed.

  **Signature changes:** `isWebGLAvailable(attributes?)` now takes `{ failIfMajorPerformanceCaveat?: boolean }` instead of `WebGLContextAttributes`. This is wider-compatible for existing callers that passed only that field; a caller that passed a full `WebGLContextAttributes` object literal with other keys now gets an excess-property error (pass only `failIfMajorPerformanceCaveat`). `WebGLUnavailableError`, `WebGLUnavailableReason` and `GetContextOptions` are unchanged and now live in a GL-free module. No runtime behaviour changes.

  `bun run prepack` now compiles a strict consumer against `dist/` and fails if any declaration names a `WebGL*`, `GPU*`, `FBO`, `DoubleFBO`, `ExtInfo`, `ProgramWrap` or `ResolvedConfig` identifier.

### Minor Changes

- [`54055cd`](https://github.com/tommyyzhao/svelte-fluid/commit/54055cdec62a49976eb06a4026706d259e93902e) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Accessibility defaults.

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

- [`5b6206e`](https://github.com/tommyyzhao/svelte-fluid/commit/5b6206ef562d5259c3109435d60c9f1c16f15678) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Display pipeline correctness fixes and opt-in tone mapping (ADR-0081).

  - **Presets look unchanged by default.** Bloom spread, crispness and saturation match 0.8.0.
  - New `toneMapping?: 'none' | 'neutral' | 'agx'` prop, default `'none'` (the 0.8.0 per-channel clip). `'neutral'` (Khronos PBR Neutral) and `'agx'` are opt-in and roll bright dye and bloom off smoothly instead of clipping to white. It is hot-updatable and recompiles only the display program.
  - `backColor` is now exact: dark backgrounds are no longer lifted about 11/255 by gamma-encoded dither noise.
  - Banding is reduced: every output mode (opaque, transparent, reveal, distortion) is now blue-noise dithered, not just bloom.
  - Bloom suppresses single-pixel fireflies (Karis average on the first downsample) at unchanged cost.
  - Transparent, reveal and distortion output is strictly premultiplied, so there is no light fringe over page content.

- [`befc547`](https://github.com/tommyyzhao/svelte-fluid/commit/befc547259ad66f37f979d3201076fa104ffd56b) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Lighting from independently deposited thickness (ADR-0100 supersedes ADR-0087's geometry claim).

  - `shading` now uses the same thickness-derived unit normal as specular/refraction. Pigment RGB, including black, does not determine height. The passive thin layer is not a calibrated free-surface solve. Shaded presets intentionally differ from 0.8.0; no parity or RGB-proxy mode is retained.
  - New opt-in `specular` (0–1): a Fresnel highlight from a studio key light.
  - New opt-in `refraction` (0–1): refracts the distortion image, or the fluid under `glass`.
  - Both default to 0, are hot-updatable, and allocate no extra textures.

- [`c2c5a13`](https://github.com/tommyyzhao/svelte-fluid/commit/c2c5a1340360763d3a1b2f2b400df1c16ff08804) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Replace RGB-derived surface geometry with independent deposited thickness in the existing dye alpha channel. Equal splats, including black pigment, have equal geometry regardless of hue or HDR brightness. Thickness is passively transported and removed with dye, not a calibrated free-surface solve. No additional framebuffer or render pass, public prop or backend selector.

  Shaded appearances intentionally change; exact 0.8.0 shaded parity is not retained. Internal `readField('dye')` RGBA alpha now reports thickness in canvas-height units, not padding or display opacity (a breaking internal-test assumption for the 1.0 transition). Public premultiplied output coverage still derives from pigment/display RGB. Height-exposing optics cannot incorrectly settle solely because RGB is black; arbitrary amplified optics conservatively retain their idle limitation.

- [`32b94e7`](https://github.com/tommyyzhao/svelte-fluid/commit/32b94e759f95c695ab642d9e4a1bea94d084aab3) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Rendering now uses the native device pixel ratio by default (`maxPixelRatio` default `2` → `null`).

  - DPR 3 screens (most phones, some laptops) now get crisp edges instead of an upscaled DPR 2 canvas. DPR 1 and 2 screens are unaffected.
  - Cost: measured on an M1 Max, every preset stays under 2 ms per frame at a full 1440×900 viewport on DPR 3 (worst is GasFlare at 1.76 ms). See `dev-docs/benchmarks/gpu-budget.md`.
  - To keep the old behaviour, pass `maxPixelRatio={2}` to `<Fluid>` or to any wrapper or preset. This is worth doing for full-bleed backgrounds on low-end integrated GPUs.
  - An invalid cap (`0`, a negative number or `NaN`) now falls back to native DPR, the new default, instead of 2.
  - Mounted Fluid canvases follow DPR changes at unchanged fractional CSS dimensions through rearmed resolution media queries; explicit caps remain respected. Without resolution notifications, DPR updates remain CSS-resize-driven; this does not expand legacy browser support or change the reduced-motion listener requirements.

- [`cbb604f`](https://github.com/tommyyzhao/svelte-fluid/commit/cbb604f940312a63818de0bcded70ab9b0d36801) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Pointer Events input (ADR 0083).

  - The engine uses Pointer Events instead of mouse/touch events: pen works
    natively, each touch is tracked per `pointerId`, and fast strokes use
    coalesced events (bounded per frame).
  - A drag that starts on the canvas keeps splatting after leaving it, until
    release (pointer capture).
  - Pen pressure modestly scales splat force (0.5x-1.5x); mouse/touch unchanged.
    `splatOnHover` works for mouse and pen, never touch.
  - **Behaviour change:** `touch-action: none` is no longer set by the component
    stylesheet. The engine applies it only while the canvas owns pointer input
    (`pointerInput` true and `pointerTarget: 'canvas'`). Decorative canvases
    (`pointerInput={false}`) and window-target instances such as
    `FluidBackground` no longer block touch scrolling. Set your own
    `touch-action` if you need different behaviour on an interactive canvas.

- [`d525bc8`](https://github.com/tommyyzhao/svelte-fluid/commit/d525bc885522dbbfaf3b497f0b31aa7be1aa7aa6) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Add opt-in hot `maxFps` presentation control (default `0`, present every frame; set `60` to halve presentation work on high-refresh displays). Simulation, input, automatic splats and wrapper animations keep their existing RAF cadence; only rendering and presentation are capped on faster displays. Paused invalidations, lifecycle first frames, explicit renders and the final settle image bypass the cap.

- [`900e472`](https://github.com/tommyyzhao/svelte-fluid/commit/900e4723d2bc2076b320c10db17158d54414f20c) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Reduced-motion still frame and visible frame failures.

  - Under `prefers-reduced-motion: reduce` every component now advances the
    opening scene a fixed 60 steps, renders one finished frame and stays still
    (no animation loop, no pointer response) instead of freezing raw splats. The
    preference is followed live in both directions.
  - A frame that throws at runtime now calls `onError` once and shows the
    existing fallback with the new `WebGLUnavailableReason` `'render-failed'`; it
    is not retried. `fallback` snippets that switch on `reason` should handle it.

- [`db2f437`](https://github.com/tommyyzhao/svelte-fluid/commit/db2f437289b0b30fe64cb997ea3638aaff8bf9da) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - A visible `<Fluid>` whose fluid has settled stops rendering until the next input.

- [`2b3e079`](https://github.com/tommyyzhao/svelte-fluid/commit/2b3e079867ce0e4acf712ccb6952da2168e14b09) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Pages with many fluid instances no longer lose WebGL contexts: beyond 8 live instances, new ones share one context.

  - The first 8 live WebGL2 instances on a page keep their own context and render exactly as before.
  - Each further instance renders on one shared hidden context with a shared compiled-program cache, and presents to its own canvas. Output is pixel-identical, including transparent and reveal. Measured on an M1 Max: shared instances construct in about 7 ms instead of about 30 ms, and 24 visible instances all stay live (8 were lost before).
  - A shared instance costs about 0.45 ms more GPU per frame at DPR 2 (0.7 ms at DPR 3) to present. A context loss on the shared context pauses all shared instances at once, and they restore automatically.
  - WebGL1 browsers and `requireHardwareAcceleration` always keep a context per canvas.

- [`ae7de67`](https://github.com/tommyyzhao/svelte-fluid/commit/ae7de6725620b5d8dee9191c845e131b825e77d2) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - WCAG contrast floor and FluidText halo.

  Text masks use an outline halo by default; other displays retain the floor.

  - New `minContrast` / `contrastColor` config: the display pass lifts or darkens
    any pixel whose contrast against the reference colour is below the ratio.
    Off by default, so the 0.8.0 look is unchanged. Pixels already passing are
    untouched; without a `contrastColor` the correction does nothing.
  - `FluidText` now defaults to `minContrast={4.5}` (AA for all text sizes) against the
    page colour (measured via a 1x1 canvas: oklch/lab/alpha safe; gradients need `contrastColor`), using a ~1.5 CSS px SDF halo (WCAG border technique). Interior dye stays
    unchanged, WebGL1 included (halo from the coverage mask). Pass `minContrast={1}` to restore the previous output, or `3` for
    large text. **Behaviour change**: a thin outline around `FluidText` letterforms.
  - `FluidBackground` accepts `minContrast`; the reference is the content's text
    colour unless `contrastColor` is set.
  - Docs describe the guarantee and what stays with the consumer (FluidReveal
    cover, glass reflections, text colour changes at runtime).

### Patch Changes

- [`e325e9a`](https://github.com/tommyyzhao/svelte-fluid/commit/e325e9a4817b40556bfd8631364a5d569d194070) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Agent docs (`/llms-full.txt`, `/SKILL.md`) now include a complete typed prop reference generated from the public types, per-component accepted props, typed handle patterns for TypeScript and strict JavaScript, and structured config types. Measured on the ADR 0107 E3 eval: held-out integration pass rate rose from 33% to 67% (Haiku) and 61% to 100% (Sonnet).

- [`6bfdfcf`](https://github.com/tommyyzhao/svelte-fluid/commit/6bfdfcfda902409b455bdaeeb929e9e2392be134) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Stop stationary deposited layers only when an inert solver and exactly zero velocity prove identity transport. Preserve raw-field validity, conservative unproven-mode exclusions, staged float/byte probes and input/config wake behavior.

- [`8cdf74f`](https://github.com/tommyyzhao/svelte-fluid/commit/8cdf74fa474ba89b6cc334033b14995f04579568) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Crisper mask edges at high DPR (ADR-0084).

  - Container shapes, SVG/text masks and obstructions now anti-alias over about one device pixel at any pixel ratio. Before, the soft edge was a fixed fraction of the canvas and grew to 4–18 px at DPR 3.
  - SVG path, text and obstruction masks get their edges from a GPU jump-flood signed distance field (WebGL2). WebGL1 keeps the previous bilinear mask edge.
  - No API or prop changes. Physics, spawning and glass are unchanged.

- [`afd0336`](https://github.com/tommyyzhao/svelte-fluid/commit/afd033679e027f24f1be5d87c9ac4b7efffa69c5) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - `Karman` preset GPU cost cut from ~4-11 ms to under 2 ms per frame (M1 Max, DPR 1-3). It now runs one 1/60 s solver step per frame instead of two 1/120 s substeps; outlet clearing, wall friction and the pressure-gradient drive are retuned so the inflow speed, streak brightness and vortex street look the same.

- [`1ee0a91`](https://github.com/tommyyzhao/svelte-fluid/commit/1ee0a91751baead3bba696b447b8c6c7e00d801f) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Fix: opening random splats in small container shapes (e.g. a circle on a wide canvas) are no longer occasionally dropped, so a masked scene no longer sometimes opens empty for certain seeds.

## 0.8.0

### Minor Changes

- [`0b1a131`](https://github.com/tommyyzhao/svelte-fluid/commit/0b1a1315a9c538a4ae01c90ccdd660e9bd4b926a) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Add `maxPixelRatio` to `<Fluid>` and wrapper component props. Physical canvas
  DPR now defaults to a maximum of 2 to reduce high-DPR framebuffer memory and
  fill rate; pass `maxPixelRatio={null}` to retain native device DPR. Small-canvas
  quality tiers now depend on CSS size rather than physical DPR, so the same
  layout selects consistent effects and iteration defaults across displays.

- [`7b9cdd2`](https://github.com/tommyyzhao/svelte-fluid/commit/7b9cdd2d0f5b72068239d741202a258f106fadde) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Component lifecycle and quality-policy fixes.

  - `<Fluid>` gains `onReady` (engine constructed, first frame scheduled) and
    `onError` (engine construction failed; receives the `WebGLUnavailableError`
    or other init error). Consumer callbacks that throw are caught and logged
    instead of breaking startup.
  - `fallback`, `poster`, `posterAlt`, `fallbackText`, `onReady` and `onError` are
    now typed and forwarded by `FluidBackground`, `FluidDistortion`, `FluidReveal`,
    `FluidStick` and `FluidText`. `FluidDistortion` defaults `poster` to `src`.
  - Fix: bloom, sunrays, `bloomIterations` and `pressureIterations` no longer stay
    forced off/reduced after a small canvas grows past the 600 CSS px threshold.
  - `FluidDistortion`: opening splats are seeded from `seed` (reproducible, capped
    at 64); `autoDistort` waits for the engine, no longer jumps after pause/resume,
    and now honours `autoDistortSpeed`.
  - `autoPause` now keeps a `<Fluid>` created in an already-hidden tab paused until
    the tab becomes visible.

- [`caf6fdc`](https://github.com/tommyyzhao/svelte-fluid/commit/caf6fdcc5d4a8ae4620ae4dc5ef8077c939b8007) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Engine robustness:

  - `randomSplats(count)` is bounded: at most 64 random splats are retained and
    16 run per frame, so large or repeated requests spread over a few frames
    instead of stalling one. `initialSplatCount*` clamp to 0–64 and
    `autoSplatCount` to 0–16.
  - `splat()` calls with `NaN`/`Infinity` arguments, and non-finite numeric or
    color props, are ignored with a single `console.warn` instead of corrupting
    the simulation. Previous prop values are kept.
  - All Fluid instances on a page now share one `requestAnimationFrame`. If one
    instance throws during a frame it is stopped (`isPaused` becomes `true`,
    one `console.error`) while other instances keep rendering.
  - Sticky-mask `blur` is now O(pixels) with at most three passes and a radius
    cap of 64. Radii up to 6 (including FluidStick's default) produce identical
    masks; larger radii are visually equivalent and no longer freeze the page.
  - Flow sources with `rate: 0` or zero payload, zero-vector or zero-strength
    forces, and empty prescribed grids no longer keep an otherwise empty scene's
    solver awake.
  - `FBO`, `DoubleFBO`, `ExtInfo` and `ResolvedConfig` type exports are
    deprecated; they will be removed from the public API in 1.0.

- [`e771df8`](https://github.com/tommyyzhao/svelte-fluid/commit/e771df86a39293423b58d1b5b4faef1bc9908a27) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Opt-in frame-time governor (`autoPerformance`).

  New `autoPerformance` config field (default `false`). When enabled, an EMA of
  real RAF frame time drives a hysteretic quality shed above the explicit
  `autoPerformanceTargetFrameMs` budget (default `1000 / 60`) under sustained load:
  pressure iterations first, then solver substeps, bounded by
  `autoPerformanceMinPressureIterations` (default 8) and
  `autoPerformanceMinSubsteps` (default 1). It never auto-restores quality once
  shed — call `setConfig()` explicitly to raise it again — and it is ignored
  during deterministic `advance()` harness runs, so seeded/readback tests stay
  byte-identical regardless of this setting.

  Requested pressure iterations and substeps remain distinct from the governor's
  effective shed values. As a result, shedding substeps no longer reduces the
  accepted wall-clock simulation delta and cannot slow simulation time.

  New pull-based `FluidHandle.getPerformanceState(): PerformanceState` (mirrors
  `isPaused`; no events). New exported types `PerformanceState`,
  `PerformanceTier`, `PerformanceAction`.

- [`e771df8`](https://github.com/tommyyzhao/svelte-fluid/commit/e771df86a39293423b58d1b5b4faef1bc9908a27) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Public `advectionScheme` config field.

  Promotes the previously-internal MacCormack velocity advection switch to a
  public, construct-only `FluidConfig` field:
  `advectionScheme?: 'semilagrangian' | 'maccormack'` (default `'semilagrangian'`).
  `'maccormack'` gives crisper second-order velocity advection for flow/structured
  scenes, but can look angular or "cubey" on diffuse decorative dye, so it is
  opt-in and unset by every built-in preset. Devices without linear-filtering
  support are capability-gated back to `'semilagrangian'` automatically. This is
  a construct-only (Bucket D) field — `setConfig()` ignores runtime changes to it.

  No built-in preset changes behavior: every preset still resolves to
  `'semilagrangian'`, confirmed by a registry invariant test.

  Near physical solids and open edges, MacCormack now conservatively falls back
  to first-order advection whenever either departure path or its limiter stencil
  could cross a blocked cell. This prevents the correction pass from increasing
  thin-wall leakage relative to semi-Lagrangian advection.

- [`ed33820`](https://github.com/tommyyzhao/svelte-fluid/commit/ed33820330158a1e20ecf0cd9c161b4d5e6866fe) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Resolution-normalized `viscosity` and `curl` (Phase 5).

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

  The `vorticityAdaptive` threshold band now uses the same reference-resolution
  gauge. Equivalent vortices therefore enter its low/transition/high regions at
  the same physical strength from `simResolution` 64 through 256; resolution 128
  remains unchanged.

### Patch Changes

- [`f053120`](https://github.com/tommyyzhao/svelte-fluid/commit/f05312034ddd4b0f13f0afbec22b31b3a5056498) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Fix WebGL context restoration so every GPU resource is freshly recreated and
  the seeded random plus configured preset opening splats replay exactly once.
  Also avoid allocating the glass scene framebuffer twice during construction and
  restoration.

- [`555308f`](https://github.com/tommyyzhao/svelte-fluid/commit/555308f97bbf35aaaa1433e8c4d421661b3b3a4a) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Refresh npm description and keywords (cursor, splash, splash-cursor).

## 0.7.0

### Minor Changes

- [#12](https://github.com/tommyyzhao/svelte-fluid/pull/12) [`ae97c65`](https://github.com/tommyyzhao/svelte-fluid/commit/ae97c65b506c2730c2c656eec0d3057e071a1ae8) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Add a graceful, accessible fallback when WebGL is unavailable (ADR-0041).
  Previously a browser without usable WebGL degraded to a silent blank canvas.
  `<Fluid>` (and every component/preset that wraps it) now renders, in order of
  preference, a `fallback` snippet, a `poster` image, or a `backColor`-filled box
  with a visually-hidden message — and never crashes the host page. New props:
  `fallback`, `poster`, `posterAlt`, `fallbackText`, and `requireHardwareAcceleration`
  (opt-in; rejects a software-only renderer via `failIfMajorPerformanceCaveat`).

  Permanent failures (no WebGL / no half-float textures) show the fallback;
  transient ones (hitting the browser's live-context cap on a dense `lazy` page)
  stay blank and retry on the next reconcile. New public exports: `isWebGLAvailable()`,
  `WebGLUnavailableError`, `WebGLUnavailableReason`, and `GetContextOptions`.
  `getWebGLContext` now throws a typed `WebGLUnavailableError` instead of a generic
  `Error`.

## 0.6.0

### Minor Changes

- [`778d4c1`](https://github.com/tommyyzhao/svelte-fluid/commit/778d4c10c992667fd4554ff729f4c36b76a593d8) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - New `obstructionColor` config: paint obstruction footprints in a solid
  color in the display pass (0–255 RGB, `backColor` convention; `null`
  keeps the legacy background-colored silhouette). Anti-aliased edges come
  free from the rasterized mask. See ADR-0039.

  Karman preset reworked to genuine flow: the autosplat tracer packets are
  replaced by a rake of six persistent streakline point sources (one hue
  each, injecting dye and velocity every frame — the classic wind-tunnel
  smoke-rake), and the cylinder is now painted slate via
  `obstructionColor` so the bluff body is clearly visible against the
  scene background.

## 0.5.0

### Minor Changes

- [`8d71269`](https://github.com/tommyyzhao/svelte-fluid/commit/8d712692798988bef2ba4c61f687a00f5fff4f13) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Replace the `RiverDelta` preset with `Karman` — a calibrated von Kármán
  vortex street: a pressure-gradient drive past a single off-center
  cylinder (fit-to-canvas obstruction mask), four-edge dye drains, a
  high-fidelity solver configuration (1/120 step × 2 substeps, 34 pressure
  iterations, 192 sim / 1024 dye resolution), and fast multicolor tracer
  packets (fresh generated hue per packet) that render successive
  sheddings as distinct colored filaments. `RiverDelta` and
  `RiverDeltaProps` are removed; `Karman` accepts the same wrapper props
  (including `pointerInput`/`splatOnHover`, both on by default).

## 0.4.0

### Minor Changes

- [`1b7ae40`](https://github.com/tommyyzhao/svelte-fluid/commit/1b7ae40ce7b836d89df37ebf85fa1cb05ebd19b7) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Rename the `ToroidalTempest` preset to `Toroidal` (exported as `Toroidal`
  with `ToroidalProps`). The old `ToroidalTempest` / `ToroidalTempestProps`
  names remain available as deprecated aliases of the same component and
  will be removed at 1.0.

## 0.3.0

### Minor Changes

- [`4b7daa8`](https://github.com/tommyyzhao/svelte-fluid/commit/4b7daa8a94b5e9f997dc88e88ab2dbb63995f87a) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Expose `backColor` as an optional override on every preset wrapper —
  the six stylistic ones (`LavaLamp`, `Plasma`, `InkInWater`,
  `FrozenSwirl`, `Aurora`, `ToroidalTempest`) and the four shape ones
  (`CircularFluid`, `FrameFluid`, `AnnularFluid`, `SvgPathFluid`). Each wrapper still
  ships its authored default; passing `backColor={{ r, g, b }}` (0–255)
  overrides only the empty-canvas substrate so the preset adapts to its
  host page. The preset's splat palette, dissipation, and dye dynamics
  are unchanged. Additive: omitting the prop preserves prior behavior.
  See ADR-0033.

- [`e0da8d8`](https://github.com/tommyyzhao/svelte-fluid/commit/e0da8d8aeb08d99856c524c6388861036db5d39d) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Add the `flow` scene API for persistent sources, edge-drain outlets, scalar fields, forces, prescribed fields, and field-aware visualization. Migrate GasFlare, Venturi, Karman, Airfoil, RiverDelta, and the maze demo toward believable flow controls instead of timer-driven loops or overpainted source bands, and add a TeslaValve preset that demonstrates forward throughflow with bypass-pocket recirculation cues. `flow.boundary` is authoritative per edge, prescribed mode keeps velocity purely prescribed, scalar fields support per-channel dissipation/range/color, velocity visualization supports field ranges and a CFD-style transfer ramp, line/rect emitters and outlet drains use batched shader paths, and the solver now uses a combined binary solid mask for container and obstruction boundaries. Flow scenes avoid redundant dye/scalar outlet passes, skip empty dye advection/post-processing, composite opaque backgrounds in the display shader, suppress field overlays at SVG-container seams, and use four-edge dye drains where tracer dye should leave open borders instead of collecting at the frame. Automatic splats also gain `autoSplatCenterX` and `autoSplatBandWidth` so presets can declaratively spawn inlet plumes from left or right bands without component-local timers. InkInWater stays on its original intermittent droplet auto-splat recipe because that visual preset is not a throughflow scene. The homepage playground now includes solver/fidelity controls, auto-splat placement controls, and a compact custom `FlowConfig` editor while the docs and demo page surface all 14 exported presets.

- [`9e24f2c`](https://github.com/tommyyzhao/svelte-fluid/commit/9e24f2c399b032ca608a937842be8667f2943c53) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Add interior obstructions — arbitrary SVG-path/text obstacles the fluid flows
  around, orthogonal to `containerShape`. New `obstructions: Obstruction[]` config
  field; all obstructions union into one combined mask and the allowed fluid
  region becomes `container × (1 − obstruction)`. Each `Obstruction` supports
  `offset`/`scale` placement and a `fit: 'contain' | 'fill'` mode (`'fill'`
  stretches geometry to span the canvas at any aspect — for maze/nozzle channels).
  Obstruction physics stays active even under `openBoundary` (a solid obstacle
  blocks flow regardless of the canvas edges). See ADR-0034.

- [`9e24f2c`](https://github.com/tommyyzhao/svelte-fluid/commit/9e24f2c399b032ca608a937842be8667f2943c53) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Add GasFlare, Venturi, RiverDelta, and TeslaValve presets — qualitative flow demos built on interior obstructions, SVG-path containers, and the flow scene API. RiverDelta and Karman use constrained tracer packets rather than persistent painted bands, and TeslaValve uses high viscosity plus left-edge multicolor auto-splats to make forward throughflow and loop mixing more legible without implying hard-stop valve behavior.

- [`28452fb`](https://github.com/tommyyzhao/svelte-fluid/commit/28452fb8091a0319730194e118e4087db8cc8bbc) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Expose `splatOnHover` on all six stylistic preset wrappers — `LavaLamp`,
  `Plasma`, `InkInWater`, `FrozenSwirl`, `Aurora`, `ToroidalTempest` — so
  they match the shape preset wrappers (`CircularFluid`, `FrameFluid`,
  `AnnularFluid`, `SvgPathFluid`) which already accept the prop. Additive:
  omitting it preserves the existing default behavior (no hover splatting).
  See ADR-0032.

### Patch Changes

- [`9e24f2c`](https://github.com/tommyyzhao/svelte-fluid/commit/9e24f2c399b032ca608a937842be8667f2943c53) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Fix several `FluidConfig` props that were never forwarded from the `Fluid`
  component to the engine: `revealAccentColor` and `revealFringeColor` (reveal
  fringe colors) had no effect when set, and the new `obstructions` prop was
  inert. All are now wired through `buildConfig()`. Added a source-level guard
  test asserting every `FluidConfig` field reaches the engine.

- [`5a61387`](https://github.com/tommyyzhao/svelte-fluid/commit/5a6138775fe829b2d78e337e6fe14e5f1e0705d5) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - RiverDelta preset retune: the current is slowed to ~120 px/s (inlet,
  startup jets, and tracer packets all halved from 260) so the braiding
  stays legible, and the tracer packets now spawn more often (rate 2.6,
  count 3) with a fresh generated hue per packet (`autoSplatColor: null`)
  instead of a single muted teal.

- [`2c0ffe4`](https://github.com/tommyyzhao/svelte-fluid/commit/2c0ffe440ace5116eff3bbd4890bf73b392c7a56) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Solver pass restructuring: container/obstruction masking folded into the
  advection, viscosity, and gradient-subtract passes (no more standalone mask
  blits); precomputed face-aperture neighbor texture replaces per-fragment
  solid-mask probes; pressure warm-start folded into the first Jacobi
  iteration; adaptive paired Jacobi (two exact iterations per pass) on
  production-sized grids. Measured ~35–40% frame-time reduction across the
  flow presets with no visual or API change. See ADR-0038.

## 0.2.2

### Patch Changes

- [`353556a`](https://github.com/tommyyzhao/svelte-fluid/commit/353556a267f2cc1ce6353a5771a351ca7fc083cb) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Fix: `FluidDistortion` no longer leaves a null texture bound when its `imageUrl` fails to load (404 or network error). The engine now resets the loaded-URL cache and rebinds the 1x1 fallback texture in `image.onerror`, so subsequent frames keep rendering instead of producing white/black output.

  Also: refreshed `package.json` description and keywords for npm discoverability, corrected the `FluidDistortion` `initialSplats` default in the component docs (it's `20`, not `5`), and swapped the broken bundlephobia badge in the README for a packagephobia install-size badge.

## 0.2.1

### Patch Changes

- Refresh hero animation (white background, svelte sticky text, fluid reveal, fluid text panels) and revise README copy.

## 0.2.0

### Minor Changes

- [`af72b3b`](https://github.com/tommyyzhao/svelte-fluid/commit/af72b3b04b1168f09f96ec76a39f12594fcf2f86) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Rename automatic splat configuration props from `randomSplat*` to clearer `autoSplat*` names.

### Patch Changes

- [`df0c7e0`](https://github.com/tommyyzhao/svelte-fluid/commit/df0c7e01bd7ebd7f55267d7984373cd129a43a75) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Fix single-channel mask texture uploads on WebGL drivers that require byte-aligned rows.

## 0.1.1

### Patch Changes

- [`5e297ef`](https://github.com/tommyyzhao/svelte-fluid/commit/5e297efadf5f3600469914b640e82e39b98d0724) Thanks [@tommyyzhao](https://github.com/tommyyzhao)! - Fix public README and docs issues found while dogfooding v0.1.0.

All notable changes to **svelte-fluid** are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html):

- **patch** — bug fixes, doc fixes, internal refactors
- **minor** — new presets, new props, additive engine features
- **major** — breaking API changes

## [0.1.0] — 2026-04-27

### Added

- **`FluidText` component** — fluid simulation confined inside text letterforms.
  Auto-computes aspect ratio from `OffscreenCanvas.measureText()` so font appears
  the same visual size regardless of text length. Props: `text`, `font`, `height`,
  `maskResolution`, plus all `FluidConfig` props. Exported from library index.
- **`pointerTarget` prop** (`FluidConfig.pointerTarget?: 'canvas' | 'window'`,
  default `'canvas'`) — configures whether pointer event listeners attach to the
  canvas element or to `window`. Window mode enables background fluid to respond
  to pointer activity anywhere on the page. Touch listeners registered as passive
  in window mode (scrolling not blocked). Bucket A (hot-updatable).
- **`FluidBackground` defaults** — `pointerTarget` defaults to `'window'` and
  `splatOnHover` defaults to `true`, so background fluid responds to all page
  pointer activity out of the box.
- **Distortion fallback texture** — 1×1 white pixel texture created at engine
  construction so the distortion shader never samples unbound/black data while
  the real image loads asynchronously.
- **`AGENTS.md`** — root-level file redirecting all LLM agents to `CLAUDE.md`.
- **`outerCornerRadius` prop on `FrameFluid`** — allows rounding the outer
  boundary of the frame preset component.

- **Docs site** — 6-page Mintlify-inspired documentation at `/docs` with sidebar
  navigation: Getting Started, Components, Configuration, Container Shapes,
  Presets, API Reference. Accessible from the main demo page header.
- **SKILLS.md route** — LLM-friendly API reference at `/skills.md` (628 lines).
  All components, props, shapes, presets, types, and usage examples.
- **`CopyPageButton` component** — reusable button that copies page content as
  clean markdown. Integrated into main demo, background-fluid, fluid-reveal,
  and svelte-fluid pages.

### Changed

- **Hero title** — replaced manual `<Fluid>` + `wordShape()` with `<FluidText>`
  components. Both words now render at equal font height. Splat tuning increased
  (`splatRadius` 0.3→0.6, `splatForce` 5000→8000, `initialSplatCount` 8→20,
  `autoSplatRate` 4→6, `autoSplatCount` 2→4, `autoSplatSwirl` 200→300).
- **Code preview buttons** — replaced icon-only `</>` with labeled "View code" /
  "Hide code" toggle. Styled to match "Customize" button (filled background,
  `#1c2a3a` / `#2a4a6a` border). Added 180ms `slide` transition on code panel.
  FluidBackground floating button also updated.
- **Rounded frame demo** — now rounds both inner (`innerCornerRadius: 0.06`) and
  outer (`outerCornerRadius: 0.06`) corners. Description updated. Frame demo
  description updated to "Sharp-edged rectangular frame with no rounding."
- **`docs/` → `dev-docs/`** — internal documentation (31 ADRs, 6 learnings,
  architecture, porting notes) moved out of consumer-visible path. All
  cross-references updated (PR template, session commands, ADRs, porting notes).
- **`CONTRIBUTING.md`** — full contributing guide moved from `docs/contributing.md`
  to root. Updated paths from `docs/` to `dev-docs/`.
- **`CLAUDE.md`** — rewritten as non-redundant agent guide. Removed demo page
  details and handoff reference. Added "Further reading" table pointing to
  `dev-docs/`. References `CONTRIBUTING.md` for full contributing guide.

### Fixed

- **Frame/roundedRect border-radius asymmetry** — rounded corners on `frame` and
  `roundedRect` container shapes now appear circular in physical space (like CSS
  `border-radius`), not elliptical. Applied aspect correction to all rounded-box
  SDF computations in display, applyMask, and glass shaders, plus TypeScript
  mirrors. Also fixed missing `uContainerAspect`/`uAspect` uniform for frame and
  roundedRect in `FluidEngine.ts`.
- **Dead "Docs" link** — header nav link changed from deleted `github.com/.../docs`
  to `/docs`. Contributing link updated to point to root `CONTRIBUTING.md`.
- **FluidStick auto-animate dimensions** — replaced `window.innerWidth/Height`
  with container dimensions via `bind:clientWidth/clientHeight`. Velocity now
  scales by actual canvas size, not viewport size.
- **Mobile glass rendering** — glass auto-disabled when `OES_texture_float_linear`
  is unavailable (`!ext.supportLinearFiltering`). Prevents black-box rendering on
  iOS WebGL 1.
- **Mobile distortion black box** — distortion shader no longer samples unbound
  texture while image loads. Fallback 1×1 white texture ensures valid output from
  first frame.

### Documentation

- `dev-docs/README.md` updated to reference root `CONTRIBUTING.md`.
- Internal cross-references in ADR 0016, ADR 0018, porting-notes updated from
  `docs/` to `dev-docs/`.

- **`revealAccentColor` prop** (`FluidConfig.revealAccentColor?: RGB`, default
  `{ r: 0.05, g: 0.16, b: 0.32 }`) — separate engine-level accent color uniform
  for the reveal fringe zone. The accent color now appears **directly** in the
  fringe between the solid cover and the fully revealed content, independent of
  the cover color. Previously the accent was baked into the dye via
  `cover - accent` subtraction, which produced invisible fringes with dark covers.
  Matching the Ascend-Fluid reference architecture. Bucket A (hot-updatable).
- **Shaped reveal demo cards** — 2 new cards in the Reveal section: "Circle reveal"
  (openBoundary + circle containerShape, teal mosaic) and "Bounded reveal"
  (openBoundary=false + roundedRect, warm mosaic). Showcases shaped reveals.
- **`smoothstep` threshold in REVEAL shader** — kills near-zero dye intensity so
  faint Gaussian tails never trigger partial reveal (eliminates "brightening"
  artifact on the solid cover area).
- **`revealFringeColor` prop** (`FluidConfig.revealFringeColor?: RGB`, default
  `{ r: 0.6, g: 0.7, b: 0.85 }`) — outer fringe color between the cover and the
  accent in the reveal shader. Creates a two-tone fringe:
  cover → fringeColor → accentColor → transparent. Eliminates the dark band
  artifact that appeared when mixing distant colors (e.g. white cover + dark navy
  accent produced ugly gray intermediates). Bucket A (hot-updatable).
  `FluidReveal` exposes it as `fringeColor` prop.
- **Playground reveal snippet builder** — `buildRevealSnippet()` now emits
  `coverColor`, `fringeColor`, and `accentColor` as RGB object literals when
  they differ from defaults.

- **`openBoundary` prop** (`FluidConfig.openBoundary?: boolean`, default `false`) —
  open boundary conditions. When `true`, fluid flows freely instead of bouncing:
  (1) divergence solver skips no-penetration enforcement at canvas edges,
  (2) container shapes become visual crops rather than physical walls (`applyMask`
  skipped on velocity and dye; display shader still clips via `CONTAINER_MASK`).
  FluidReveal defaults to `openBoundary={true}` for natural scratch behavior.
  Bucket A (hot-updatable). Uniform `uOpenBoundary` in divergence shader.
- **`/test-boundary` route** — temporary visual validation page for comparing
  open vs closed boundary behavior across shape types (none, circle, roundedRect,
  svgPath). Uses auto-reveal for hands-free comparison.
- **`@changesets/cli` + `@changesets/changelog-github`** — automated release
  tooling. New scripts: `bun run changeset`, `bun run version`,
  `bun run release`. Config at `.changeset/config.json`.
- **73 new tests** — `resolve-config.test.ts` (47 tests: field mapping,
  clamping, density dissipation ramp, partial patches, construct-only fields)
  and `lifecycle.test.ts` (26 tests: dispose contract, setConfig bucket
  classification, context loss/restore state machine, velocity dissipation
  threshold logic).
- **ADR-0031** — documents FluidStick architecture: sticky mask rasterization,
  three-shader modulation (advection/pressure/splat), multiplicative dissipation,
  velocity damping, zero-overhead when disabled, texture unit budget.
- **`resolveConfig()` and `DEFAULTS` exported** from `FluidEngine.ts` with
  `@internal` JSDoc — enables direct testing of config resolution logic.

### Changed

- **REVEAL shader formula** — complete overhaul across three sessions:
  (1) `max(coverColor - dye, 0)` → `mix(coverColor, accentColor, revealAmount)` →
  (2) `smoothstep(0, 0.5, pow(raw, curve))` for crisp S-curve edges →
  (3) two-tone fringe via `cover → fringeColor → accentColor` with one-sided ramp.
  The smoothstep sharpening kills the Gaussian tail gradient, producing a tight
  boundary with a large "clearly revealed" center. The one-sided ramp
  (`smoothstep(0, 0.25, revealAmount)` for accent blend) prevents the white-band
  artifact that the bell curve created at high revealAmount.
- **FluidReveal `curve` default** — 0.1 → 0.24 → **0.5**. The old 0.24 exponent
  still produced a wide gradient. 0.5 (sqrt) combined with smoothstep sharpening
  gives crisp scratch-card-like edges while keeping a meaningful fringe zone.
  Engine `REVEAL_CURVE` and ControlPanel `D.revealCurve` updated to match.
  JSDoc corrected: higher curve = crisper edge (was incorrectly described as
  the opposite).
- **FluidReveal/FluidDistortion pointer velocity** — switched from normalized
  deltas × 6000 to pixel-based deltas × 5 (mouse) / × 8 (touch), matching
  Ascend-Fluid reference. Eliminates canvas-size-dependent velocity — small
  demo cards previously produced 3-4× more velocity than full-screen canvases.
- **"Liquid reveal" → "Turbulent reveal"** — renamed demo card and preset to
  better describe the higher-turbulence behavior from lower pressure and curl.
  Further tuned: `curl` 3→20, `pressure` 0.8→0.4, added `velocityDissipation=0.96`,
  `splatRadius` 0.3→0.35 for much more chaotic swirling reveals.
- **All 6 reveal demo cards** — now include `fringeColor` prop in both the
  rendered `<FluidReveal>` instances and the `</>` code snippets. Fringe colors
  chosen to create smooth transitions for each cover/accent combination.
- **Reveal preset tuning** — all presets now use `curve >= 0.24` and
  `splatRadius >= 0.2`. Permanent reveal and Auto-reveal use
  `velocityDissipation=0.95` for blobby/laminar behavior matching Scratch to reveal.
- **`revealDye` simplified** — now always white `{ r: 1, g: 1, b: 1 }` since
  only intensity matters for the reveal threshold (accent color handled by shader
  uniform).
- **`loadConfig()` gaps fixed** — `revealCoverColor`, `revealAccentColor`, and
  `pressureIterations` now correctly loaded from PRESET_CONFIGS into playground state.
- **`revealCurve` default mismatch** — ControlPanel D.revealCurve was 0.25,
  FluidReveal actual default was 0.1. Both now 0.24.

- **FluidReveal `pressure` default** — 0.8 → **1.0**. Disables the per-frame
  pressure field relaxation step (`pressure *= 0.8`), matching the Ascend-Fluid
  reference. Eliminates "bubble collapse" where revealed transparent areas
  quickly filled back in. Passed explicitly to `<Fluid>` as a destructured prop.
- **FluidReveal `velocityDissipation` default** — 0.9 → **0.98**. The old 0.9
  was set when the engine ignored it (hardcoding 0.98). Now that the engine
  honors the prop (see fix below), 0.98 restores the original behavior.
- **Velocity dissipation in multiplicative mode** — the engine previously
  hardcoded 0.98 for all REVEAL/STICKY instances, ignoring the prop. Now uses
  a threshold: if `velocityDissipation > 0.5` (clearly a multiplicative-mode
  value), honor it; if ≤ 0.5 (additive-mode default like 0.2), fall back to
  0.98. This allows FluidReveal consumers to tune velocity decay (e.g. 0.95
  for tighter Ascend-like feel).
- **"Soft reveal" → "Liquid reveal"** — renamed demo card and preset. Now
  explicitly sets `pressure={0.8}` to opt into the swirly pressure relaxation
  that FluidReveal's new default (1.0) disables. Description updated to
  emphasize the organic, liquid unmasking effect.
- **Scratch-to-Reveal preset tuning** — `splatRadius` 0.2→0.12 (tighter splats
  matching Ascend's `1/height` scale), `velocityDissipation` 0.98→0.95 (faster
  velocity decay for viscous feel), `pressureIterations` 20→10 (matching
  Ascend). Produces tight, viscous trails instead of diffuse washes.
- **Auto-reveal preset** — added `curve={0.12}` (+0.02 from FluidReveal
  default of 0.1).
- **Playground reveal-mode defaults** — `pressure` set to 1.0 and
  `velocityDissipation` to 0.98 in both mode-switch and loadConfig paths.
- **Reveal snippet builder** — updated default comparisons: `velocityDissipation`
  0.9→0.98, `pressure` 0.8→1.0, added `pressure` to `buildRevealSnippet()`.

### Fixed

- **White band artifact in reveal fringe** — at high `revealAmount` (≈ 0.85–0.95),
  the bell curve `4*r*(1-r)` reverted the color toward cover (white) while alpha
  was still nonzero, creating a bright white glow between the accent zone and the
  transparent center. Fixed by switching to a one-sided ramp that saturates to
  accent and stays there.
- **Dark band artifact between cover and accent** — mixing distant colors
  (white + deep navy) through `smoothstep` produced ugly dark gray intermediates.
  Fixed by introducing `revealFringeColor` as an intermediate color stop.
- **FluidReveal zero-dye bug with dark covers** — `revealDye` computation
  (`coverColor - accentColor`) produced all-zero dye when the accent color was
  brighter than the cover in every channel (e.g. Permanent reveal: dark gray
  cover + gold accent). Zero-intensity dye meant the reveal shader never
  triggered — cursor movement had no effect. Fixed: when all channels are
  negative, uses the absolute difference `|cover - accent|`; a floor of 0.15
  per channel guarantees nonzero intensity for all color combinations. Added
  5 tests covering dark-cover, identical-color, and mixed-channel cases.

### Documentation

- **ADR-0031** — FluidStick architecture decisions (see Added above).

- **Shared fluid controls for all playground tabs** — Sticky, Reveal, and Distortion
  tabs now display the same accordion sections as the Fluid tab: Physics, Random
  Splats, Visuals, Resolution, Background, Container Shape, Glass. All controls
  are wired to the active component instance. Mode-specific sections remain at top.
- **Full prop passthrough for playground instances** — `FluidStick`, `FluidReveal`,
  and `FluidDistortion` playground components now receive all shared fluid props
  (pressure, bloomIntensity, sunraysWeight, splatOnHover, dyeResolution,
  simResolution, paused, autoSplat*, backColor, glass*, transparent, etc.)
  so slider changes in shared accordions take effect immediately.
- **Reveal preset color variety** — each reveal demo card now has distinct
  coverColor/accentColor: "Permanent reveal" (dark charcoal + gold), "Auto-reveal"
  (deep navy + teal), "Soft reveal" (warm blush + deep purple). PRESET_CONFIGS
  updated so Customize buttons carry colors.
- **Mobile touch targets** — `@media (max-width: 600px)` rules in ControlPanel
  (mode toggle buttons 10px padding, accordion headers, action buttons), Card
  (Customize/code buttons 6px padding), +page.svelte (tighter main padding,
  smaller playground canvas min-height on <480px, bg-code-panel width capped).
- **ControlPanel removes max-height on mobile** — `max-height: none` at <800px
  so the panel expands naturally in stacked layout instead of scrolling.

### Changed

- **Mode-switch snapshot expanded** — snapshot now saves/restores 14 values (was 6):
  added densityDissipation, splatOnHover, pressure, autoSplatRate/Count/Swirl/
  Spread, colorful. Each mode switch sets appropriate defaults for all params.
  `resetAllDefaults()` clears `fluidSnapshot` and `prevMode` to prevent stale
  snapshot restoration after Reset.
- **Reveal/Sticky/Distortion ControlPanel sections trimmed** — removed controls
  that duplicated shared accordions: curl/splatRadius/velocityDissipation from
  Reveal Physics, densityDissipation/splatRadius/curl + Container from Sticky,
  velocityDissipation + Container from Distortion.
- **Snippet builders fixed** — `buildRevealSnippet()` now compares against
  FluidReveal defaults (splatRadius=0.2, curl=0, velocityDissipation=0.9) instead
  of Fluid defaults. All three non-fluid builders now include shared props (bloom,
  sunrays, shading, splatForce, pressure, etc.) when they differ from component
  defaults.
- **maskPadding label** → "Text size" with hint explaining fill fraction semantics.
- **Automatic splat labels clarified** — autoSplatRate→"Rate (splats/sec)",
  autoSplatCount→"Count per burst", autoSplatSwirl→"Swirl",
  autoSplatBandHeight→"Spawn band height", autoSplatCenterY→"Spawn band center",
  autoSplatVelocityX/Y→"Velocity X/Y".
- **splatRadius slider max** — Fluid quick controls bumped from 1.0→2.0 to match
  shared accordion range.
- **Frame outer controls in shared Shape section** — added outerHalfW, outerHalfH,
  outerCornerRadius sliders (were only in Fluid tab).

### Fixed

- **Paused doesn't stop automatic splats** — `accumulateAutoSplatTimer(dt)` was
  called before the `!PAUSED` check in `FluidEngine.update()`. Moved inside the
  `if (!PAUSED)` block so pausing truly freezes all simulation activity.
- **"Loaded: Shared config" banner on fresh load** — URL hash auto-serialization
  caused `deserializeState()` to set `loadedPreset='Shared config'` on page load.
  Added `showBanner` parameter; initial mount passes `false` so no banner appears.
  Only explicit Share link navigation shows it.
- **Reset from non-fluid tab restores stale snapshot** — `resetAllDefaults()` now
  clears `fluidSnapshot=null` and resets `prevMode`, preventing the mode-switch
  `$effect` from overwriting reset values.

- **Playground Sticky tab** — 3rd playground mode with FluidStick controls: text/font
  inputs, SVG path textarea, maskBlur/maskPadding sliders, sticky physics (strength,
  amplify, pressure, densityDissipation), auto-animate speed/duration, container
  shape selector (Rectangle/Circle/Rounded rect) with glass toggle. Remounts on
  "Restart Animation" to reset auto-animate.
- **Playground Distortion tab** — 4th playground mode with FluidDistortion controls:
  image URL text input, strength/intensity sliders, velocityDissipation,
  initialSplats, auto-distort checkbox with speed slider, container shape selector.
  Toggling auto-distort triggers a remount so the Lissajous animation starts.
- **Customize buttons on Sticky/Distortion demo cards** — all 8 demo cards
  (4 sticky, 4 distortion) now have "Customize" buttons that scroll to the
  playground, switch to the correct tab, and load the card's config.
- **URL hash state for Sticky/Distortion** — all sticky/distortion playground params
  serialize to the URL hash for sharing.

### Changed

- **Playground mode toggle** — expanded from 2 tabs (Fluid/Reveal) to 4 tabs
  (Fluid/Reveal/Sticky/Distortion). Reduced button padding/font-size to fit.
  Only the active tab's WebGL context is rendered.
- **SVG path (`d`) now takes precedence over `text`** — in both `initMaskTexture()`
  and `initStickyMaskTexture()` in `FluidEngine.ts`, and in `ContainerShape.svgPath`
  and `StickyMask` type docs. Previously text took precedence; now SVG path wins
  when both are set.
- **FluidStick `densityDissipation`** — default 0.85→0.98. Multiplicative dissipation
  at 0.85 was 15%/frame (dye gone in ~300ms); 0.98 gives 2%/frame (~1–2s visible
  trails, matching standard Fluid feel). On-mask retention improved from 10%→74%
  after 5s.
- **FluidStick automatic splat timing** — rate 0.6→0.4 (every ~2.5s), count 3→3,
  swirl 150→500 (stronger tangential velocity). Engine jitter widened from
  0.5–1.5× to 0.3–2.0× for organic "water dripping" timing.
- **`/sticky-tuning` route removed** — functionality folded into the main
  playground's Sticky tab.

### Fixed

- **`loadedPreset` not cleared on Reset** — `loadedPreset` was a read-only prop in
  ControlPanel; clicking "Clear"/"Reset" reset all values but the "Loaded: X"
  indicator persisted. Made `loadedPreset` `$bindable` and clear it in `reset()`.
- **`autoSplatSwirl`/`autoSplatBandHeight` not passed to `<Fluid>`** — FluidStick
  destructured these props (removing them from `...fluidProps`) but never forwarded
  them to the inner `<Fluid>` component. The engine used defaults: swirl=0 (zero
  velocity) and spread=0.1 (tiny band). Random splats were invisible. Added
  `{autoSplatSwirl}` and `{autoSplatBandHeight}` to the template.

- **`StickyMask.padding` field / `maskPadding` prop** — controls how much of the
  mask texture the text fills (text mode only). Default 0.9. Use smaller values
  (e.g. 0.5) to fit text inside a container shape like a circle.
- **Sticky velocity damping** — advection shader now dampens velocity on the sticky
  mask (~80%/frame with strength=1.0). Negative `uStickyStrength` activates a
  damping branch: `dissipation * max(0, 1 + stickyVal * strength)`. Prevents dye
  from being advected off the mask by splat-injected velocity.
- **FluidStick automatic splats** — default `autoSplatRate=0.6` (burst every ~1.7s),
  `autoSplatCount=3`, `autoSplatSwirl=150` (gentle tangential velocity),
  `autoSplatBandHeight=2.0` (full-canvas spawn). Keeps the sticky text alive with
  intermittent color refreshes.
- **`/sticky-tuning` test route** — 4 FluidStick cards with 5 preset buttons and
  live parameter sliders for tuning sticky physics interactively.

- **`autoAnimateDuration` prop** on `FluidStick` — controls how many seconds
  auto-animation runs before stopping. Default 3.5s. Once stopped, off-mask dye
  fades away, revealing the sticky shape. Set to 0 for indefinite animation.
- **Color-cycling auto-animate** — `FluidStick` auto-animation now cycles through
  rainbow hues (HSV rotation at 2×t) at 1.5× HDR intensity, replacing the fixed
  purple `{r:0.3, g:0.15, b:0.3}` color. Produces vivid accumulated dye.

### Changed

- **FluidStick default tuning (session 16)** — `amplify` 0.5→2.0 (3× on-mask dye),
  `autoAnimateSpeed` 1.0→2.0, `autoAnimateDuration` 3.5→5.0s,
  `densityDissipation` 0.78→0.85 (slower off-mask fade), `splatRadius` 0.6→1.0,
  `splatForce` 10000→6000 (gentler pointer splats), `strength` 1.0→0.95 (slow
  visible decay on mask), auto-animate velocity multiplier 5×→3×.
- **Demo "Sticky + circle"** — font 100px→72px, added `maskPadding={0.5}` so "HI"
  text fits inside the circle container. Removed explicit `strength={1.0}` from
  "Strong pressure" preset.
- **FluidStick default tuning (session 15)** — `splatRadius` 0.25→0.6 (thicker cursor splats),
  `splatForce` 6000→10000 (brighter splats), `densityDissipation` 0.85→0.78
  (faster off-mask fade), `amplify` 0.3→0.5 (stronger on-mask boost).
- **FluidStick auto-animate timing** — deferred clock start (`animStartTime` set
  on first available frame, not mount time) so lazy-loaded cards get the full
  animation duration. Fixed Lissajous to use `t` variable (was using raw ms,
  ignoring `autoAnimateSpeed`). Wider vertical sweep (±0.27 vs ±0.2).
- **Demo sticky text card** — changed text from "STICKY" (bold 80px) to "FLUID"
  (900-weight 120px) for bolder letterforms.

### Fixed

- **Sticky velocity advection** — velocity was unmodulated by the sticky mask
  (`uStickyStrength=0.0` for velocity advection), allowing splat-injected velocity
  to advect dye off the mask even when dissipation was 1.0. Now passes
  `-(STICKY_STRENGTH * 0.8)` to activate damping mode in the advection shader.
  Dye accumulates and persists on the sticky mask as intended.
- **Sticky mask texture GPU sampling** — three fixes to `initStickyMaskTexture()`
  and `step()` in `FluidEngine.ts`: (1) `gl.activeTexture(gl.TEXTURE7)` before
  texture creation ensures the mask is created on its dedicated unit, (2)
  `gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)` before upload handles single-channel
  textures with non-aligned row widths (restored to 4 after), (3) re-bind mask
  texture + uniform before dye advection pass to survive program switches from
  `applyMask`. The advection shader now correctly reads the mask and modulates
  dissipation — dye persists on the text/path shape.

- **`FluidStick` component** (`FluidStick.svelte`, ~210 LOC) — new Svelte wrapper
  that makes fluid dye "stick" to text or SVG path shapes. Three physics-level
  shader modulations: advection dissipation (dye persists on mask), pressure
  injection (fluid flows around mask), splat amplification (more dye deposited
  on mask). Props: `text`, `font`, `d`, `maskViewBox`, `maskFillRule`,
  `maskResolution`, `maskBlur`, `strength`, `stickyPressureAmount`, `amplify`,
  `autoAnimate`, `autoAnimateSpeed`.
- **`StickyMask` type** (`types.ts`) — describes the mask shape for sticky mode.
  Supports text mode (`text` + `font`) and SVG path mode (`d` + `viewBox`).
  Same rasterization pattern as `ContainerShape.svgPath` text mode.
- **Sticky shader uniforms** — `uStickyMask`/`uStickyStrength` added to advection
  shader, `uStickyMask`/`uStickyPressure` to pressure shader,
  `uStickyMask`/`uStickyAmplify` to splat shader. All default to 0.0 (identity)
  when sticky is disabled — zero performance cost for non-sticky instances.
- **`FluidConfig` sticky fields** — `sticky` (Bucket B), `stickyMask` (triggers
  texture rebuild), `stickyStrength` (Bucket A, default 0.9),
  `stickyPressure` (Bucket A, default 0.15), `stickyAmplify` (Bucket A, default 0.3).
- **Sticky mask texture** — `initStickyMaskTexture()` in FluidEngine rasterizes
  text/SVG path via OffscreenCanvas, extracts alpha channel, optional box blur,
  uploads as R8/LUMINANCE texture on unit 7. Includes `blurMaskData()` for
  multi-pass box blur approximating Gaussian.
- **`stickyMaskEqual()`** — deep equality for StickyMask values, exported from
  `container-shapes.ts`. Also exported `viewBoxEqual()`.
- **Demo: Sticky section** — 4 cards (Sticky text, Lightning bolt, Sticky + circle,
  Strong pressure) on the demo page.
- **34 new tests** (`sticky.test.ts`) — advection dissipation modulation, pressure
  injection, splat amplification, StickyMask equality, viewBoxEqual, config types.
- **`FluidDistortion` component** — new Svelte wrapper that uses the fluid
  velocity field to warp an underlying image. Cursor movement creates liquid
  ripple distortions. Props: `src`, `strength`, `intensity`, `fit`, `scale`,
  `bleed`, `initialSplats`, `autoDistort`, `autoDistortSpeed`.
- **`DISTORTION` display shader keyword** — mutually exclusive with `REVEAL`
  via `#elif`. Reads `dye.r` as distortion intensity, `velocity.xy` as
  direction, offsets image UVs by `normalize(vel) * dye.r * power`.
  Supports cover/contain fit modes and configurable scale.
- **Distortion bleed** — `bleed` prop (CSS pixels, default 60) extends the
  canvas invisibly beyond each edge. The fluid velocity field flows freely
  past the visible boundaries instead of bouncing. Image UVs are remapped
  to the visible sub-region via `uBleed` uniform.
- **Initial chaos splats** — `initialSplats` prop (default 20) generates
  random high-velocity splats at construction. Combined with
  `initialDensityDissipation: 0.5` ramp over 2 seconds, creates a dramatic
  warp-to-clear transition on load.
- **FluidConfig distortion fields** — `distortion`, `distortionPower`,
  `distortionImageUrl`, `distortionFit`, `distortionScale`,
  `distortionBleedX`, `distortionBleedY`. Bucket B (keyword) for
  `distortion` boolean, Bucket A (hot scalar) for all others.
- **Distortion image texture** — `loadDistortionImage()` in `FluidEngine`
  loads image URLs asynchronously and uploads as GL texture. Handles CORS,
  stale load cancellation, and context restore re-loading.
- **Demo: Distortion section** — 4 cards (Image distortion, Auto-distort,
  Strong warp, Contained with shape) using Bosch's _Garden of Earthly
  Delights_ (public domain, 1490–1500).
- **14 new tests** (`distortion.test.ts`) — UV offset math, edge alpha,
  bleed remapping, config defaults, mutual exclusivity with REVEAL.
- **ADR-0030** — documents FluidDistortion architecture decisions.

### Changed

- **Multiplicative velocity dissipation override** — when `REVEAL` or `STICKY`
  enables multiplicative advection mode, velocity dissipation is overridden
  to 0.98 instead of using `VELOCITY_DISSIPATION` (default 0.2) which would
  kill velocity at 80% per frame in multiplicative mode.
- **Ksenia Kondrashova acknowledgment** — README Acknowledgments section now
  credits her CodePen demos as inspiration for the reveal and distortion effects.

### Fixed

- **Text mask glyph centering** (`FluidEngine.ts`) — `textBaseline` was set to
  `'middle'` after `measureText`, so ascent/descent were measured from the
  alphabetic baseline but drawing used the em-square midpoint. Glyphs like `&`
  were visually off-center and clipped. Now uses `textBaseline: 'alphabetic'`
  for both measurement and drawing, with explicit `(ascent - descent) / 2`
  offset for true visual centering.
- **Rectangle shape not restoring** — switching the shape dropdown back to
  Rectangle did nothing because `containerShape` derived returned `undefined`,
  which `resolveConfig` skips (line 181: `if (input.containerShape !== undefined)`).
  Changed to return `null`, which the engine correctly processes as "clear shape".
- **Glass shape auto-switch not reversible** — enabling glass forced
  `containerShapeType` to `roundedRect` with no way back. Now remembers the
  pre-glass shape in `shapeBeforeGlass` and restores it when glass is unchecked.
- **7 missing URL hash serialization variables** — `autoSplatVelocityX`, `autoSplatVelocityY`,
  `autoSplatEvenX`, `revealAutoRevealSpeed`, `revealContent`,
  `revealCoverColor`, `revealAccentColor` were silently lost when sharing
  playground URLs. Added to `serializeState()`, `deserializeState()`, and the
  hash-push `$effect` tracking array.

### Changed

- **Playground label overhaul** — all checkbox labels standardized to sentence
  case: bloom→Bloom, glass→Glass, shading→Shading, sunrays→Sunrays,
  transparent→Transparent, paused→Paused, splatOnHover→Splat on hover,
  fadeBack→Fade back, autoReveal→Auto-reveal, colorful→Cycle pointer colors.
  Shape dropdown: circle→Circle, frame→Frame, roundedRect→Rounded rect,
  annulus→Ring. "shape" label→"Shape". glassChromatic→"Color fringing".
  autoRevealSpeed→"Auto-reveal speed".
- **"Annulus" renamed to "Ring"** throughout user-facing UI — dropdown label,
  card title, card description, PRESET_CONFIGS key, Portal ring description.
  Internal `type: 'annulus'` in ContainerShape API unchanged.
- **Shape "none" → "Rectangle"** — dropdown label for the default full-canvas
  mode now reads "Rectangle" instead of "none".
- **Glass + Rectangle** — "Rectangle" option disabled when glass is on with
  tooltip "Glass requires a container shape". Glass auto-switches to
  `roundedRect` as fallback.
- **densityDissipation moved to Physics section** — removed from quick-controls
  bar, added at top of Physics accordion body.
- **Paused moved to quick controls** — moved from Visuals accordion to the
  quick-controls row alongside Bloom and Glass.
- **Container Shape accordion hidden when Rectangle** — no empty section shown
  when there are no shape parameters to configure.
- **bloomIntensity/sunraysWeight conditionally visible** — sliders hidden when
  their parent effect (bloom/sunrays) is off.
- **initialDensityDissipation help text** — added field hint explaining
  construct-only semantics. Duration label changed to "Ramp duration (s)".
- **Comprehensive jargon cleanup** across all card descriptions and extra routes:
  - "Snell's law refraction" → "optical refraction"
  - "analytical shapes" → "built-in shapes"
  - "Hemisphere dome with chromatic aberration" → "Glass sphere with rainbow color fringing"
  - "Fresnel" → "soft edge reflections"
  - "Chromatic rim refraction" → "Rainbow light bending"
  - "volumetric bloom" → "a soft glow"
  - "High curl, instant velocity decay" → "Strong swirl, instant slowdown"
  - "India ink" → "Deep blue ink"
  - "Set fadeBack={false}" → "Disable fade-back"
  - "Lissajous animation" → "automated cursor traces a pattern"
  - "Navier-Stokes" → "Fluid Simulation" (background-fluid page)
  - "annuli" → "rings", "rounded rects" → "rounded rectangles"
  - "Post-processing pass with Snell refraction, Fresnel specular highlights, and chromatic aberration" → "Glass lens effect with light bending, reflective highlights, and rainbow color fringing"

### Added

- **`<ToroidalTempest>` preset** — 6th visual preset. Full-spectrum storm
  circulating in an annular ring with high-velocity (V=300) tangential splats,
  curl=50, periodic re-injection every 2s. Fills the odd-count gap in the
  2-column preset grid.
- **Playground Fluid/Reveal mode toggle** — pill toggle switches between
  `<Fluid>` canvas and `<FluidReveal>` wrapping actual sample content
  (gradient+text or tile mosaic). Reveal mode shows the real scratch-to-reveal
  interaction with content underneath.
- **Accordion ControlPanel** — 7 collapsible sections (Physics, Automatic Splats,
  Visuals, Resolution, Background, Container Shape, Glass) with blue "N changed"
  badges on each header. Pinned quick-controls bar always shows curl,
  splatRadius, densityDissipation, bloom, glass, shape picker.
- **"Customize" button on demo cards** — every preset, config, and glass effect
  card has a Customize button that loads its config into the playground and
  scrolls to it. Uses `loadConfig()` which resets to defaults first, then
  applies overrides.
- **URL hash state** — playground state serialized to `#pg=<base64 JSON>` via
  `history.replaceState` (debounced 300ms). Covers all physics, glass sub-params,
  container shape sub-params, reveal settings. "Share" button copies URL.
  Back button works as undo.
- **`revealCoverColor` prop** (`FluidConfig`, `FluidReveal.coverColor`) —
  customizable cover color for the reveal layer. The display shader replaces
  the hardcoded `1.0` with `uRevealCoverColor`, preserving identical default
  behavior (white). Bucket A.
- **`FluidReveal.accentColor` prop** — controls the iridescent fringe color at
  scratch edges. Derived as `coverColor - accentColor` → dye injection color,
  so the shader's `max(coverColor - c, 0)` naturally produces the accent at
  full dye. No engine uniform needed; lives entirely in FluidReveal.
- **Customize on all remaining cards** — Default, Circle, Frame, Annulus,
  Rounded frame, SVG path, Text glyph, Portal ring, Glass frame, and all 4
  Reveal cards now have Customize buttons + `PRESET_CONFIGS` entries. Reveal
  cards switch playground to Reveal mode.
- **`</>` code preview toggle** — replaces "Copy code" button in ControlPanel
  with a `</>` toggle showing an inline code panel with Copy button. Floating
  `</>` button in page top-right shows FluidBackground usage snippet.
- **Share button "Copied!" feedback** — 1.8s flash after clicking Share.
- **Card copy button "Copied!" feedback** — same pattern on all demo cards.
- **Physics snapshot on mode switch** — switching to Reveal mode snapshots
  curl/velocityDissipation/splatRadius/bloom/sunrays/shading and applies
  reveal defaults; switching back restores the snapshot.
- **SVG path Customize support** — `customContainerShape` state in playground
  allows svgPath shapes loaded via Customize, cleared when user picks a
  shape from the dropdown.
- **Code snippets show full `<Fluid>` equivalents** — every preset card snippet
  now shows both the preset shorthand and the equivalent `<Fluid>` configuration
  with all physics props.
- **Reveal snippets include exact CSS** — all 4 reveal card snippets include
  gradient stops, layout styles, and FluidReveal props.

### Fixed

- **Playground reveal mode was broken** — toggling `reveal={true}` on `<Fluid>`
  showed transparency to the page background with nothing to reveal. Now uses
  actual `<FluidReveal>` wrapping sample content.
- **`loadConfig` dirty state bleed** — loading a preset config left previous
  state (e.g., autoSplatRate, glass settings) from prior customization.
  Now calls `resetAllDefaults()` before applying overrides.
- **`buildRevealSnippet` wrong defaults** — compared against hardcoded
  FluidReveal defaults instead of the playground's `D.*` defaults, producing
  misleading code output with spurious "changed" props.
- **`reset()` didn't reset playground mode** — clicking Reset in Reveal mode
  reset all sliders but stayed in Reveal mode. Now resets to Fluid mode.
- **Shape badge only counted type change** — now counts sub-param changes
  (cx, cy, radius, innerRadius, outerRadius) in the badge number.
- **Glass accordion hint was passive text** — "Enable glass in quick controls
  above" is now a clickable button that sets `glass = true`.
- **Stale preset count copy** — "Eight presets" updated to "six visual presets
  and four shape presets" in page copy and og:description.
- **Label audit** — "evenSpacing" → "Even spacing", "show outline" →
  "Show shape outline".
- **`controlsRef` typed properly** — uses `FluidHandle` import instead of
  inline type.

### Changed

- **Plasma preset reverted** to original rectangular canvas design — 8 inward
  compass-point jets converging at center, `autoSplatRate={0.4}`, no container
  shape. The annulus ring design moved to ToroidalTempest.
- **PRESET_CONFIGS enriched** — added `initialDensityDissipation`,
  `initialDensityDissipationDuration` to LavaLamp/Plasma/ToroidalTempest;
  `autoSplatBandHeight`/`autoSplatSwirl` to Crystal orb;
  `autoSplatCount` to Soft lens.

- **Multiplicative dissipation for reveal mode** (ADR-0028) — advection shader
  now supports `uniform float uMultiplicative`. When `reveal=true`, the engine
  sets it to 1.0, switching from `result / (1 + dissipation * dt)` to
  `dissipation * result`, matching the Ascend-Fluid reference physics.
- **Hemisphere rim effects via `glassThickness`** — the circle glass model now
  uses `uGlassThickness` to boost refraction displacement, rim specular, and
  rim glow at the dome edge. Previously `glassThickness` was unused for circles.
- **Curl skip optimization** — `step()` skips curl + vorticity compute passes
  when `CURL === 0`, saving 2 draw calls per frame for reveal and flat configs.

### Fixed

- **FluidReveal y-coordinate inversion** — the manual pointer handler passed
  DOM-space y (0=top) to `engine.splat()` which expects GL-space y (0=bottom).
  Splats now appear where the cursor actually is.
- **FluidReveal CSS sizing** — `.svelte-fluid-reveal` and its content div now
  set `width: 100%; height: 100%` so the component fills its parent container.
- **Lazy teardown releases WebGL context slots** (`Fluid.svelte`) — after
  `engine.dispose()`, lazy instances now call `loseContext()` via the
  `WEBGL_lose_context` extension to free the browser's context slot (~16 cap).
- **Text-mode mask sizing** — `initMaskTexture()` text height now uses
  `actualBoundingBoxAscent + actualBoundingBoxDescent` instead of a hardcoded
  `refSize * 1.2`, fixing glyph clipping at large font sizes.

### Changed

- **FluidReveal display shader** — output changed from premultiplied flat
  cover color `vec4(coverColor * alpha, alpha)` to non-premultiplied inverted
  dye `vec4(1.0 - c, alpha)`. Produces sharp iridescent fringes at reveal
  edges matching the Ascend-Fluid reference.
- **FluidReveal physics defaults** — fully revised for multiplicative mode:
  - `sensitivity`: 0.12 → **0.1** (matches reference `pow(0.1 * a, 0.1)`)
  - `velocityDissipation`: 3 → **0.9** (multiplicative: 90% retention/frame)
  - `splatRadius`: 0.4 → **0.2** (tighter reveal strokes)
  - `REVEAL_DYE`: `{0.15, 0.15, 0.15}` → `{0.95, 0.84, 0.68}` (non-uniform
    warm dye creates blue-tinted iridescent fringes when inverted)
  - `fadeBack` dissipation: 0.97 → **0.995** (multiplicative slow fade)
  - permanent dissipation: 0 → **1.0** (multiplicative no-fade)
- **`coverColor` prop removed** from `FluidRevealProps`, `FluidConfig`,
  `ResolvedConfig`, and the display shader uniform. The inverted-dye approach
  replaces it.
- **`revealSensitivity` default**: 0.12 → **0.1** (engine + component).
- **Preset modernization** — all presets now use container shapes and
  latest features:
  - **LavaLamp**: added `roundedRect` container + `glass` (rim refraction)
  - **Plasma**: changed to `annulus` container, 8 tangential ring splats with
    periodic re-injection (2.5s interval with positional jitter),
    `velocityDissipation: 0.02`
  - **InkInWater**: full rewrite — dark water background, volumetric bloom,
    shading, 5 chromatically varied ink droplets, physics tuned for
    realistic ink-in-water behavior
  - **FrozenSwirl**: added `circle` container
  - **SvgPathFluid**: changed from star path to bold ampersand "&" glyph
    using text-mode rasterization with `fillRule: 'evenodd'`
- **Demo page Container shapes** — swapped Rounded frame / Rounded rect order;
  replaced Rounded rect with SVG path lightning bolt; renamed SVG star card
  to "Text glyph".
- **Demo page Container effects** — Crystal orb gets `glassThickness={0.08}`;
  Soft lens gets faster splats (`rate: 2.5`, `count: 2`, lower dissipation);
  Glass frame gets much faster splats (`rate: 3.0`, `count: 2`,
  `autoSplatSwirl={350}`).
- **Semantic language audit** — replaced "plasma", "energy field", "tokamak",
  "confined/confinement" with accurate fluid terminology across all presets,
  demo cards, types.ts JSDoc, README, CHANGELOG, ADRs, and learnings docs.

### Removed

- **`/ascend-fluid` route** (~650 LOC) — standalone reference implementation,
  obsolete now that FluidReveal matches its physics.
- **`coverColor` / `revealCoverColor`** — prop, config field, engine default,
  resolveConfig mapping, shader uniform, and all demo page usage.

### Previously added

- **`<FluidReveal>` component** — fluid simulation as an opacity mask over
  slotted content. Cursor movement injects dye which the `REVEAL` display
  shader converts to transparency, revealing children underneath. Props:
  `coverColor`, `sensitivity`, `curve`, `fadeBack`, `fadeSpeed`, `autoReveal`,
  `autoRevealSpeed`, `lazy`, `autoPause`. See ADR-0027.
- **`reveal` display mode** (engine-level) — new `REVEAL` keyword in the
  display shader outputs premultiplied `vec4(coverColor * alpha, alpha)`.
  New config fields: `reveal` (Bucket B), `revealCoverColor`,
  `revealSensitivity`, `revealCurve` (all Bucket A).
- **`/fluid-reveal/` demo route** — 5 test instances: default reveal, custom
  cover color, auto-reveal animation, soft edges, circular reveal zone.
- **Reveal section on main demo page** — 4 cards (scratch-to-reveal, permanent
  reveal, auto-reveal, soft reveal) with code snippets. All lazy.
- ADR-0027: FluidReveal — fluid as opacity mask.
- 9 new tests for reveal alpha curve math and cover color normalization
  (`src/lib/engine/__tests__/reveal.test.ts`).
- **`<FluidBackground>` component** — full-viewport fluid canvas that sits
  behind page content with automatic DOM element exclusion. Accepts an
  `exclude` CSS selector prop; matched elements become "holes" the fluid
  physically cannot enter. Background-optimized defaults (`simResolution: 64`,
  `dyeResolution: 512`, `initialSplatCount: 0`). See ADR-0026.
- **`/background-fluid` demo route** — prototype page demonstrating
  FluidBackground with 6 feature cards, 5 embedded preset demos, and
  a "How it works" explainer. All cards are excluded from the fluid.
- **Rounded rect shape card** on the main demo page — new "Rounded rect"
  card in the Container shapes section, using `containerShape: { type:
'roundedRect' }`. Shapes section now has 6 cards (was 5) for symmetric
  2-column layout.
- **`splatOnHover` prop on shape presets** — `CircularFluid`, `FrameFluid`,
  `AnnularFluid`, and `SvgPathFluid` now accept and forward `splatOnHover`.
- **FluidBackground wrapped main demo page** — the main `/` route uses
  `<FluidBackground>` as a page-level background behind all content.
- ADR-0026: FluidBackground component with DOM exclusion zones.

### Changed

- **`transparent` mode now truly transparent** — replaced the checkerboard
  background draw with `gl.clear()` to `(0,0,0,0)`. Canvas CSS background
  is automatically set to `transparent` when `transparent` or `reveal` is
  active. This enables proper alpha compositing with the page.
- **Hero title uses `transparent` mode** — "SVELTE FLUID" text now composites
  directly over the FluidBackground with no opaque rectangle.
- **Demo page pointer-events** — `<main>` set to `pointer-events: none` so
  background fluid splats work across the full page. Interactive elements
  (cards, links, code blocks, playground) re-enable pointer-events.
- Container shapes section description updated: "Five analytical shapes
  plus arbitrary SVG paths" (was "Four").

### Earlier development notes

The entries below were drafted during development before the release flow was
finalised. Kept as historical record; superseded by the consolidated entries above.

### Added

- **SVG path container shapes** — new `{ type: 'svgPath' }` variant for
  `containerShape` confines fluid to arbitrary SVG paths or Canvas 2D
  text. Rasterized to a mask texture via `OffscreenCanvas` + `Path2D`.
  Supports `d` (SVG path data), `text` (Canvas2D fillText), `font`,
  `viewBox`, `fillRule`, and `maskResolution` fields. See ADR-0024.
- `SvgPathFluid` preset — fluid shaped by a mask texture (originally a star, now an ampersand glyph).
- `/svelte-fluid` route — "SVELTE FLUID" as fluid-filled text with
  `splatOnHover` interaction.
- `/svg` test route — 4 SVG path test cases (star, heart, rect, evenodd).
- 20 new tests for `svgPath` equality, CPU mask sampling, and
  `maskAreaFraction` (126 total, up from 106).
- **Glass refraction/reflection post-processing layer** — new `glass`
  prop adds a post-processing pass that simulates a glass container over
  the fluid. Two rendering models: **hemisphere orb** (circles) uses
  Snell's law via GLSL `refract()` for physically correct lens distortion
  across the entire surface; **rim model** (frame, roundedRect, annulus,
  svgPath) applies refraction at the container boundary. See ADR-0025.
  - `glass: boolean` (default false) — enables the glass pass. Allocates
    a sceneFBO (RGBA8, canvas resolution) when true.
  - `glassThickness: number` (default 0.04) — rim model band width in UV
    units. Ignored by the orb model. Bucket A.
  - `glassRefraction: number` (default 0.4, 0–1) — distortion strength.
    Mapped to IOR 1.0–2.0. Bucket A.
  - `glassReflectivity: number` (default 0.12, 0–1) — Fresnel F0 for
    specular intensity. Bucket A.
  - `glassChromatic: number` (default 0.15, 0–1) — chromatic aberration
    strength. Splits R/G/B into separate refraction channels. Bucket A.
  - Fluid-driven lighting: all specular and rim glow are modulated by
    the refracted fluid brightness. No fluid = no highlights.
  - New "Container effects" section on demo page with 4 cards: Crystal
    orb, Soft lens, Portal ring, Glass frame.
- **Mouse-tracked specular** — glass specular highlight follows the
  cursor via `uLightScreenPos` uniform. Always-on when glass is active.
- **Glass + transparent mode** — fixed checkerboard routing so `glass`
  and `transparent` work together. Glass shader outputs correct alpha
  per model (edgeFade for orb, glassMask/sdf for rim).
- Playground **glass controls** — ControlPanel gains a "Glass effect"
  section with `glass` toggle and sliders for thickness, refraction,
  reflectivity, chromatic. Auto-sets containerShape to circle when
  glass is toggled on without a shape.
- **Fluid-filled hero title** — home page `<h1>` replaced with two
  Fluid instances rendering "SVELTE" and "FLUID" as svgPath text
  containers with vigorous automatic splats.
- **Code snippets on demo cards** — Card component gains a `snippet`
  prop with `</>` toggle and Copy button. All 18 demo cards wired with
  copy-pasteable code showing the minimal props to reproduce each effect.
- `splatOnHover` prop — when true, moving the mouse over the canvas
  creates splats without requiring a click. The splat velocity follows
  the cursor movement. Hot-updatable (Bucket A).
- `engines` field in `package.json` (`>=18`).
- npm version badge in README.
- "Why this library?" differentiator section in README.
- Hero GIF showing 4 presets (LavaLamp, Aurora, InkInWater, CircularFluid).
- `/capture` route for recording hero media from a 2×2 preset grid.
- `bun run test` step in CI workflow — 106 tests now run on every push.
- `lazy` prop on `<Fluid />` and all preset wrappers — defers engine
  construction until the container enters the viewport (with a 200px
  rootMargin lookahead) and tears it down when it leaves. Recommended
  for any page with more than ~6 simultaneous instances. Bounds the
  live WebGL context count under the 8–16/tab browser cap.
- `aria-label` forwarding on every preset wrapper for accessibility.
- Demo playground gains a "Reset to defaults" button and a "Copy as
  code" button that emits the current slider state as a
  `<Fluid ... />` snippet.
- Demo gains a "Get started" block with install command and a 3-line
  usage example, plus a header link bar (GitHub, README, Docs,
  Contribute) and a footer link bar (GitHub, Issues, License).
- GitHub Actions CI workflow runs `check`, `prepack`, and `build` on
  every push and pull request.
- `CHANGELOG.md` (this file), `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  GitHub issue templates, and a pull-request template.

### Changed

- Mask texture rasterized at canvas aspect ratio (not always square) —
  fixes vertical squish on non-square canvases for all `svgPath` shapes.
- SVG path mode uniform-scales the path to fit the mask rectangle,
  preserving the path's own aspect ratio with centering.
- Demo "Container shapes" section: 4 → 5 cards (added SVG path star).
  Description updated to mention SVG paths alongside analytical shapes.
- `buildSnippet` in playground `ControlPanel` now emits `autoSplat*`,
  `initialDensity*`, and `splatOnHover` fields when non-default.
- Bloom/sunrays auto-suppress on small canvases (<600px) now applies
  unconditionally — presets that explicitly pass `bloom={true}` no
  longer bypass the guard.
- Demo page: 15 → 21 instances (added 4 "Container effects" cards,
  2 fluid hero title instances). Container shapes description reverted
  from 6 → 5 cards.
- `FluidEngine.drawDisplay()` container shape uniform-setting extracted
  to `setContainerShapeUniforms()` helper, shared with `drawGlass()`.
- Demo page: removed invisible hero background (saved 1 WebGL context),
  reordered sections (presets first), fixed grid to 2 columns (no more
  3+1 asymmetry), moved shape presets to a "Container shapes" subsection
  under Configuration, added `splatOnHover` to config example cards.
- CircularFluid preset: `densityDissipation` 0.08 → 0.15, changed from
  5 splats every 2s to 1 splat every ~0.8s for more organic appearance.
- InkInWater preset: `autoSplatRate` 0.5 → 0.167 (3× slower drops).
- README: added npm/pnpm install options alongside bun, deduplicated
  feature bullets into "Why this library?" section, added `splatOnHover`
  to props table.
- Demo page copy: "seven presets" → "eight", "~28-prop" → "40+",
  `bun add` → `npm install`, rewrote card descriptions from raw prop
  syntax to human-readable prose.
- `RGB` interface now documents per-call-site unit conventions:
  `backColor` is **0–255** (CSS-style, normalized internally),
  `PresetSplat.color` and `FluidHandle.splat` are **0–1** linear with
  HDR allowed. The previous JSDoc on `backColor` incorrectly claimed
  0–1.
- `PresetSplat` docstring corrected: `dx`/`dy` are **not** multiplied
  by `splatForce` (only pointer-driven splats are scaled by it).
- `FluidConfig.pointerInput` is now **hot-updatable** (Bucket A) — the
  engine installs/removes canvas + window listeners on transition.
  Previously the scalar was updated but the listeners were never
  reconciled.
- `package.json` exports map gains `"import"` and `"default"`
  conditions for non-Svelte-aware bundlers (plain Vite, Webpack,
  Rollup, Astro non-Svelte adapters, bare Node imports). Previously
  only `"svelte"` and `"types"` were defined.
- `package.json` `sideEffects` corrected from `["**/*.css"]` (no CSS
  ships) to `false`, enabling full tree-shaking.
- Hero overlay in the demo now has a subtle dark gradient veil so
  foreground text reads against any colored fluid state.
- Demo `+page.svelte` LavaLamp card description corrected from "dim
  purple ambience" to "warm-silver background" (matches the actual
  preset).

### Fixed

- `hdrMultiplier` aspect correction for circle and annulus shapes —
  area fraction now divides by aspect (`pi*r^2 / aspect`), fixing
  over-bright bloom on wide canvases.
- `ShapePreview` outer boundary visibility — 3px translate+scale inset
  prevents frame shapes at `outerHalfW=0.5` from being clipped by the
  card's `overflow: hidden`.
- Default pointer color sentinel `b: 300` → `b: 0` (upstream heritage,
  never rendered, but out-of-range value cleaned up for public API).
- Defensive optional chaining on `pointers[0]` in mouse handlers.
- Try-catch around async dithering texture upload to guard against
  context loss during image decode.
- `pointerInput` hot-update lifecycle — toggling at runtime now
  correctly installs or removes event listeners and drains in-flight
  pointer state.
- Phantom `<meta name="text-scale">` tag removed from `app.html`.

### Documentation

- ADR-0025: Glass refraction/reflection post-processing layer —
  documents the hemisphere orb model, rim model, chromatic aberration,
  fluid-driven lighting, Snell's law refraction, and rejected
  alternatives.
- `CLAUDE.md` updated with glass bucket docs (`glassChromatic`),
  `glass` sceneFBO lifecycle, demo instance count (19).
- ADR-0024: SVG path container shapes via mask texture — documents
  design decision, mask rasterization pipeline, rejected alternatives
  (JFA, analytical SDF, separate shader program).
- `CLAUDE.md` updated with svgPath documentation, mask texture rebuild
  bucket, and demo instance count (15).
- ADR 0005 (hot-update buckets) updated with `initialDensityDissipation`,
  `initialDensityDissipationDuration`, `pointerInput`, and `presetSplats`
  classifications.
- ADR 0001 (bun and uv only) reframed as a project-policy statement
  with the `.npmrc engine-strict=true` mechanism documented.
- `docs/contributing.md` gains a "Hard rules" section listing the five
  non-negotiables: bun-only, runes-only, .js extensions,
  ADR-before-engine-changes, no new runtime deps. Release workflow
  expanded with semver policy and explicit CHANGELOG step.
- `docs/porting-notes.md` "seven preset components" → "six".
- `docs/learnings/presets.md` Plasma sunrays state corrected — Plasma
  keeps sunrays on at weight 0.35, contradicting the previous text.
- `Aurora.svelte` header documents the intentional `sunraysWeight: 1.4`
  trade-off (above the safe ceiling derived in the learnings doc) and
  how to fork to a more restrained version.

[Unreleased]: https://github.com/tommyyzhao/svelte-fluid/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tommyyzhao/svelte-fluid/releases/tag/v0.1.0
