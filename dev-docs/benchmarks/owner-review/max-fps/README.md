# maxFps — owner motion review packet

Owner motion approval **pending**. Evidence only; no library/default change,
no automatic motion-quality verdict. Stills cannot certify temporal smoothness.

**On your 120 Hz display, is maxFps=60 visually indistinguishable or acceptable as the default?**

## Comparison

Open `/examples/bench/max-fps`: two real `<Fluid>` instances, initially
**left: maxFps=0 (uncapped)**, **right: maxFps=60**. Both use the same registry
configuration and seed **5**. Plasma, a TRAIN preset with auto-splats, is selected
initially. The registry-driven selector includes held-out presets: this is an
owner view, not an eval. Preset changes restart both instances; **Swap sides**
moves the existing instances to check side bias without restarting them.

The live readout measures the page's RAF cadence over roughly one-second
windows, shared by both sides. **Presented fps is omitted:** neither the public
Fluid API nor its handle exposes presentation counts. RAF Hz is not presented
fps or proof of physical display refresh; workload stalls can lower it. Hidden
tab/suspension gaps are discarded. No engine hooks or synthetic RAF are used.

Each instance accepts independent pointer input; gestures are not replayed.
Same seed does not guarantee lockstep live simulation. The view uses registry
configs directly, not preset wrappers: Toroidal has its initial registry splats,
not the wrapper's periodic reinjection. Both canvases are equal-sized,
420 CSS px high, with native DPR and Fluid's normal sizing/quality policy.

## Run and review

```sh
bun run dev
```

Open <http://localhost:5173/examples/bench/max-fps> on a **ProMotion display at
120 Hz**. Ensure the OS/browser permits 120 Hz, keep the tab visible, close other
GPU-heavy tabs and wait for the RAF readout. A reading near 60 Hz does not test
the cap's 120 Hz motion trade-off. If sustained RAF is much lower than 120 Hz,
resolve display/browser limits or workload stalls before judging the cap.

- Make fast pointer drags across each canvas; compare tracking and moving trails.
- Watch auto-splat motion without interaction (start with Plasma), then other presets.
- Look for judder, uneven cadence and loss of smoothness in fast filaments/wakes.
- Swap sides; repeat. Record acceptable/unacceptable **per preset**, display,
  browser, measured RAF Hz and whether the difference is noticeable.

Do not infer energy savings from this side-by-side page: both simulations run
concurrently, not as isolated paired energy trials.

## Why review this

[ADR 0110, Outcome](../../../decisions/0110-presentation-rate-cap.md#outcome-2026-10-07)
and [Bead svelte-fluid-v73](../../../../.beads/issues.jsonl) (local, untracked
Beads record; search by ID) retain the pending default-on requirements:

- `maxFps` caps **presentation only**, not simulation. At synthetic 120 Hz,
  `maxFps=60` submitted **60/120 presentations**, with byte-identical
  velocity/dye fields on own/shared tiers and normal/profiled paths.
- Exploratory E1 TRAIN median GPU-ms/s saving: **44.6% at 120 Hz**.
  Held-out coverage: only **2/48** candidate slots; **35.0%** saving against
  paired baselines, **30.0%** against the frozen baseline. Not a completed E1.
- E2 TRAIN failed one run (**p=0.003**) and passed borderline when pooled
  (**p=0.013**, threshold **0.01**). **No held-out E2**, no motion assessment.
- Headless macOS Chrome is fixed at **60 Hz** (`BeginFrameControl is not
supported on MacOS yet`), where this cap has no cadence effect. Agents cannot
  certify motion smoothness on the owner's real 120 Hz display.

Default remains **0 (opt-in)**. Before any default change, a **headed/120 Hz
energy run completing the full held-out E1 matrix** (owner-approved headed
browser or a 120 Hz-capable runner), a **held-out E2 pass**, and **owner motion
approval** are still required. This packet completes none of those gates.
