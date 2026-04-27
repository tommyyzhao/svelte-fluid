# svelte-fluid — developer documentation

Internal documentation for contributors and maintainers. Consumer-facing
install/usage/prop-table info lives in the top-level [`README.md`](../README.md).
Contributing guidelines live in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Layout

| Path | Purpose |
| --- | --- |
| [`architecture.md`](./architecture.md) | High-level architecture diagram, module boundaries, control flow, and lifecycle. |
| [`porting-notes.md`](./porting-notes.md) | Mapping of upstream `script.js` symbols and lines to the refactored class/module structure, plus a list of intentional behavioral differences. |
| [`learnings/`](./learnings/) | Lessons captured during the port — things tried, things broken, things fixed. Organized by topic. |
| [`decisions/`](./decisions/) | ADR-style log of every key architectural decision, in chronological order. Each ADR is small and self-contained. |

## How to use these docs

- **Picking up the project after a break?** Read `architecture.md` first,
  then skim the [`decisions/`](./decisions/) index.
- **Touching the WebGL engine?** Read [`porting-notes.md`](./porting-notes.md)
  before changing anything in `src/lib/engine/`.
- **Adding a new feature?** Add an ADR in [`decisions/`](./decisions/) and
  update [`architecture.md`](./architecture.md) if module boundaries shift.
- **Debugging a weird issue?** Check [`learnings/`](./learnings/) — the same
  trap may already be documented.

## Document conventions

- ADRs follow a lightweight ["Michael Nygard" template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions): **Context → Decision → Consequences**.
- File paths use the project root (`svelte-fluid/`) as the base.
- Source line references use `path/to/file.ts:lineNumber` so editors and
  GitHub can deep-link.
