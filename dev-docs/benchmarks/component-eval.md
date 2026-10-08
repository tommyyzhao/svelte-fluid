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

## Amendment 1 runs (post-hoc)

Original baseline above remains historical. ADR 0111 Amendment 1 was committed before these observations. R=2 scored cells; keyboard/filechooser R=3 majority per cell. Focus pixels, native role contracts, decorative layout checks apply to both splits. No held-out gain claim.

### baseline-a1

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version). Complete: true.

| Split | Passed / observed | Pass rate | Wilson 95% | Missing | N/A | All-pass components |
|---|---|---|---|---|---|---|
| train | 84/88 | 95.45% | 88.89%–98.22% | 0 | 2 | 7/9 |
| test | 50/50 | 100.00% | 92.87%–100.00% | 0 | 0 | 5/5 |

Failures (ranked by cells):

- **2 cells — install: Docs/registry route blank after pointer stroke**: FluidDistortion R1 (train), FluidDistortion R2 (train).
- **2 cells — ssrFallback: Decorative SSR missing own layout element or shifts on hydration**: splash-cursor R1 (train), splash-cursor R2 (train).

Baseline-a1 observations:

- LiquidButton focus: 1219/5376 perimeter pixels changed (22.67%), zero noise pixels, both repetitions; computed CSS proxy false. Hardware ring is visible.
- LiquidSegmented arrows/Space pass R=3. A dynamic `input:not(:checked)` locator initially re-resolved after selection; superseded evidence retained, stable-index rerun passes. No component change.
- LiquidToggle native Space passes; Enter not required.
- LiquidDropZone Enter R1 false/true/true, R2 true/true/true; Space all pass. Majority passes, no component fix.
- Fluid decorative SSR reserves 320×180, identical hydration box, no layout shift; no-GPU message correct.
- splash-cursor emits no own SSR element; fixed overlay does not shift normal flow, correctly aria-hidden after mount, but fails amended SSR-element rule. No meaningless label added.
- Supplemental install R3 agrees with R1/R2 for all 14 components. R3 excluded from frozen scored denominator.

### round-1

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version). Complete: true.

| Split | Passed / observed | Pass rate | Wilson 95% | Missing | N/A | All-pass components |
|---|---|---|---|---|---|---|
| train | 86/88 | 97.73% | 92.09%–99.37% | 0 | 2 | 8/9 |
| test | 50/50 | 100.00% | 92.87%–100.00% | 0 | 0 | 5/5 |

Failures (ranked by cells):

- **2 cells — ssrFallback: Decorative SSR missing own layout element or shifts on hydration**: splash-cursor R1 (train), splash-cursor R2 (train).

Round verdict: **revert**. Train lower Wilson 92.09% does not exceed baseline point 95.45%; held-out lost passing cells=0. Held-out documented as no gain. Docs-only library tree unchanged; no judged visual win claimed.

## Outcome

**E4 documented as no gain.** Held-out is already 50/50 (100%) under
Amendment 1, so no candidate can improve its pass rate at this population size.
The historical held-out Wilson gain gate was already unreachable at 48/50.
No new gain rule was adopted. A proposed paired-rule Amendment 2 was withdrawn
before candidate observations; no Amendment 2 commit exists.

Round 1 was evidence-only, one train-designed root cause: explicit
`width={640} height={360}` in the FluidDistortion canonical snippet, matching
guidance in the shared `/SKILL.md` and `/llms-full.txt` generator, plus one
snippet-drift test. No component default, engine, registry or specimen changed.
Fresh copy-paste sync/check/build passed. FluidDistortion install was
**fail/fail/fail** at baseline, **pass/pass/pass** with sizing; screenshot
nonblank fractions were 99.60%, 99.96%, 99.18%. The supplemental third install
observation agreed with the first two for every component in both runs.
There were **zero pass→fail cells on train or held-out**, including install R3.
Library source tree stayed `0d1ed492720eedb57492bd2456d966fa0533ab3a`.
This establishes a deterministic train-cell repair, not a held-out/goal gain.

Candidate archived at commit `ce78244`, local tag
`archive/e4-round1-distortion-docs`; then all three public docs/test files
restored to `67dd70c`. Round evidence retained. Revert required both by the
train CI rule (92.09% < 95.45%) and the no-held-out-gain goal outcome.
No push, merge, engine change or Beads write from this lane.

### Owner-facing remaining queue (ranked)

1. **FluidDistortion docs sizing — 2 scored train cells, R3 agrees.** Known
   copy-paste defect remains after protocol-mandated revert. Archived docs-only
   repair available for an independent owner decision; no component-size change
   necessary. Generated agent references and drift test travel with the archive.
2. **splash-cursor SSR — 2 scored train cells.** Empty SSR lacks its own
   layout-reserving element under A1. Fixed overlay does not cause normal-flow
   shift and remains aria-hidden after mount. Resolve SSR contract/implementation
   separately; never add meaningless accessible labels.
3. **LiquidDropZone Enter observation noise.** A1 majority passes both runs;
   baseline first attempt failed, next two passed; remaining attempts pass.
   No majority failure, no component fix. Diagnose only if future R=3 majority
   fails, preserving the 800 ms event timeout and native file-input contract.

### Verification and cleanup

- Candidate: `bun run test` 883/883; `bun run check` zero errors/warnings;
  `bun run prepack`/publint pass; full `bun run build` pass. Generated
  `build/SKILL.md` and `build/llms-full.txt` both contained the sized recipe.
- Reverted branch: original docs-generator tests restored; full test/check/prepack
  rerun before restore commit. Harness `--self-check` passes.
- Renderer both runs: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max,
  Unspecified Version). Installed headless Chrome, no software renderer/unsafe
  flags, no xctrace. Round GPU hold 440994 ms (7m21s), released
  2026-10-08T07:58:13.155Z; strict alternation with observed E1 acquisition/release.
- Owned baseline and round `/tmp/svelte-fluid-e4-*` fixtures deleted using their
  recorded ownership; owned Chrome/context/preview processes closed; E4 lock
  released. Other lanes' processes/locks untouched. Worktree retained locally
  because commits are not pushed; no forced cleanup.
