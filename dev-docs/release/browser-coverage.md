# Browser coverage and release checks

Evidence reviewed: 2026-10-24. This is a bounded evidence inventory, not a claim
that unlisted environments have never been tested historically.
The [README compatibility targets](../../README.md#browser-compatibility) remain
unchanged: WebGL 1/2, Chrome 120+, Firefox 121+, Safari 17+, iOS Safari 16+,
and Chrome Android. Targets are not equivalent to verified release coverage.

## Evidence matrix

| Status | Environment / version | Source | Verified scope or limitation |
| --- | --- | --- | --- |
| Configuration-only | Headless Playwright Chromium (default), Firefox, or WebKit; version selected by installation | [vitest.config.ts](../../vitest.config.ts), [nine-case config check](../../scripts/check-browser-config.ts) | `VITEST_BROWSER_NAME` selects the engine; `VITEST_CHROME_PATH` applies only to Chromium. Configuration is not a run receipt. |
| Configuration-only | Ubuntu `ubuntu-latest`, installed Playwright Chromium; no fixed browser version | [CI](../../.github/workflows/ci.yml), [release workflow](../../.github/workflows/release.yml), browser jobs | Three file-level shards are configured in each workflow. No successful run is established by these files alone. |
| Measured narrow scope | Physical Apple M2; ANGLE Metal Apple M2; Chrome 155.0.8059.86; 2026-10-24 | Tracer warm-up candidate A below | 13/13 tracer tests passed; historical narrow candidate, not full-suite coverage. |
| Measured narrow scope | Physical Apple M2; directly emitted ANGLE Metal Apple M2; Chrome 155.0.8059.86; 2026-10-24 | Combined candidate B below | 111/111: tracers 13, thermal-wall 11, thermal 18, absorption 7, disturbance 6, outlet 8, shared-context 41, lifecycle 7. |
| Measured narrow scope | Same physical host and Chrome 155.0.8059.86; exact renderer not emitted; 2026-10-24 | Separate context-restore run, candidate B | 2/2: opening replay/config snapshot/FBO cleanup and glass transitions; no backend inference from the combined run. |
| Measured narrow scope | Same physical host and Chrome 155.0.8059.86; exact renderer not emitted; 2026-10-24 | Controls candidate C below | 30/30: controls-interaction 6, toggle 6, dropzone 9, native-sizing 9; bounded component coverage, not all accessibility checks. |
| Measured narrow scope; historical failures retained | Firefox 151.0 revision 1532; WebKit registry version 26.5 revision 2311; Chrome 155.0.8059.86; renderer unknown/not emitted | Final cross-browser candidate F below; earlier D/E retained | 58/58 per engine, 174 total, zero failures/skips; original restoration assertion passes. Four selected files, not full browser/device coverage; WebKit is not Safari validation. |
| Measured narrow scope | Same M2 host; Chrome 155.0.8059.86, Firefox 151.0, WebKit registry 26.5 | Latest combined candidate G below | Chrome 109/109, Firefox 78/78, WebKit 78/78; 265 total, zero failures/skips; integrated viscosity plus selected thermal/shared/restoration checks. |
| Not verified in this slice | Firefox 121 minimum; Safari 17+ | README targets; no matching current receipt reviewed here | Newer Firefox checks do not prove 121; Playwright WebKit does not prove Safari compatibility. |
| Not verified in this slice | Physical iOS Safari 16+; Chrome Android | README targets; no matching current receipt reviewed here | Mobile hardware, touch behavior, lifecycle, and minimum-version coverage remain unverified here. |
| Not verified in this slice | Chrome 120 minimum; WebGL 1; missing-linear-filtering fallback; fallback coverage beyond tested controls | README targets; bounded receipts below | Chrome 155 passes do not prove Chrome 120 or WebGL 1; tested native-control fallbacks do not establish every library fallback. |

The historical [1.0 RC preparation](1.0-rc.md#owner-gates-and-release-path)
explicitly records Node/check/prepack only, not the GPU/browser gate; it is not
current browser pass evidence.

### Narrow measured receipts

Sources reviewed directly on 2026-10-24: archived tracer warm-up, combined,
context-restore, and controls `receipt.json`, `vitest.json`, and browser stdout
logs; tracer warm-up also has a `manifest.json`. Candidate archive SHA-256:

- A — tracer warm-up: `3b5d288ca246d9a727716638053105e36bd4aba09c9fb7d4ac9133d5a8570e35`.
- B — combined and separate context-restore: `b2340e4a2bbc607f4c6853fa6162e9ea1cb6de2d77204c04b531b22b67745a8e`.
- C — controls: `61e65bb5c13870e17ee4f2a24ff940eddf3821087b10e847606ee0cdec79aceb`.

Each receipt applies only to its exact candidate and selected suites, not every
later revision. These runs are not a full library, browser, or device matrix.
The six controls-interaction tests cover live/fallback button and radio native
names, focus, keyboard activation/navigation, forms, and disabled behavior.
CSS focus checks cover fallback/forced colors only: they do not prove visibility
of the live shader focus ring. Context-restore and controls logs emit no exact
renderer; neither inherits the combined run's Metal evidence.
Viscosity is now integrated and verified in candidate G below; the earlier
separate 74/74 receipt is not substituted for that combined acceptance.

### Cross-browser slice (2026-10-24)

Firefox/WebKit binaries are now installed on the inspected Mac; limited runs
supersede the earlier missing-runtime inventory. Firefox 151.0 revision 1532 is
verified from executable/app version; WebKit 26.5 revision 2311 is registry-only
version evidence. D–F emitted no renderer; G's strings are recorded below.
Safari automation readiness is not established; desktop WebKit is not Safari or physical iOS.

- D — initial archive: `b21a590c8c5fea5a454033a94866bd03b03b8210668ed1255c0c68a4e6e1ca12`.
- E — platform-modelled keyboard archive: `33e162c97d893970f86fc83e47e5ffdb41e8b218bc4eee274f901d55e56d605f`.

D selected four tests per engine: Firefox 3 passed/1 restore failed; WebKit
3 passed/1 Tab-focus failed; 18 filtered out per engine. E retained assertions
but modelled macOS WebKit Option+Tab with system Keyboard navigation OFF
(default); other system settings are not covered. E: WebKit 10 functional
passes (prior four plus six controls), 18 filtered; Chromium 15 passes; Firefox
six controls functional passes plus one diagnostic completion, not seven
product passes and not a restoration pass.

- F — final presenter candidate: `86178466914d8d30c7a9b2a9e23a53ace74b43df4b8a2dfd0c29cb53ce57a08e`.

F passed 58/58 per engine (174 total), zero failures/skips: dropzone 9,
controls-interaction 6, context-restore 2, shared-context 41. The unchanged
original Firefox restoration assertion now passes on all three engines.
Receipts verify all 749 source hashes before/after; renderer remains unknown.
Historical Firefox failures, including an intermediate 57/58 run, remain failures
of those candidates, not retroactive passes.

The final diagnostic ledger showed awaited requests superseded by RAF snapshots,
then newer requests invalidated by loss/release. The production presenter now
uses a latest-actually-presented floor, not latest-request-only discard, so
completed frames progress despite newer pending requests; loss floor,
registration identity, and bitmap cleanup remain. Diagnostics were not merged
and are not product passes. The shared-allocation test replaced an invalid
canvas-equals-drawing-buffer assumption with actual dimensions, viewport,
live GL error, and callback observations; the restoration assertion was not
weakened. See the [WebGL drawing-buffer specification](https://registry.khronos.org/webgl/specs/latest/1.0/#2.2).

- G — combined acceptance: `ef9d65afacd33de8430ef6ca911eeea65d4dd517557fd7cdf8912fd12c17bc83`.
G passed 109/78/78 (Chrome/Firefox/WebKit), zero skips/failures: each engine's
viscosity checks cover nine frozen historical exact-byte cases plus 15 placement
cases, thermal-wall 11, shared-context 41, context-restore 2; Chrome adds thermal
18 and tracers 13. All 754 source hashes match before/after; final build exited 0.
Emitted renderers: Chrome `ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)`;
Firefox `Apple M1, or similar`; WebKit `Apple GPU`. Firefox's string is not a
physical-host claim: all three runs used the M2 host. Scope remains bounded.

With approved, already-installed binaries, select explicit existing suites
from the repository root (these commands are not claims of passing runs):

```sh
env -u VITEST_CHROME_PATH VITEST_BROWSER_NAME=firefox bun run test:browser src/lib/engine/__benches__/controls-interaction.browser.test.ts
env -u VITEST_CHROME_PATH VITEST_BROWSER_NAME=webkit bun run test:browser src/lib/engine/__benches__/controls-interaction.browser.test.ts
```

Use other explicit test paths for broader checks; no browser install is
authorized by this document. The selector defaults to `chromium`; custom Chrome
paths are ignored for Firefox/WebKit.

## Before release

Current owner policy (2026-10-24) accepts bounded desktop browser-engine
validation for release; physical-device testing is not a mandatory release gate.
Native Safari, physical iOS/Android, and advertised minimum versions remain
unverified limitations, not mandatory blockers under that policy. Desktop
WebKit passes are not empirical proof of mobile Safari behavior. For touch,
battery, or mobile-context-critical adoption, optional checks on intended
physical devices are recommended; record device/OS/browser and scoped results.

Exercise fluid components and interface primitives, not just tracers. Check
WebGL 1/2 where supported, missing-linear-filtering degradation, unavailable
WebGL/native-control fallbacks, resize, lazy exit/re-entry, hidden-tab pause,
context loss/restoration, and unmount/resource cleanup. Check reduced-motion
behavior, keyboard operation, visible focus, accessible names, and touch
scrolling with both rendered surfaces and fallbacks. Retain scoped receipts
and unresolved failures before approving release; do not infer these checks
from passes outside their recorded scope.
