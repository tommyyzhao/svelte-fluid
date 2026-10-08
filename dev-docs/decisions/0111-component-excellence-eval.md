# ADR 0111: E4 component excellence (pre-registered)

**Status:** Accepted
**Date:** 2026-10-07

## Context

The shadcn-style component goal needs evidence independent of fluid-energy and
image quality. This lane measures only: no library, component, preset or public
API changes. This protocol is committed before baseline observations.

## Decision

### Frozen population and split

The 13 root `.svelte` exports verified against `src/lib/index.ts`, plus the
`splash-cursor` registry item, are ordered by
`sha256("svelte-fluid-e4-split-v1:" + name)`. Held out is the first
`ceil(14 * 0.30) = 5`. Case and spelling below are part of the salt input.

| Hash order | Component | Split |
|---|---|---|
| 1 | FluidStick | Held out |
| 2 | FluidReveal | Held out |
| 3 | Fluid | Held out |
| 4 | FluidBackground | Held out |
| 5 | LiquidCaustics | Held out |
| 6 | InkPaper | Train |
| 7 | splash-cursor | Train |
| 8 | LiquidSegmented | Train |
| 9 | LiquidToggle | Train |
| 10 | EnamelText | Train |
| 11 | FluidText | Train |
| 12 | FluidDistortion | Train |
| 13 | LiquidButton | Train |
| 14 | LiquidDropZone | Train |

Candidates are designed and debugged only on train. Held-out specimens are
used for the frozen baseline and one keep/revert decision per candidate.

### Specimens and checks

Each component gets a fixed, named-content specimen using only documented
props, at 800×600 CSS px, DPR 1, seed 5 where supported. Controls have visible
labels; wrappers have a native named child button; EnamelText is in a heading;
FluidText/FluidStick use their documented text mode; FluidDistortion uses a
local image and documented `posterAlt`. Fluid and splash-cursor are decorative,
without a fabricated ARIA role. Auto-animation is enabled where documented to
exercise reduced-motion suppression. Test fixtures, not library code, supply
handlers and image assets.

Checks a–e each produce pass/fail, evidence and a cause. A missing observation
is **missing**, never a pass. Only theming may be N/A. N/A is excluded from the
score denominator; missing checks are reported separately and prohibit a
complete-baseline claim. Compound checks pass only if every subcheck passes.

**a. Accessibility.** Use Playwright `ariaSnapshot()` and CDP
`Accessibility.getFullAXTree`; retain role/name evidence, not source guesses.
Every native control in the specimen must have a nonempty accessible name and
its expected native role. Text images must expose an image role named by text;
EnamelText must preserve the containing named heading. Decorative canvases
must be excluded from the AX tree; a decorative-only component is allowed no
role/name, because naming a decorative background is incorrect. Wrapper child
controls must retain semantics. Tab must reach each independent enabled control;
a native radio group has one Tab stop, then ArrowRight must reach every option.
Every reached control must have a visible computed focus indicator on itself or
an ancestor (outline ≥1 px, nontransparent, or a changed nonempty box-shadow).
Enter **and** Space must activate buttons and file inputs. For switches and
radios both keys are probed and reported under the same strict requirement,
so a native control supporting only Space can fail; do not rewrite the rule
after seeing data. Activation means a click/checked change, or a filechooser
event. Decorative surfaces add no keyboard requirement.

No axe-core dependency is installed. **axe pending owner approval** is a known
gap; these bounded semantics/keyboard checks are not a full accessibility audit.

**b. Reduced motion.** Create a fresh page with
`prefers-reduced-motion: reduce` before mount. An init-script wraps rAF callbacks
and counts executed callbacks, without adding a measuring rAF. After 3 seconds
settle, observe 1 second untouched, exercise the specimen (pointer and keyboard),
settle 1 second, observe another 1 second. Pass iff both observation windows
execute zero callbacks. Bootstrap/one-shot resize callbacks outside those
windows are not continuous work.

**c. SSR and no GPU.** Fetch server-rendered fixture HTML before hydration.
Within the specimen, meaningful content means nonempty text, a named native
control, a named image/heading role, or an image with nonempty alt; an empty
canvas alone fails. Then stub canvas `getContext` to return null for WebGL,
WebGL2 and experimental WebGL before mount (leave Canvas2D intact). Pass iff
meaningful accessible fallback/content remains, no unhandled page error occurs,
and native controls retain their names. The stock Fluid hidden fallback message
counts when present; plain native UI/text counts for interface primitives.
SSR and fallback must both pass. Never use SwiftShader.

**d. Theming.** Compare two fresh specimens with a documented prop/style
variation. No private shader uniforms or undocumented CSS variables count.
Sizes pass with the requested dimension within 2 CSS px and a ≥10 px change;
colours pass with changed computed colour/background or changed visible pixels.

| Component | Documented surface tested |
|---|---|
| Fluid | `width` 320→400, `height` 180→220 |
| FluidBackground | `style` wrapper width 320→400 px |
| FluidReveal | `width` 320→400, `height` 180→220 |
| FluidDistortion | `width` 320→400, `height` 180→220 |
| FluidStick | `width` 320→400, `height` 180→220 |
| FluidText | `height` 100→140 |
| InkPaper | `paper` #f4ecdc→#ddeeff |
| LiquidButton | `tone` light→dark, native palette colour changes |
| LiquidSegmented | `tone` light→dark, native palette colour changes |
| LiquidDropZone | `tone` light→dark, native palette colour changes |
| LiquidToggle | `tone` light→dark, native track palette colour changes |
| LiquidCaustics | forwarded documented `style` background #14181f→#eeeeee |
| EnamelText | `color` #d9462b→#2549a8; computed root colour |
| splash-cursor | N/A: registry documents no theming contract |

**e. Install/copy-paste.** Reuse E3's local `bun pm pack`, SvelteKit fixture,
`svelte-kit sync`, `svelte-check`, `vite build`, and hardware screenshot grading
pattern, without running E3's subjects or mutating its results. For library
components, extract the first component-specific rendered code snippet from
`/docs/components`; compile it unchanged except supplying external `save` /
`upload` handlers and a local image fixture. FluidStick's two documented modes
are both retained. For splash-cursor, copy every `static/r/splash-cursor.json`
file's declared content into its declared target beneath fixture `src/lib/`,
validate targets cannot escape that directory, import the copied component and
use the local packed `svelte-fluid` declared dependency. Each fixture is a fresh
SvelteKit project, with the same pinned installed dependency set as E3. Pass iff
sync/check/build succeed, the docs/registry route returns HTTP 200, there are no
unhandled page errors, hardware WebGL2 is accepted, and screenshot colour
variation exceeds 0.1% of pixels (RGB distance >12 from the first pixel).
A fixed pointer stroke is allowed for an initially blank interactive canvas,
as in E3. No surrounding fixture heading may satisfy nonblank rendering.

**f. Bundle cost (not scored).** Vite/Rollup production build, one named component
entry from the packed library (copied source for splash-cursor). Entry exports
the component so Rollup cannot erase it; Svelte runtime is bundled. Record sum
of gzip bytes for all emitted JS and CSS assets, gzip level 9. No fixture route,
source map or asset image bytes are included. Absolute bytes, not pass/fail.

**g. Visual (candidate rounds only).** Freeze R=2 static specimen screenshots at
baseline. Reuse E2's blind randomised A/B, side-swapped two-trial verdict,
inconsistency-as-tie, calibration thresholds and null-aware no-worse gate from
`scripts/quality-eval.mjs` / ADR 0107, scoped to static UI legibility, hierarchy,
shape, spacing and visual finish. Judge tier must differ from implementer
(Sonnet judges this Opus-authored harness; later Sonnet candidates use Opus).
Existing fluid calibration does **not** certify static UI; rerun identical,
blur, reduced-resolution and desaturation controls on train static UI before
candidate use. E2's known blur blind spot and owner-review spatial exclusion
remain explicit. No model call or visual win is claimed for this baseline.

### Score, noise and keep rule

Per-component score is passed checks a–e / applicable observed checks.
Accessibility, reduced-motion, fallback, theming and hardware render have R=2
independent fresh browser contexts; SSR, compile/build and bundle measurements
are deterministic CPU checks performed once and reused across the two trials.
Report both repetitions, disagreements and pass rates pooled over applicable
check×component×repeat observations per split, with Wilson 95% intervals
(z=1.959963984540054). Repeated checks are correlated: the interval is descriptive,
not a claim of independent components; also report component-level all-pass rate.

Keep only when the held-out candidate pass-rate **lower Wilson bound exceeds
the frozen baseline point estimate**, identical to ADR 0107 E3's “up beyond CI”,
train improves, and E2 plus the calibrated static-UI visual gate are no worse.
One root cause per round. After two consecutive rejected rounds, investigate
harness/eval errors before further library changes. No held-out-specific fixes.

### Execution and evidence

`scripts/component-eval.mjs --self-check` is pure logic; `baseline --cpu-only`
performs all GPU-free work first; `baseline --hardware` resumes it. Results go
to `evals/components/*.json`, screenshots to `evals/components/baseline/`, and
`dev-docs/benchmarks/component-eval.md` is the static results page/work queue.
Each missing cell has an explicit reason; no component fixes in this lane.

Only installed headless Chrome at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, with unsafe
SwiftShader default removed, software renderer rejected and actual renderer
recorded (expected ANGLE Metal Apple M1 Max). No unsafe WebGPU or xctrace.
Atomic mkdir `/tmp/svelte-fluid-gpu.lock`, `owner` JSON (lane E4, purpose,
start, worktree, PID) plus `acquired-at` ISO. Hold ≤12 minutes. Between batches,
wait until another lane acquired/released or the lock stayed free ≥5 minutes;
poll using background 60–90 second sleeps. Never touch an unowned lock.
Exact spawned processes only; remove owned /tmp fixtures after archiving.

## Consequences

The baseline is a measurement, not approval of every component. Native keyboard
limitations, decorative SSR emptiness, docs gaps and missing static judge
calibration remain honest failures/gaps. Bundle costs expose shared engine cost
without imposing a post-hoc budget. Later work has a frozen train-only queue.
