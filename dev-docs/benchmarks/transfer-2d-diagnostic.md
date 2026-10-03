# Transfer-to-2D loss diagnostic — 2026-10-02

## Negative result

`transferToImageBitmap()` followed immediately by alpha-enabled sRGB 2D
`globalCompositeOperation = 'copy'`, unscaled `drawImage`, and `bitmap.close()` in
`finally` **failed pending-frame pixel parity on isolated run 1**. Forced loss
was injected after transfer, before draw, without a task yield. No renderer
crash occurred. The candidate stopped immediately: no retry, performance work,
production edit, mixed24 or churn candidate run. Safe `gl-host.ts` unchanged.
No defensible performance win; strict <2 ms GPU budget remains unresolved.

Environment: ordinary hardware Chrome **154.0.8037.95**, macOS/Darwin **27.0.0**,
Apple M1 Max; no unsafe flags. Measured production baseline SHA
`f4e7e063218d35e55e46183ef8c2984fd5330fe6`, with uncommitted diagnostic-only
artifact/runner edits. Runtime matches that SHA; this is not a final-commit
performance measurement. Raw runner metadata records SHA and dirty paths.

## Exact failure phase

External Playwright console events, not post-crash page evaluation:

```text
mode:transfer2d:boundary:aftertransfer
mount:0:target:0:bitmap:before
mount:0:target:0:bitmap:after
mount:0:lose:before
mount:0:lose:after
mount:0:target:0:draw:before
mount:0:target:0:draw:after
mount:0:target:0:close:before
mount:0:target:0:close:after
Error: pixel mismatch: mount:0:target:0:draw
mount:0:event:lost
```

The failed assertion compares all destination RGBA channels against a CPU copy
of a safe `createImageBitmap` reference taken before loss. It establishes failure
of the **pending transferred frame**, not loss of a previously displayed frame.
Candidate run aborted before loss-wait/restore/source-reuse/idle/final-release
checks. Previous displayed-frame retention was not measured for this candidate;
no claim it fails or passes. Failure is not inferred solely from loss notification.

The final harness additionally seeds a previous frame, checks it immediately
after loss before drawing the pending frame, and reports first-pixel values on
mismatch. Those checks were added after the candidate stopped; not retroactively
claimed as candidate measurements. Candidate was not rerun.

## Bounded comparisons

- Safe snapshot control, same loss-before-draw boundary: exact pending pixels.
  **30/30 isolated runs**, six each at after-transfer/before-draw,
  after-draw/before-close, immediately-after-close, next-task, and after-visible
  compositor. Follow-up fresh browser: mixed24, initial mount plus **three churn
  rounds**, passed. Zero crashes/page errors/GL errors. Exact RGBA after draw,
  loss call, loss event, restoration, source resize/reuse, idle frame, final host
  release. Final harness rerun also passed **30/30 + mixed24/three churn rounds**,
  including previous-frame checks. These are tiny 8×8 through 19×17 diagnostics,
  not native-DPR workload certification.
- Transfer-close-only, never displayed: **5/5 isolated runs**, one per boundary,
  loss/restore/source reuse/final release passed. No displayed-pixel claim.
- Retained bitmaprenderer transfer: pending-frame pixel mismatch on **run 1**,
  same after-transfer/before-draw boundary; no renderer crash. Stopped. This does
  not relocate or disprove the earlier renderer crash: this harness stops at an
  earlier pixel failure. A few transfer-only runs are not universal safety proof.

Raw external evidence (local, not package contents):
`/tmp/strict-budget-bitmap-transfer2d.json`,
`/tmp/transfer2d-diagnostic-console.log`,
`/tmp/strict-budget-bitmap-transfer-close-only.json`,
`/tmp/strict-budget-bitmap-transfer.json`,
`/tmp/strict-budget-bitmap-snapshot-initial.json`,
`/tmp/strict-budget-bitmap-snapshot.json`.

## Runnable diagnostic and verification

```sh
VITEST_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  bun scripts/bitmap-loss-diagnostic.mjs transfer2d 30
# Other modes: snapshot, transfer-close-only, transfer. Count 1..30.
# Fresh browser per isolated run; stop first error/crash. Mixed only after 30 pass.
bun run test && bun run check && bun run prepack
```

Verification: **867 Node tests / 53 files passed**, check **0 errors / 0 warnings**,
prepack/package/publint/public declarations passed. No production runtime change.
Full engine browser suite skipped: diagnostics only; bounded hardware Chrome
experiments above exercised this change. Native-DPR Karman/GasFlare/LavaLamp
performance and transparent/reveal/glass parity skipped because safety failed.
No GPU budget or universal browser safety certification claimed.
