# Bounded 3D screening — geometry gate stopped the investigation

## Outcome in plain English

The owner funded a limited investigation of whether channel depth explains the gap between the flat simulation and the laboratory experiment. Both predeclared geometry-repair attempts failed the unchanged quality checks. **No three-dimensional flow calculation ran.** This is a geometry-preparation result, not evidence for or against the depth explanation.

The investigation stopped after its two permitted attempts, rather than spending the remaining time on an invalid model or relaxing the checks. Work returns to the browser library. Continuing scientific work would require a newly scoped mesh-generation approach, not another retry under this protocol.

## Bounds and question

First stage: at most 12 elapsed hours / 24 core-hours, one case at a time, two CPU cores, 4 GiB memory; geometry preparation limited to two attempts and two hours. The question was whether adding the physical 1.9 cm depth changes resistance and backward-flow behavior at nominal Reynolds number 200. The patent-traced geometry differs from the paper, so a positive result would not itself establish experimental reproduction.

The planned comparison measures backward versus forward pressure needed for the **same flow rate**. Equal-push flow ratios are different quantities. With the existing constant body force, OpenFOAM's pressure difference requires the body-force contribution across the valve to be added before computing resistance.

A later multi-day production campaign was not automatically authorized. No preset, engine, solver or acceptance-threshold change resulted from this screening.

## Runtime preparation

The previously approved Linux ARM64 OpenFOAM 2512 image was transferred by checksum to the spare Mac. The native container runtime reported the same solver build, `_87ed40d2-20251219`, and enforced the two-core / 4 GiB limits. Startup needed a shell-wrapper correction: source the environment before enabling strict shell handling, and compare the version with `v2512`, not `2512`.

The image has no Python interpreter. Standard-library Python staging and analysis remain host-side; their optional in-container monitor is explicitly unavailable without an authorized runtime prerequisite. Native geometry utilities ran under bounded shell supervision instead. No solver or Python package was downloaded.

The initial 20-minute image-transfer estimate was amended to 40 minutes before scientific execution, after observing network throughput. This extended setup only; the scientific and geometry limits stayed unchanged. No duplicate transfer was started.

## Geometry attempts

| Attempt | Construction | Result |
|---|---|---|
| 1 | Native split of the four known concave cells in the retained 245,756-cell pilot mesh | Utility cut **zero cells**. Full quality check still found the same **four concave cells**. Failed. |
| 2 | Extrude the already repaired, accepted flat mesh through the physical depth: 37,159 source cells × 24 layers | **891,816 cells**; one connected region, correct depth and positive volumes. Concavity passed, but **32 cells failed the determinant check**. Failed. |

The second candidate used the existing accepted lower surface, without averaging or shifting x/y coordinates. Its increased in-plane resolution was declared before execution. Boundary metadata was changed from a flat-model boundary to a wall in fresh copies only. The old candidate mesh was moved aside so the quality checker could not accidentally inspect stale geometry.

The determinant check tests whether a cell has sufficient geometric spread for a reliable numerical calculation. Candidate two's minimum was `8.191136599e-06`; the unchanged check required at least `0.001`. Positive volume and the absence of inward-folding faces were not sufficient for acceptance. No third split, merge, tolerance change or coordinate adjustment was attempted.

## Observed cost and limits

Geometry checking was inexpensive relative to the projected flow study. Guest-memory samples peaked at approximately 100 MiB for attempt one and 1.23 GiB for attempt two; the latter operation's sampled log span was 12 seconds. These are sampled observations, not proven peak bounds or flow-solver memory estimates. Host free memory remained about 71–72%.

The first geometry command began at 22:39:10 Pacific on October 23; the second quality check finished approximately eight minutes later. Runtime setup and investigation tooling took longer, but no sustained fluid simulation consumed the proposed hours. The full 12-hour budget was a ceiling, not a spending target.

## Reproducibility and retained evidence

`scripts/tesla-3d/` contains host-side immutable staging, exact pilot checks, pressure/sign analysis and synthetic self-checks. Its README documents prerequisites and deliberately rejects incompatible sources or absent resource quotas. It does not silently provision software or run a production campaign.

```sh
uv run --offline --no-project python -I scripts/tesla-3d/self_check.py
bun run test && bun run check
```

Original pilot files were not modified. Full input copies, image hashes, failed meshes, native utility logs, resource measurements and exact ownership records remain in the private research archive. Machine resource handles stay out of Git.

The installed remote job-removal helper was under a safety hold. All six owned setup/geometry containers were confirmed stopped; completed job directories and evidence remain owned and intentionally retained, not force-removed. Foreign jobs and containers were untouched.

## Product consequences

- The laboratory page now uses plain-English labels and warnings; experimental identifiers and simulation settings remain unchanged.
- The higher-speed example remains laboratory-only, not a validated real-world prediction.
- Obstacle-conservation improvements remain a separate opt-in library investigation.
- Release still requires normal review and broader browser/device validation; nothing was published.
- Further 3D work needs a new geometry approach with its own explicit scope and quality checks. The depth question remains unanswered.
