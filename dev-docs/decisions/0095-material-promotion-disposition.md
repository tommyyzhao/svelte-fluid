# ADR-0095: Which R&D materials are promoted to WebGL2

## Status

Accepted (2026-10-02)

## Context

The private WebGPU R&D branch (`rd/webgpu-replacement`, ADRs 0070–0078 there)
produced several material studies. The owner liked six of them: thin film,
enamel, velvet, snap foil, stress glass and liquid selection. The 1.0 goal says
to promote only those, only where each has a concrete UI job, and ported to
WebGL2. The owner also rejected an all-materials composition as cheap and asked
not to add permanent chrome around a material just to show it off.

A material earns a component only if it does a UI job that a plain control or
an existing primitive does not already do. "It looks good" is not a job.

## Decision

| Material | UI job | Disposition |
|---|---|---|
| Snap foil (bistable beam) | The two buckled wells *are* a switch's on/off state | **Removed by owner (2026-10-02)**: no metal switches; `LiquidToggle` reuses ADR 0091/0092 |
| Enamel (compliant transport toward a glyph profile) | A display heading whose relief gives under a press | **Promoted (ADR 0097) after one tuning pass**; it met the kill gate (visibly beats a static CSS/SVG bevel of the same text) |
| Thin film (interference) | Tint on a selected lens | **Later**: a possible `finish` on `LiquidSegmented`, after owner review. Adding it now would stack effects on a shipped look |
| Velvet (pile-lean field) | A finish of the enamel heading | **Later**, folded into `EnamelText` if it ships. Not a primitive on its own |
| Stress glass (photoelastic disk) | Pressed state of a circular icon button | **Later at best**: disk-only geometry, and rainbow fringes under a label put contrast at risk |
| Liquid selection (metaball indicator) | Moving selected-segment indicator | **Not promoted**: `LiquidSegmented` (ADR 0092) already does this job |
| Crazed enamel | None (damage-as-error) | **Not promoted** |

Each promoted material becomes a sibling model engine on the shared gl-host
(ADR 0088), following the model-engine contract of ADR 0090. None changes
`FluidEngine`.

## Consequences

- The library gains two material primitives rather than six. Each one has a
  single job and is reviewed alone; docs never show a composition demo.
- Thin film, velvet and stress glass stay on the R&D branch until a concrete
  job and an owner review justify them.
- If `EnamelText` fails its kill gate, only `FoilSwitch` ships, and this ADR's
  table is updated.

## Amendment (2026-10-02)

`EnamelText` met the kill gate after one tuning pass and is now root-exported
and documented at `/docs/components#enameltext`. Both promoted materials ship.

## Owner disposition amendment (2026-10-02)

Owner decision: “No metal switches, only liquid.” The foil port, public component, exclusive engine, tests and capture bench are removed rather than retained as a failed showcase. ADR 0096 remains the historical port record. `LiquidToggle` replaces the switch role with the existing height-field surface lens; `EnamelText` remains unchanged. The earlier promotion statements above are historical, not current approval. LiquidToggle still requires visual owner review.
