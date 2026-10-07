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

2026-10-04 combined lead verification at `6bfdfcf`, command exit 0:
```sh
VITEST_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' bun run verify:release
```
Ephemeral log: `/tmp/verify-stationary-main-2026-10-04.log`; SHA256
`7dd717816de8e1a410bbbb592f8f3b50e54058771276646c38bb76b27c8fd692`.
**52 Node files / 863 tests; 35 hardware-browser files / 310 tests; check, build,
prepack, publint and strict public-declaration checks passed.** This lead result supersedes
the lane's 309-test count, which predates an additional HDR test. The log includes an
existing dependency-scan diagnostic and `import.meta.env` packaging advisory; command
succeeded. This is a combined verification, not a repeated/no-flake guarantee.

2026-10-04 DPR revision: local `main` at `607912b` reviewed (`07ec7d5` + `607912b`).
`Fluid` rearms resolution `matchMedia` using the latest DPR, including fractional CSS
sizing and cap scheduling. Fixed-field dimensions remain identity; default adaptive dye
resolution changes **96→289→192**, with state resampled, not spatially identical.
Deterministic callback tests verify wiring, not physical-screen/zoom notification behavior.
Two completed `verify:release` runs at the same revision, both exit 0:

| Log (ephemeral) | SHA256 | Results |
|---|---|---|
| `/tmp/verify-dpr-main-2026-10-04-run1.log` | `5bcf2e3433eeaae903b73ba778ca370f4b00b32afc12042d49dcb90a4b4eafc7` | 52 Node files / 863 tests; 35 hardware-browser files / 315 tests; 470 checked files / 0 errors or warnings; build, prepack, publint and public declarations passed |
| `/tmp/verify-dpr-main-2026-10-04-repeat.log` | `d3b219d235ae3ded9370481b1a5793b40f5991c137db39affc3f39b61e35c423` | 52 Node files / 863 tests; 35 hardware-browser files / 315 tests; 470 checked files / 0 errors or warnings; build, prepack, publint and public declarations passed |

Command for each run:
```sh
VITEST_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' bun run verify:release
```
The interrupted `/tmp/verify-dpr-main-2026-10-04-run2.log` has SHA256
`709302debb9568e4a8ecaa5afba32da678743e1bcd3252ed6c9d3ac76309f3ff`:
Node/check passed, but browser startup was stopped by the lead's 10-minute command
time limit (`SIGTERM`). It is neither a completed pass nor a test failure. Logs are
ephemeral, not durable artifacts; existing scan/advisory warnings persist. Two completed
green runs provide limited repeated evidence, not a universal no-flake guarantee.

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

- `svelte-fluid-7n8`: **p95 <2 ms goal remains open after the stable full matrix**.
  [ADR 0105](../decisions/0105-stable-gpu-budget-protocol.md)'s pre-registered
  N600/R3/warm200/seed5 protocol, unchanged local-main WebGL2 `fbec39a`, M1 Max,
  native DPR2: **26 PASS /14 FAIL /3 INCOMPLETE** across all43 scenes. All130
  attempts retained: **87 PASS /39 FAIL /3 INCONCLUSIVE /1 CONTENDED**;126/129
  slots clean, zero GPU exits, one bounded contention retry. Incomplete: SvgPathFluid
  own800×500 (15s export timeout), Karman shared1440×900 (recorder-finalisation
  timeout; two clean FAILs), LiquidDropZone (run3 alignment7.737208ms exceeds4ms).
  Enamel64 run3 foreign ghostty overlap6.391% triggered the registered30s retry;
  clean retry passed. No foreign process signalled. Worst complete FAIL: Karman
  own1440×900 **3.136128ms**, gap **1.136128ms**; incomplete shared Karman has
  observed clean p95 **3.430248 /3.527541ms**. InkPaper remains FAIL,
  worst **2.165541ms**, gap **0.165541ms**. Historical60-frame post-optimisation
  **18 PASS /25 FAIL** remains unchanged; comparison:10 old FAIL scenes now PASS,
  14 remain FAIL, one INCOMPLETE; no old PASS becomes FAIL, two become INCOMPLETE.
  Different sampling/repeat accounting establishes no causal speed-up/regression.
  [ADR 0101](../decisions/0101-p95-gpu-budget.md)'s post-hoc selected-row result
  **28 PASS /15 FAIL** and strict-max **18 PASS /25 FAIL** also remain history.
  Every attempt median/p95/max, clean cross-run spreads, completeness and exact
  export hashes appear in the [stable matrix](gpu-budget.md#stable-protocol-full-matrix-adr-0105--2026-10-06).
  Post-completion unchanged replay again hit15s export timeout; diagnostic raw
  retained-trace export took24.258628s, no new capture or verdict replacement.
  GPU lock released; exact owned processes absent; user Chrome untouched.
  Scanout, per-shader shares and total browser/OS-cost compliance remain unproved.
  **Closed by owner reprioritisation (2026-10-06):** <2 ms p95 is a guideline, not a
  gate; the requirement is not draining laptop/phone batteries. Accepted
  [ADR 0106](../decisions/0106-teslavalve-quality-budget.md) (TeslaValve sim128/p26/d512,
  certified PASS). Karman, GasFlare and the near-misses stay unchanged as accepted
  overage; `autoPause` (default on) stops offscreen and hidden-tab instances.
- `svelte-fluid-dv2`: geometry implemented; hybrid cache scope narrowly accepted via
  owner delegation, not universal shared compilation. See amended
  [ADR 0093](../decisions/0093-fluid-engine-on-shared-gl-host.md) at `c873fdf`.
- Empty-flow fix `26511d7`; narrow inert fixed point `ff138e7` + `6bfdfcf`
  implemented: exact-zero velocity, actual power-of-two grids, no driver/mask/scalar,
  inert coefficients and finite/clamp-valid fields. Conservative unsupported cases
  still remain awake; **no universal idle claim**. Tests cover float/byte/manual
  WebGL1/MacCormack and rectangular HDR with `pressureIterations: 3`, shared visible
  retention 250ms, zero RAF/subscribers. Async texture wake behavior was source-reviewed,
  not separately hardware-tested.
  [ADR 0099](../decisions/0099-settle-visible-idle-fluid.md) and ADR 0100 limits remain.
  No appearance change or preset recapture needed for this lifecycle change; no new
  before/after owner approval or GPU certification claimed.
- `Fluid` now rearms its resolution media-query listener; actual physical-screen/zoom notification behavior remains unmeasured. This does not expand legacy-browser support; existing reduced-motion listener requirements remain. Other components' legacy observer still cannot guarantee unsupported screen-move notifications (`b2c4062`).
- FluidText full opaque halo pixel-AA **scoped proven**; no AA-blended edge, interior
  glyph, arbitrary font/background or universal WCAG claim. Enamel/toggle owner taste pending.
- Declaration gate: `src/lib/engine/__tests__/public-surface.test.ts` and
  `scripts/check-public-declarations.mjs` at `c873fdf`; passing it is not goal completion.
