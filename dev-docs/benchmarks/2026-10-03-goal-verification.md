# 1.0 goal verification — 2026-10-03

**Evidence baseline: `c873fdf`. Not a declaration that all 1.0 goals are met.**
Durable metadata only; short SHAs identify commits, not retroactive runtime certification.
`/tmp` logs, manifests and PNGs are ephemeral, **not durably preserved** by this commit;
no source artifacts or binaries copied.

## Combined release verification

Lead-reported command at `c873fdf`, exit 0:
```sh
VITEST_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' bun run verify:release
```
Log: `/tmp/verify-combined-independent-main.log`.
SHA256: `b7a7502ffbd8c142560f471ef505cf484d45af827a8c06681930065474db993c`.
Verified log totals: **52 Node files / 859 tests; check 470 files / 0 errors,
0 warnings; 35 hardware-browser files / 296 tests; build and prepack passed**.
Prepack includes publint and strict public-declaration checks.
The log contains a Vite dependency-scan diagnostic; suites and final command passed.
Reduced test count follows foil-exclusive deletion, not lost retained-feature coverage.
Combined full-green runs plus focused prior runs: **no repeated/no-flake guarantee**.
Final AA-inclusive lead run at `ea56a93`, same command, exit 0:
`/tmp/verify-final-aa-main.log`; SHA256
`03b9c4dffa928df675d9eae10ac93a9bf86914fcfe363fcd3f1fe0873aa30da6`.
**52 Node files / 859 tests; 470 checked / 0 errors or warnings; 35 browser files /
298 tests; build/prepack/publint/public declarations passed**. Earlier 296 remains historical.

## Independent geometry and visual evidence

Current contract: [ADR 0100](../decisions/0100-independent-deposited-thickness.md).
[ADR 0087](../decisions/0087-optical-depth-lighting.md) optical-depth measurements
are superseded historical evidence, not current RGB geometry or shaded-parity claims.
Tests at `c873fdf`: `src/lib/engine/__tests__/lighting.test.ts`,
`src/lib/engine/__benches__/lighting.browser.test.ts` and `idle.browser.test.ts`.

- Before: `b42a4c5`, `/tmp/independent-height-evidence/before-{preset}-{light,dark}-dpr3.png`.
- Final lighting captures: `1aee593` (true physical normal from `fd1e4de`),
  `/tmp/independent-height-evidence-true-normal/after-{preset}-{light,dark}-dpr3.png`.
- Manifests: `/tmp/independent-height-evidence/manifest.json` (56 before/initial-after
  rows), `/tmp/independent-height-evidence-true-normal/manifest.json` (28 final-after rows).
  Final comparison selects 28 before + 28 true-normal after; earlier after images are not final.
- Native backing **1441×902**, fractional CSS **480.25×300.5**, actual DPR **3**,
  seed **1234**, **150 fixed frames**. PNG **1446×906** includes the CSS border;
  it is not the backing size. Manifests report GL error 0 and no page errors.
- GasFlare, Venturi, Karman, TeslaValve: all eight light/dark PNG pairs byte-identical
  (locally checked). Ten shaded presets intentionally differ.
- Lead reviewed LavaLamp before/after: grain removed with true-normal lighting;
  Plasma reviewed. Independent review now covers all 14 presets, light/dark:
  no obvious new blank output, clipping, seams, grain, palette or silhouette damage.
  Existing Aurora dark highlights / faint SVG light remain; Venturi stepped mask /
  TeslaValve inlet banding predate this change. Review is scoped visual evidence,
  **not final owner taste approval, calibrated physics or GPU certification**.
- Owner-approved direction is independent geometry, not final shaded-port taste.
  `e0c8c67` and intervening guards change idle visibility, not lighting;
  `332f688` changes docs. Captures remain lighting evidence for `c873fdf`, not recaptures.

## Native UI, contrast and caustics

- Liquid toggle: `75b103d` + `16e1685`; no foil. Evidence:
  `/tmp/liquid-toggle/toggle-{light,dark}-{off,on,focus}-{1,2,3}x.png`.
  Independent review: clean liquid pill, readable focus; native state tests in
  `src/lib/engine/__benches__/toggle.browser.test.ts` at `c873fdf`.
  Owner requested only liquid replacing metal; **final-look owner approval pending**.
- Native AA/sizing lane through `b2c4062` (fractional fix `01eaf1f`, observer `a9ea378`):
  `/tmp/native-aa-{before,after}-{foil,enamel,button}-{integer,fractional}.png`.
  Foil is historical, now deleted. Fractional button CSS **162.625×56.625**, DPR 3:
  before **489×171**, after **487×169**. `native-sizing.browser.test.ts` records behavior.
  FluidText actual-pixel proof `b4af8ee`, `__benches__/contrast.browser.test.ts`:
  mounted **16px Arial**, full opaque halo outside zero glyph coverage, light/dark,
  native DPR 1/2/3. Minimum **4.5422249596 / 4.5577683197** versus explicit-3 fixture
  **3.03347 / 3.04483**; policy comparison, not a historical-build capture.
  Evidence `/tmp/small-text-contrast/{light,dark}-dpr{1,2,3}-{previous-3,default-4.5}.png`
  + matching theme/DPR JSON; six focused tests passed twice. Lead DPR-3 review:
  stronger outline, unchanged glyph. `f11a5a8` (from `bd72c97`) only clarifies JSON metadata.
- Caustics final guards: `a90ddae`; lead reports **29 hardware tests passed at each
  DPR 2 and DPR 3**. Logs `/tmp/caustics-aa-browser-dpr{2,3}-final.log`;
  tests `src/lib/engine/__benches__/caustics.browser.test.ts` at `c873fdf`.
  Captures after `166cfd9`, before final fallback guards:
  `/tmp/caustics-aa-{before,after}-dpr3-{native,ripple,failing}.png`.
  Valid DPR 3 backing **2160×1200**; invalid DPR 2 baseline excluded.
  [ADR 0094](../decisions/0094-liquid-drop-zone-and-caustics.md) semantics unchanged:
  supported initially-AA static-solid content has nondegradation evidence;
  unsupported content gets no effect. **No universal authored-content AA claim**.

## Remaining open / ceilings

- `svelte-fluid-7n8`: **GPU budget uncertified**. User selected manual Xcode install;
  native Xcode absent, `xctrace` cannot run. Wall benchmarks are not GPU execution proof.
  See [GPU measurement blocker](gpu-measurement-blocker.md), recorded at `3788960`.
- `svelte-fluid-dv2`: geometry implemented; hybrid cache scope narrowly accepted via
  owner delegation, not universal shared compilation. See amended
  [ADR 0093](../decisions/0093-fluid-engine-on-shared-gl-host.md) at `c873fdf`.
- Ordinary idle and byte fallback implemented; non-dye flow convergence unresolved.
  Arbitrary-height refraction/glass/tone/contrast combinations can remain awake under
  exact-height guards. [ADR 0099](../decisions/0099-settle-visible-idle-fluid.md) and
  ADR 0100 limits remain; **no universal idle claim**.
- Legacy DPR observer cannot guarantee unsupported screen-move notifications (`b2c4062`).
- FluidText full opaque halo pixel-AA **scoped proven**; no AA-blended edge, interior
  glyph, arbitrary font/background or universal WCAG claim. Enamel/toggle owner taste pending.
- Declaration gate: `src/lib/engine/__tests__/public-surface.test.ts` and
  `scripts/check-public-declarations.mjs` at `c873fdf`; passing it is not goal completion.
