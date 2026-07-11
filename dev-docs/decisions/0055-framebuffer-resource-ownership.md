# ADR-0055: Explicit framebuffer resource ownership

## Status

Accepted (2026-07-11)

## Context

`initFramebuffers()` mixed dye, optional scalar, simulation, solid-derived,
bloom, and sunrays resources. A dye-resolution change therefore recreated
transient simulation and post-process targets; a simulation-resolution change
rebuilt post-processing; and a combined patch could allocate bloom twice.
Context restoration and MacCormack's solid-clearance texture added distinct
fresh-allocation and derived-resource requirements that a single boolean-heavy
initializer could no longer express safely.

## Decision

Split lifecycle ownership into explicit groups:

- dye/scalar: persistent dye plus optional dye-resolution scalar;
- simulation: persistent velocity plus transient source, divergence, curl, and
  pressure targets;
- post-process: bloom chain and sunrays pair;
- masks: aspect-dependent container, obstruction, solid, and sticky data;
- solid-derived: neighbor-solidity and MacCormack clearance textures rebuilt
  together from the current solid mask and velocity grid;
- presentation: the drawing-buffer-sized glass scene target.

Framebuffer groups take a named `fresh` or `preserve` mode. Construction and
context restoration explicitly initialize every group fresh. Runtime config
transitions preserve only their owning persistent fields and rebuild
solid-derived textures once after all simulation/mask changes are complete.
Post-process allocation remains eager until the separately gated lazy-resource
story.

## Consequences

- Dye-only, simulation-only, scalar-presence, bloom, and sunrays transitions no
  longer churn unrelated resources.
- Combined patches allocate every affected group once.
- Context restore never uses a stale-handle preserve path, including for the
  MacCormack clearance texture.
- The explicit groups provide the lifecycle foundation for state-preserving
  resize and later lazy optional allocation without introducing a generic render
  graph.
