# ADR 0119: SDF-shaped glass cover for SVG channels

**Status:** Accepted
**Date:** 2026-10-21

## Context

ADR 0025 approximates SVG distance with `0.5 - coverage`. Its gradient spans
roughly one mask texel, so `glassThickness` cannot make a substantial bevel.
Fluid-driven highlights also disappear over the cold, dark Tesla-valve tail.
The requested covering must follow the channel without covering its white walls
or changing the simulation. Analytic vessels and WebGL1 fallback must not change.

## Decision

Reuse the existing glass program, RGBA8 scene framebuffer and WebGL2 jump-flood
container SDF. A uniform branch selects the SVG cover only when that SDF exists;
all legacy model arithmetic stays unchanged. No new target, program, keyword,
public prop or lifecycle owner.

The SDF is top-down, negative inside, measured in mask texels. Sample `(u,1-v)`;
central differences use one mask texel in each axis. For inside distance `d`,
bevel radius `w = glassThickness * maskHeight`, use the quarter-round physical
height `sqrt(w*w-(w-d)*(w-d))` until `d=w`, then a flat slab. Its slope is
`(1-d/w)/sqrt(1-(1-d/w)^2)`. Heights and distance have matching texel units;
using a unit-height profile would incorrectly flatten the normals as resolution
increases. Clamp the extreme slope denominator to avoid NaNs.

Normal is `normalize(vec3(-heightSlope * gradD,1))`. Snell refraction uses
`IOR=1+glassRefraction`; optical displacement thickness is **0.5*w texels**, kept
separate from the bevel profile. Convert displacement to UV per axis. A flat
center has zero lateral displacement. Small RGB IOR offsets give dispersion;
any refracted target outside the path/canvas falls back to its unrefracted UV.

Schlick Fresnel uses `N.z` and `glassReflectivity` as F0. A soft, cool skylight
and fixed upper-left Blinn–Phong highlight are independent of fluid brightness
and pointer position. The broad diagonal softbox has display-space intensity
.65–1.65, cool RGB (.86,.93,1), reflected with F0 .04 at the flat face;
transmission uses (1-Fresnel). Blinn–Phong exponent 24/gain 8 and an interior
edge line (base .12, directional gain .22) make the bevel legible at 960×320.
These fixed environment/light intensities are artistic, not calibrated luminance.
A low center reflection keeps glass visible over dark fluid. Composite after tone mapping in display
space, clamped and premultiplied. Coverage fades exclusively inside the SDF:
alpha one inside, zero outside; no wall band. Existing obstruction cutouts apply.

Bind SDF on dedicated unit 4 every draw, including the sticky fallback texture
when absent: inactive samplers must not alias later render targets. Existing
SDF generation/resize/restore/disposal remain authoritative.

Enable only the test route's `flame-jet`: thickness .03, refraction .5,
reflectivity .04, chromatic .15. The registry and eight earlier variants remain
unchanged. This is not a solver, thermal or pacing change.

## Verification

- Save pre-change LavaLamp and forced-no-SDF SVG display bytes; compare exactly
  with `SVELTE_FLUID_SHOTS_EXTRA=glass-verify` (references machine-local).
- Own/shared cover tests check dark-fluid sheen, transparent exterior, unchanged
  dye/scalar/velocity through display toggles, shape transitions and resize.
- Registered 24–30 second physical fade is measured with glass **off**; screenshots
  at 1/5/12/30 seconds use glass **on**, plus a 30-second glass-off comparison.
- Hardware resource, restoration, selected-program, lighting and full suites;
  real page presented/scroll FPS and synchronized whole-frame glass on/off costs.
- M1 Max / ANGLE Metal / headless Chrome 155 at 1920×640: two-step synchronized
  whole frame glass on median/p90 12.4/12.8 ms, off 12.3/12.6 ms (ABBA,
  18 samples per arm). These are wall times, not GPU timer-query durations.
- Actual scrolling page at DPR2, canvas scrolled into view: flame 60.01 and
  gentle 60.00 presented FPS; minimum canvas visibility 75.66% throughout.
  Existing flame playback remains 0.5× at 60 Hz. No 120 Hz hardware claim.
- Final targeted hardware: 67 tests/6 files passed; full pre-softbox-constant
  suite: 366 passed, 3 opt-in measurement skips (no shader structure change).
  Node: 1035 passed; type check: zero errors/warnings; prepack/publint passed.
- Glass-off fade remains exactly .195/.645; tail display luminance .0147225,
  downstream salt 3.587486 and outlet flux .152303 are unchanged.

## Consequences

SVG glass remains visible without fluid illumination, intentionally unlike the
legacy model. White walls stay crisp; reflections are a fixed artistic environment,
not scene ray tracing or calibrated optical transport. One existing full-screen
post-process remains; SDF taps increase fragment cost, measured on hardware.
WebGL1/no-SDF keeps the old narrow coverage rim. Analytic LavaLamp is unchanged.
