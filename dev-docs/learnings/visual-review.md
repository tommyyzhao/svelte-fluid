# Visual review for rendering changes

Symptom: a shader, display-pass, lighting or surface change passes every test
and still looks different (or worse). Tests prove invariants, not appearance.
Any change that can move pixels needs this before/after record in the PR.

## Procedure

1. **Before.** On the base commit, capture frames at **DPR 2 and DPR 3** (native
   DPR is the default, so those are what users see). Use hardware Chrome and the
   same seed, size and config for both sides.
2. **After.** Capture again on the change, same settings, into a second directory.
3. **Side-by-side.** Put before and after next to each other at 100% and look at
   them. A number cannot replace this step; the PR must say what you saw.
4. **Presets: pixel MAE table.** One row per preset, columns DPR 2 and DPR 3
   (mean absolute RGBA error, 0-255, before vs after). `0.00` means identical.
   Anything non-zero needs a sentence saying why it is intended.
5. **Components: contact sheets.** One sheet per component, before above after,
   light and dark tone, at DPR 2 and 3.

## Capture commands

Opt-in benches, excluded from the default browser run. Needs hardware Chrome
(`VITEST_CHROME_PATH`, see CLAUDE.md).

```sh
export SVELTE_FLUID_GPU_BENCH=1 VITEST_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Presets (fluid engine): raw RGBA dumps, every preset, same seed.
SVELTE_FLUID_DPR=3 SVELTE_FLUID_SHOTS_DPRS=3 SVELTE_FLUID_SHOTS_DIR=/tmp/vr/before \
  bun run test:browser src/lib/engine/__benches__/dpr-shots.browser.test.ts

# Components: PNGs and contact sheets.
SVELTE_FLUID_DPR=2 SVELTE_FLUID_SHOTS_DIR=/tmp/vr/before \
  bun run test:browser src/lib/engine/__benches__/surface-shots.browser.test.ts   # LiquidButton, LiquidSegmented
# also: dropzone-shots, caustics-shots, foil-shots (same variables)
```

Repeat with `SVELTE_FLUID_DPR=2` and `3`, and again into `/tmp/vr/after` on the
change. `dpr-shots` writes `<preset>-dpr<N>-<W>x<H>.rgba.b64`; `SVELTE_FLUID_SHOTS_DPRS`
selects the DPR list inside the bench, `SVELTE_FLUID_DPR` sets the browser's
device scale factor (set both to the same value).

## MAE from two dumps

```sh
bun -e '
const [a, b] = process.argv.slice(1).map((p) => Buffer.from(require("fs").readFileSync(p, "utf8"), "base64"));
let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
console.log((s / a.length).toFixed(3));
' /tmp/vr/before/Karman-dpr3-1440x900.rgba.b64 /tmp/vr/after/Karman-dpr3-1440x900.rgba.b64
```

Loop it over the files in the `before` directory for the table. Differing
lengths mean the size changed: stop and find out why.

## Rules

- Never compare across machines, browsers or DPRs; the baseline is the same
  setup on the base commit.
- Keep the shots out of the repo (`/tmp`); paste the table and attach the
  sheets to the PR.
- The numbers are evidence, not a gate: ADR-0050 declines golden-image CI.
