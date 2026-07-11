# ADR-0060: CSS pixels select quality while physical DPR sizes allocations

## Status

Accepted (2026-07-11)

## Context

The component used `devicePixelRatio` both to size the canvas and to choose
small-canvas quality tiers. The same CSS card could therefore disable effects
at DPR 1 but enable them at DPR 2 or 3, while DPR 3+ devices paid rapidly
growing framebuffer and fill-rate costs with little visible benefit.

## Decision

Add the component prop `maxPixelRatio?: number | null`, defaulting to `2`.
`null` explicitly opts into native DPR. Use CSS dimensions for qualitative
policy (post-effect suppression and automatic iteration tiers), and capped
physical dimensions only for drawing-buffer and texture allocation caps.

Fit drawing buffers to `MAX_VIEWPORT_DIMS`, and fit aspect-preserving FBO grid
resolutions to `MAX_TEXTURE_SIZE`. The policy is construct-only; changing it
requires remounting the component.

## Consequences

- A card selects the same feature/iteration tier at DPR 1, 2, or 3.
- DPR 3+ defaults substantially reduce pixels, memory, and fill rate.
- Native-density rendering remains available as an explicit opt-out.
- This is an additive public prop but changes default rendering allocation on
  devices above DPR 2, so it ships with a minor changeset and documentation.
