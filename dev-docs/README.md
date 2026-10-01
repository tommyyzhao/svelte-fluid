# svelte-fluid — developer documentation

Internal documentation for contributors and maintainers. Consumer-facing
install/usage/prop-table info lives in the top-level [`README.md`](../README.md).
Contributing guidelines live in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Layout

| Path | Purpose |
| --- | --- |
| [`task-tracking.md`](./task-tracking.md) | Isolated repo-local Beads workflow, identity checks, and backup policy. |
| [`architecture.md`](./architecture.md) | High-level architecture diagram, module boundaries, control flow, and lifecycle. |
| [`porting-notes.md`](./porting-notes.md) | Historical mapping from upstream `script.js` to the deleted WebGL port. Useful for provenance, not current architecture. |
| [`learnings/`](./learnings/) | Lessons captured during the port — things tried, things broken, things fixed. Organized by topic. |
| [`decisions/`](./decisions/) | ADR-style log of every key architectural decision, in chronological order. Each ADR is small and self-contained. |
| [`epics/`](./epics/) | Multi-phase engine initiatives, including the complete WebGPU replacement map. |
| [`plans/2026-09-07-cleanroom-liquid-research.md`](./plans/2026-09-07-cleanroom-liquid-research.md) | Research proposal for a fresh liquid library: product alternatives, primary sources, and decision experiments. |
| [`plans/2026-09-10-material-ui-expansion.md`](./plans/2026-09-10-material-ui-expansion.md) | Material UI prototypes: actual outline deformation, liquid selection, persistent impressions, evidence and next hypotheses. |
| [`plans/2026-09-10-effect-first-materials.md`](./plans/2026-09-10-effect-first-materials.md) | Human-led revision, Muse/Opus consultation, membrane/mercury effects, primary sources and measured GPU cost. |
| [`plans/2026-09-10-material-quality-and-oxide-history.md`](./plans/2026-09-10-material-quality-and-oxide-history.md) | Ordinary-browser selector failure, presentation/reconstruction quality, and persistent heat-tint exploration. |
| [`plans/2026-09-11-native-pixel-materials-and-filaments.md`](./plans/2026-09-11-native-pixel-materials-and-filaments.md) | Native-DPR-only presentation, source-raster cleanup, and a coherent lit-geometry study. |
| [`plans/2026-09-11-fable-material-brainstorm.md`](./plans/2026-09-11-fable-material-brainstorm.md) | Fable 5.1 dialogue, current primary research, seven material ideas and falsifiable experiment boundaries. |
| [`plans/2026-09-11-seven-material-proofs.md`](./plans/2026-09-11-seven-material-proofs.md) | Seven native-pixel proofs, DPR continuity repair, first-principles review and measured limits. |
| [`plans/2026-09-12-research-to-interface.md`](./plans/2026-09-12-research-to-interface.md) | Human-led UI direction, primary-source research audit, and proposed living imagery, material typography and tactile controls. |
| [`plans/2026-09-13-effect-first-implementation.md`](./plans/2026-09-13-effect-first-implementation.md) | Detailed model reductions, derivations, native resource contracts, research sources and validation for the effect-first implementation. |
| [`plans/2026-09-13-effect-first-benchmark.json`](./plans/2026-09-13-effect-first-benchmark.json) | Forty standalone native-size measurements with source fingerprints, timing definitions, setup costs and explicit desktop-only limits. |
| [`plans/2026-09-13-human-feedback-revision.md`](./plans/2026-09-13-human-feedback-revision.md) | Human-led fixes, Fable critique and challenged advice, stronger first-use/perceptual checks, and revised interaction contracts. |
| [`plans/2026-09-13-feedback-benchmark.json`](./plans/2026-09-13-feedback-benchmark.json) | Forty-four current standalone measurements, including speed-adaptive pigment dispatch counts and stationary material history; original measurements remain historical. |
| [`plans/2026-09-14-material-design-library.md`](./plans/2026-09-14-material-design-library.md) | Current library proposal: four useful treatment families, explicit merge/drop decisions for every study, native-UI boundary and adaptation gates. |
| [`plans/2026-09-14-material-library-integration.md`](./plans/2026-09-14-material-library-integration.md) | First three experimental material exports, native-UI composition, resource contracts, verification and review script. |
| [`plans/2026-09-13-studio-pruning.md`](./plans/2026-09-13-studio-pruning.md) | Implemented lab curation: removed editor/widget utilities and rejected variants, preserved material mechanisms, recovery and verification. |
| [`plans/2026-09-13-mega-batch.md`](./plans/2026-09-13-mega-batch.md) | Historical expansion and measured evidence. Its portfolio and counts were superseded by the studio-pruning record above. |
| [`plans/2026-09-13-native-typography-setup.json`](./plans/2026-09-13-native-typography-setup.json) | Split native typography setup measurements and exact raster-equivalence evidence; remaining main-thread stalls are explicit. |

## How to use these docs

- **Picking up the project after a break?** Read `architecture.md` first,
  then skim the [`decisions/`](./decisions/) index.
- **Touching the native engine?** Read `architecture.md`, ADR-0068, and the current
  WGSL/orchestration together. Use `porting-notes.md` only for historical intent.
- **Adding a new feature?** Add an ADR in [`decisions/`](./decisions/) and
  update [`architecture.md`](./architecture.md) if module boundaries shift.
- **Debugging a weird issue?** Check [`learnings/`](./learnings/) — the same
  trap may already be documented.

## Document conventions

- ADRs follow a lightweight ["Michael Nygard" template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions): **Context → Decision → Consequences**.
- File paths use the project root (`svelte-fluid/`) as the base.
- Source line references use `path/to/file.ts:lineNumber` so editors and
  GitHub can deep-link.
