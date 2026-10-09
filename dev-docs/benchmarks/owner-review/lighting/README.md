# Independent-thickness lighting — owner review packet

Appearance **approved** 2026-10-09 (lead, under owner-delegated decision; Bead 9yj). Current treatment under ADR 0100; no
historical parity or calibrated free-surface claim. Ten presets selected from
`src/lib/presets/registry.ts` by `shading: true`:

LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, CircularFluid, FrameFluid,
AnnularFluid, SvgPathFluid, Toroidal.

## Capture

Real `Fluid.svelte` component with each registry config, seed **5**, pointer input
inactive, native **DPR 2**, viewport/CSS **1440×900**, backing/JPEG **2880×1800**.
Pause about **5 seconds after onReady**; real-time simulation, not fixed-step
comparison. Black page background, preset defaults otherwise unchanged. Hardware
system Chrome, ordinary validation; browser version and errors in `manifest.json`.
JPEG compression keeps the complete packet below 4 MB; do not use it for pixel
parity or fine dither/noise measurements.

Reproduce with this worktree's dev server on port 5198 and exclusive GPU lock:
`bun scripts/capture-lighting-review.mjs`. The script imports the real component
through Vite; no copied solver, local shader or permanent capture route.

## Review

- Relief follows deposited material, not bright pigment/hue; judge intentional
  physical-normal softness rather than the superseded exaggerated RGB slopes.
- Palette, silhouette, bloom and glass remain convincing at intended full size;
  look for clipping, seams, grain or distracting highlights.
- Inspect LavaLamp glass, Aurora highlights, faint InkInWater/SvgPathFluid,
  container rims/holes and Toroidal wrap. Still images cannot establish motion,
  wake/restore behavior or energy budgets.

Record owner acceptance/rejection separately. This packet supplies evidence only.
