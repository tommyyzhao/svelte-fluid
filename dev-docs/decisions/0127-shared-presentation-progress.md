# ADR 0127: Shared presentation progress under overlapping snapshots

**Status:** Accepted
**Date:** 2026-10-24

## Context

`createImageBitmap` resolves asynchronously. Comparing a completed snapshot with
the latest requested sequence can discard every frame when snapshot latency
exceeds the interval between requests. Valid GL draws then make no visible progress.

## Decision

Keep the requested sequence; give each presenter a successful-presentation/loss
floor. Transfer a resolved snapshot only while its registration is current, the
context is live, and its sequence exceeds that floor. Advance the floor only after
a successful transfer. A newer pending request must not suppress completed work;
a newer successful transfer must prevent an older frame from replacing it.

On context loss, advance the floor past all outstanding requests. Restoration
cannot revive pre-loss snapshots. Release/re-registration keeps its identity check.
Every resolved bitmap closes exactly once, including discarded frames and failed
transfers. Preserve snapshot-rejection logging and transfer-error propagation.

Successful snapshot creation and transfer mean this frame displayed; discarding
it as superseded means a newer frame displayed. Loss/release can cancel
presentation. Snapshot rejection fulfills without presentation, logging only when
current; transfer failure rejects. Promise fulfillment alone does not guarantee
presentation. An older completed frame may display transiently while a newer
request is pending. No one-frame latency guarantee. No queue, scheduler, context,
GL pass, public API, or default changes.

## Verification and acceptance

Deterministic deferred-snapshot CPU regressions cover overlap progress, reverse
completion, sustained overlap, sibling isolation, loss/restore, registration
identity, bitmap cleanup, transfer failure, and snapshot rejection. Against the
unchanged host, four regressions fail (10 pass).

Independent review passed. The original, unchanged Firefox drop-zone restoration
gate now passes. Bounded acceptance on the Apple M2 passed 58/58 checks each in
Firefox 151.0, Playwright WebKit 26.5 and Chrome 155.0.8059.86 (2026-10-24):
drop-zone 9, native controls 6, context restoration 2 and shared-context 41.
Candidate archive SHA-256:
`86178466914d8d30c7a9b2a9e23a53ace74b43df4b8a2dfd0c29cb53ce57a08e`.
All 749 source hashes remained unchanged before/after each run. Renderer identity
was not emitted; these are functional browser results, not a backend claim.

The first Firefox run passed restoration but exposed an unrelated test assumption
that the requested canvas size always equals the actual WebGL drawing buffer.
WebGL permits smaller allocations. That test now verifies positive actual
width/height, viewport, live context, no GL error and execution of the GL callback;
its fixture is unchanged. No restoration-test timing or assertions were relaxed.
This is a bounded desktop-browser slice, not native Safari, mobile or universal
portability evidence.
