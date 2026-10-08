# E4 — Component excellence

Protocol: [ADR 0111](../decisions/0111-component-excellence-eval.md). Frozen library: `2a92165`. Measurement only; no component fixes.

Run: `bun scripts/component-eval.mjs --self-check`, then `baseline --cpu-only`, then `baseline --hardware`. CPU fixtures remain machine-local until hardware completes; `--cleanup` removes only this lane's recorded fixture.

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version). R=2 fresh browser contexts, 800×600, DPR 1.

## Scores

Wilson 95% intervals are descriptive: repeated component checks are correlated. N/A excluded; missing reported, never passed.

| Split | Passed / observed | Pass rate | Wilson 95% | Missing | N/A | All-pass components |
|---|---|---|---|---|---|---|
| train | 77/88 | 87.5% | 79.0%–92.9% | 0 | 2 | 3/9 |
| test | 48/50 | 96.0% | 86.5%–98.9% | 0 | 0 | 4/5 |

## Component results and bundle cost

Cells show R1/R2. a=accessibility, b=reduced motion, c=SSR+fallback, d=theming, e=install. Gzip level 9; complete one-component JS+CSS graph including Svelte runtime.

| Component | Split | a | b | c | d | e | gzip bytes |
|---|---|---|---|---|---|---|---|
| Fluid | test | pass/pass | pass/pass | fail/fail | pass/pass | pass/pass | 98412 |
| FluidBackground | test | pass/pass | pass/pass | pass/pass | pass/pass | pass/pass | 100485 |
| FluidReveal | test | pass/pass | pass/pass | pass/pass | pass/pass | pass/pass | 100449 |
| FluidDistortion | train | pass/pass | pass/pass | pass/pass | pass/pass | fail/fail | 101127 |
| FluidStick | test | pass/pass | pass/pass | pass/pass | pass/pass | pass/pass | 100654 |
| FluidText | train | pass/pass | pass/pass | pass/pass | pass/pass | pass/pass | 99766 |
| EnamelText | train | pass/pass | pass/pass | pass/pass | pass/pass | pass/pass | 42621 |
| InkPaper | train | pass/pass | pass/pass | pass/pass | pass/pass | pass/pass | 41813 |
| LiquidButton | train | fail/fail | pass/pass | pass/pass | pass/pass | pass/pass | 48439 |
| LiquidCaustics | test | pass/pass | pass/pass | pass/pass | pass/pass | pass/pass | 49684 |
| LiquidDropZone | train | fail/pass | pass/pass | pass/pass | pass/pass | pass/pass | 49750 |
| LiquidSegmented | train | fail/fail | pass/pass | pass/pass | pass/pass | pass/pass | 47230 |
| LiquidToggle | train | fail/fail | pass/pass | pass/pass | pass/pass | pass/pass | 49705 |
| splash-cursor | train | pass/pass | pass/pass | fail/fail | na/na | pass/pass | 98909 |

## Candidate work queue (causes, not fixes)

- **2 cells — ssrFallback: SSR specimen contains only blank/decorative canvas**: Fluid R1 (test), Fluid R2 (test).
- **2 cells — install: Docs/registry route blank after pointer stroke**: FluidDistortion R1 (train), FluidDistortion R2 (train).
- **2 cells — a11y: Focus indicator invisible: control 0**: LiquidButton R1 (train), LiquidButton R2 (train).
- **2 cells — a11y: Enter does not activate radio; Space does not activate radio**: LiquidSegmented R1 (train), LiquidSegmented R2 (train).
- **2 cells — a11y: Enter does not activate checkbox**: LiquidToggle R1 (train), LiquidToggle R2 (train).
- **2 cells — ssrFallback: SSR specimen contains only blank/decorative canvas; No meaningful accessible no-GPU fallback/content**: splash-cursor R1 (train), splash-cursor R2 (train).
- **1 cells — a11y: Enter does not activate file**: LiquidDropZone R1 (train).

## Failure interpretation before candidate design

- **Harness-first: LiquidButton focus.** The pre-registered computed outline/shadow proxy fails because live mode removes the CSS outline and paints its ring in WebGL (`LiquidButton.svelte`, live focus style). This is not evidence that the actual ring is absent. Static focus screenshot verification is a known measurement gap; do not fix the button from this proxy alone.
- **Harness-first: native keyboard contract.** LiquidToggle implements native Space, not Enter. LiquidSegmented implements native arrows; the Space probe targets an already selected radio after the arrow sweep, which need not fire another click. Strict pre-registered failures remain scored, but are not accessibility defects by themselves.
- **Docs integration: FluidDistortion.** The canonical snippet supplies no width/height; its percentage-height wrapper collapses inside the fixture parent with only min-height. The explicitly sized specimen renders successfully. This is a copy-paste layout gap, not a GPU/image-loading failure.
- **Decorative SSR contract.** Fluid emits an empty decorative canvas on the server, then supplies its accessible no-GPU message after mount. splash-cursor emits nothing during SSR and hides its entire decorative subtree from AX. Strict meaningful-content requirement fails both; adding meaningless labels solely to improve the score would be wrong.
- **Hardware noise: LiquidDropZone.** Enter filechooser observation failed R1, passed R2; 800 ms event timeout. Reproduce before changing the control.

## Noise and known gaps

- LiquidDropZone: R1/R2 disagree on a11y.
- axe pending owner approval.
- Static UI judge calibration pending; no baseline visual verdict.
- Wilson intervals pool correlated repeated checks; descriptive only.
- Computed focus proxy does not detect the WebGL-painted LiquidButton ring; native Enter/selected-radio probes are strict protocol limitations, not established component defects.
- Frozen keep rule has a ceiling: at held-out n=50 even 50/50 Wilson lower=92.87% cannot exceed baseline point=96%; no same-size candidate can be kept without an explicitly new pre-registered protocol.
- Visual is candidate-only. Baseline static PNGs and SHA-256 are frozen under `evals/components/baseline/`; no visual score claimed. Reuse E2 side randomisation, swapped trials, tie collapse and calibrated no-worse logic; calibrate static UI before use.
- Strict Enter+Space rule can fail native switches/radios that intentionally implement Space/arrow semantics. This was pre-registered, not changed after observation.
- No contrast, screen-reader user testing, touch, mobile GPU, or temporal smoothness claim.
