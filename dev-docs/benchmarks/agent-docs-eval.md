# Agent-docs integration evaluation

## Method

Pre-registered [ADR 0107, E3](../decisions/0107-energy-quality-docs-eval-protocol.md#e3--agent-docs). Thirty realistic integration requests; fresh Haiku and Sonnet CLI subjects, two repeats each (120 trials). Tasks, prompts, assertions and hash-derived split committed in `4e304b6` before subjects ran. No documentation or library changes in this measurement lane.

Run with Bun:

```sh
bun evals/agent-docs/run.mjs --self-check
bun evals/agent-docs/run.mjs --baseline
```

The runner builds a local package tarball with `bun pm pack` (including the repository's prepack checks), generates current `llms-full.txt` and `SKILL.md` through their production builders, installs a minimal SvelteKit fixture using matching repository dependency versions, then copies the fixture per trial. No repository dependency changes. Raw routes, CLI results, compiler/build logs and canvas screenshots remain in `/tmp/agent-docs-eval/`; compact results live in `evals/agent-docs/baseline.json`.

Subjects run `claude --model haiku|sonnet --dangerously-skip-permissions -p`, six-minute timeout, concurrency four. `--bare`, empty setting sources, empty strict MCP configuration, disabled skills, no persistence, and a Read/Write/Edit/Glob/Grep-only tool set exclude inherited repository instructions, web tools, shell commands and delegation. Prompt forbids repository/package-source inspection and installing packages. This is an instruction/tool-surface restriction, not an OS filesystem sandbox; no claim of adversarial containment. Model names are this machine's routed CLI tiers, not guaranteed upstream model versions. Post-run byte audit found no subject changes to package/config/app files or SKILL.md. One subject (`reveal-sensitivity-haiku-1`, train) appended a self-authored four-line reminder to its own llms-full.txt; retained without rerun and reported as an instruction-surface limitation, not new supplied documentation.

Primary scoring is intent-to-treat: subject timeout counts as FAIL even if a partial route exists. A secondary infrastructure-sensitive view excludes timed-out subjects. No selective reruns. Later rounds retain this rule; a timeout rate changing by more than about 2× is a harness confound, not a docs effect. This baseline had seven six-minute timeouts (5.8%); six left no route, one left a partial route. Their incomplete terminal logs do not establish whether delay originated in model reasoning or the local gateway.

All four checks must pass:

1. `svelte-kit sync` and `svelte-check --fail-on-warnings`: zero errors/warnings.
2. `vite build`: successful production SSR/client build.
3. Hardware Chrome target-route render after three seconds, no page errors, non-uniform visible canvas screenshot. More than 0.1% of pixels must differ from the corner pixel by a summed RGB distance greater than 12. Chrome's `--enable-unsafe-swiftshader` default is removed; a hardware-only WebGL2 context and renderer string are recorded. Target-route HTTP errors fail rendering. If a visible canvas is uniform at rest, one synthetic pointer drag across its middle is followed by a second sample after 500ms. This remains a non-blank guard, not full behavioral verification.
4. Svelte AST assertions: package import/component, required non-size props/values, calls, bindings and task strings. Canvas CSS dimensions are measured at viewport 1280×800 within ±2px of requested sizes; distinct canvases satisfy multiple-instance requirements. Explicit preset and non-size prop requirements remain strict.

CPU checks precede render checks. Rendering acquires `/tmp/svelte-fluid-gpu.lock` in batches of ten, retrying every 30 seconds during initial grading (15 seconds for the final shared-lane schedule). Lock owner records E3, worktree, SHA and PID; only that owner releases it. Server port 5210; browsers and exact server PIDs closed after each trial. Wilson 95% score intervals use z = 1.959963984540054. Per ADR, a future held-out improvement is beyond CI only when its lower bound exceeds the baseline point estimate.

## Frozen split

Sort by `sha256("svelte-fluid-e3-split-v1:" + taskId)`, first ceil(30 × 0.3) = nine held out. `tasks.json` stores the full order and each task's split.

- **Held out:** `reveal-content`, `fluid-letterforms`, `splat-button`, `pixel-cap`, `poster-fallback`, `custom-fallback`, `ready-error`, `circle-container`, `hover-cursor`.
- **Train:** remaining 21 tasks. Forty-two trials per model; held out eighteen per model.

Held-out examples below are diagnostic reporting only, not inputs to a docs-change round. Any later change must be designed from train failures only.

## Grader repairs (pre-baseline)

Prompts and split remain byte-for-byte unchanged from `4e304b6`.

- **Equivalent components:** a preset counts as generic `Fluid` when the request names no specific component. First observed on train `basic-card-haiku-1`: Aurora correctly fills the requested card. Explicit LavaLamp/Aurora/etc. imports remain mandatory on named-preset tasks.
- **Equivalent sizing, initial repair:** parent CSS accepted instead of prop-only sizing, first observed on train basic-card and lava-preset outputs; docs recommend sizing the parent. The initial static CSS evaluator remained incomplete for reversed `min()` arguments and aspect ratio.
- **Measured sizing, final repair:** deleted static CSS sizing parser. Every trial re-rendered at 1280×800; visible canvas `getBoundingClientRect()` measured against requested CSS dimensions within ±2px, requiring distinct canvases for multi-instance tasks. Covers props, wrappers, `min()` argument order and aspect ratio uniformly; no task-specific CSS exception. Pure positive/tolerance/negative/multiple-instance controls added. Before final repair rates: Haiku train15/42, test4/18; Sonnet train23/42, test11/18. This is the final pre-baseline repair; subsequent issues are known limitations, not new grading rules.
- **Svelte snippet forwarding:** child `{#snippet fallback(...)}` counts as a supplied fallback prop, alongside explicit `fallback={...}`. Uniform Svelte 5 syntax equivalence; missing fallback still fails.
- **Reduced-motion intent:** frozen prompt allows a still image or conditional component, not only `paused`. Verified `Fluid.svelte` watches reduced motion on mount, calls `settleStill()` during startup/live changes, and disables pointer input while reduced. Plain Fluid therefore satisfies this task without explicit preference code; static fallback/conditional rendering also accepted. Explicit `endStill()` forcing motion fails. Frozen `paused`/preference-string assertions are not required for this task. Positive/default and forced-motion negative controls added; all trials' static checks recomputed.
- **Visibility defaults:** same intent-versus-literal audit verified Fluid defaults `autoPause=true`, `lazy=false` (`Fluid.svelte:131–132`). Omitted values accepted for visibility-pause; explicit `autoPause=false` still fails. No prompts or assertions file bytes changed.
- **Uniform-at-rest canvases:** scratch reveal can legitimately begin uniformly covered. Every task now receives one scripted drag if its canvas is uniform after three seconds, then a second sample after 500ms. All five affected baseline renders rechecked, not selective subject reruns. Before this repair: Haiku train 15/42, held out 4/18; Sonnet train 23/42, held out 11/18. Before-repair 67 causes split: train API20, TypeScript9, requirement/static7, timeout6, syntax1, blank2, no-route1; held out API5, TypeScript7, requirement/static7, timeout1, syntax1.
- **Harness lifecycle:** bounded HTTP readiness fetch; register server close listener before terminating, with bounded close wait. An initial repeated self-check stalled on the fast-exit listener race; exact owned processes stopped, matching E3 lock released, controls rerun successfully. A subsequent grading pass hung in Bun fetch despite AbortSignal timeout; added an independent promise deadline and a 110-second per-render subprocess limit, then reran all grading. Missing target routes still fail legitimately; genuine subprocess hangs are fixture errors. Original subject outputs preserved; no selective subject reruns.

Self-checks cover a known-good packaged Fluid route; wrong import/prop, type error, missing build import and uniform blank render negatives; CSS/preset/snippet positives and strict named-preset negatives. Good hardware route must pass all four checks. Repo checks also required before completion.

## Baseline

Recorded 2026-10-07 after all 120 hardware renders and uniform static regrading. Hardware: `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)`. Zero fixture errors; no GPU-support failures. Fifty-eight trials pass all four checks plus subject completion; 62 fail. Final grader frozen after the uniform 1280×800 rerender; no subsequent rule changes.

### Primary — intent-to-treat

| Model | Split | Pass / total | Rate | Wilson 95% CI |
| --- | --- | --- | --- | --- |
| Haiku | Train | 18 / 42 | 42.9% | 29.1–57.8% |
| Haiku | Held out | 6 / 18 | 33.3% | 16.3–56.3% |
| Sonnet | Train | 23 / 42 | 54.8% | 39.9–68.8% |
| Sonnet | Held out | 11 / 18 | 61.1% | 38.6–79.7% |

### Secondary — infrastructure-sensitive, timeouts excluded

| Model | Split | Pass / total | Rate | Wilson 95% CI |
| --- | --- | --- | --- | --- |
| Haiku | Train | 18 / 40 | 45.0% | 30.7–60.2% |
| Haiku | Held out | 6 / 18 | 33.3% | 16.3–56.3% |
| Sonnet | Train | 23 / 38 | 60.5% | 44.7–74.4% |
| Sonnet | Held out | 11 / 17 | 64.7% | 41.3–82.7% |

Haiku timeouts: 2/60; Sonnet: 5/60. These intervals treat trials as Bernoulli observations, not independent task clusters; repeats share task difficulty and routed-model behavior. Small held-out denominators give wide intervals. No docs-improvement or model-superiority claim follows from this baseline.

### Failed checks (overlapping)

| Check | Failed / 120 |
| --- | --- |
| Static assertions | 35 |
| svelte-check | 51 |
| vite build | 2 |
| Hardware render + measured CSS size | 33 |

The render check now includes measured CSS size; its count is not directly comparable with the earlier non-blank-only count. Reveal panels become non-uniform after drag (e.g. train reveal-sensitivity-haiku-1: 0% resting, 13.918% after drag). No page errors or genuine fixture failures were hidden by the repair. Final primary rates versus pre-drag/pre-measurement: Haiku train35.7%→42.9%, held out22.2%→33.3%; Sonnet unchanged54.8%/61.1%. These are grader repairs, not documentation gains.

## Failure buckets

Cause labels are human diagnostic hypotheses, not an LLM judge. Missing documentation and subject mistakes can coexist. Each failed trial receives one primary bucket, in order: subject timeout, no route, syntax/build, API prop/type, other TypeScript inference, requirement/static-equivalence, blank render. Compact JSON retains per-trial labels. Check counts overlap; cause counts do not.

| Primary cause | Train | Held out | Total |
| --- | --- | --- | --- |
| API prop/type | 20 | 5 | 25 |
| TypeScript inference | 9 | 7 | 16 |
| Requirement or static equivalence | 3 | 3 | 6 |
| Presentation size | 3 | 2 | 5 |
| Subject timeout | 6 | 1 | 7 |
| Svelte syntax | 1 | 1 | 2 |
| Subject no route | 1 | 0 | 1 |
| Fixture error | 0 | 0 | 0 |
| **Total failures** | **43** | **19** | **62** |

Train-only docs-round evidence: `evals/agent-docs/train-failures.json`, 29 API/TypeScript records with exact generated routes, compiler diagnostics and relevant supplied-doc passages or missing guidance. No held-out content. Terminal transcripts omit tool history, so relevant passages are not claimed as proof of model reliance.

The following actual outputs were inspected before baseline recording:

- **Train, `distort-photo-haiku-1`:** `FluidDistortion distortion={0.3}` instead of `strength={0.3}`; svelte-check rejects number for boolean. Generated docs name the wrapper and `src` but omit its wrapper prop reference. Sonnet repeat 1 correctly uses `strength`.
- **Train, `viewport-background-haiku-1`:** FluidBackground placed outside page content behind an opaque `main`; summary lacks the wrapper's slot/exclusion and pointer-event composition recipe. This trial passes the four checks (4.47% non-uniform canvas pixels). The canvas guard does not establish correct foreground composition or pointer behavior; this is a qualitative docs gap, not a counted failure.
- **Held out, `reveal-content-haiku-1`:** bespoke Canvas2D scratch implementation, no package import. Sonnet repeat 1 constructs an SVG scratch mask around Fluid and passes string pixel dimensions. Docs lack the FluidReveal wrapper prop reference (including `fadeBack`). Report-only; not a permitted hill-climb design input.
- **Train, basic-card (three outputs) and lava-preset:** correct ancestor CSS sizing initially rejected by prop-only assertions; repaired grader/fixture bucket, not docs failure.
- **Train, `reveal-sensitivity-haiku-1`:** correct FluidReveal import, numeric sensitivity/curve, dimension props; confirms subjects can infer some undocumented wrapper fields. Extra prose appears as page text but is not independently penalized.

- **Train, `distort-photo-sonnet-1`:** correct `strength={0.3}`, but copied the generic accessibility advice as `aria-label` onto FluidDistortion; that wrapper rejects it. The supplied docs do not distinguish wrapper props from core/preset forwarding.
- **Train, `live-flow-haiku-1`:** source fields inferred correctly, but an unannotated JavaScript object widens `mode` to `string`, failing FlowConfig; responsive dimensions also differ from the task. Typed/JSDoc configuration examples are absent.
- **Train, `pause-buttons-haiku-1`:** untyped `let fluid` produces implicit-any errors under the fixture's normal `checkJs`/strict settings; the supplied imperative example uses the same untyped pattern.
- **Train, `distort-auto-haiku-1`:** successful CLI terminal result, but only prose saying it needs to verify docs before writing; no route file. Counted subject omission, not a timeout or fixture failure.
- **Held out, `fluid-letterforms-haiku-2`:** supplies `width`/`height` to FluidText; width is not a wrapper prop. The task's 600px presentation size is achievable with a CSS parent, but the supplied wrapper description omits that distinction. Report-only.

At least twelve generated route outputs inspected, plus compiler diagnostics across all failed CPU checks. Claims of docs gaps refer to the generated files actually supplied to subjects, not README or canonical site pages they could not consult.

## Post-baseline harness changes

Future subject runs hash both supplied docs after each trial and record `subject.mutatedDocs` (including deleted files). Mutation is reported, not a fifth grading check; baseline's one mutation is likewise flagged and graded as-is. No subject rerun or prompt/split change.

## Rounds

