# ADR 0021: Annulus (circular ring) container shape

**Status:** Accepted
**Date:** 2026-04-13

## Context

The shaped container system (ADR [0018](./0018-shaped-containers-mask-penalisation.md))
supports circle, frame, and roundedRect. The annulus — fluid confined to
a ring between two concentric circles — is the natural next shape. It
enables ring-vortex visual effects and fills the gap between "fluid
inside a circle" and "fluid outside a rectangle".

## Decision

Add `{ type: 'annulus'; cx; cy; innerRadius; outerRadius }` to the
`ContainerShape` union. The SDF uses
`max(d - outerRadius, innerRadius - d)` which is negative inside the
annular band and positive outside. Both radii are normalised by canvas
height with aspect correction, matching the circle shape exactly.

Shape type ID is 3 in both shaders. `uContainerRadius` / `uRadius` is
reused for the outer radius; a new uniform (`uContainerInnerRadius` /
`uInnerRadius`) carries the inner radius.

HDR area fraction: `pi * (outerR^2 - innerR^2)`, clamped to >= 0 for
the degenerate case.

## Consequences

- A new `AnnularFluid` preset provides a ring-vortex demo out of the box.
- The ControlPanel gains innerRadius / outerRadius sliders.
- One new uniform per shader (minor; unused uniforms for other shapes are
  already present and ignored).
- Degenerate annulus (innerR >= outerR) silently produces zero mask
  everywhere — no error, no visual.
- The same aspect-correction pattern as circle means the ring appears
  circular on any aspect ratio.
