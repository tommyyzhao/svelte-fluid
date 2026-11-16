# Bounded mesh-first preflight

Preparation only. No solver, container provisioning, download, remote call, cleanup,
or automatic next attempt. Frozen screening protocol remains authoritative.

**Runtime placement:** Python `stage`, diagnosis/self-check and `analyze` run on the
trusted host with existing uv/Python. Approved OpenFOAM image has neither Python
nor uv: Python `run` is **blocked in that image**, not an executable launch recipe.
Do not install packages or provision an adapter. Runtime smoke reports
`WM_PROJECT_VERSION=v2512`; runner checks that exact value. Lead may execute native
`splitCells` / `checkMesh` under finite timeout and host supervision, then evaluate
retained outputs with existing host tools. Python runner remains unexecuted.

## Inputs / prerequisites

- Existing Python stdlib via `uv run --offline --no-project python -I`; no installation.
- Lead-provisioned **dedicated** Linux container/cgroup v2, <=2 CPUs, <=4 GiB;
  OpenFOAM 2512, `/usr/lib/openfoam/openfoam2512/etc/bashrc`.
  Missing/unlimited (`max`) cgroup quotas fail explicitly. A VM's host-enforced
  limits are not silently trusted; lead must supply a separately reviewed verified
  host-limit receipt adapter before using such a runtime (not implemented here).
- Lead verifies ARM64 image digest
  `sha256:33fb575aa9980d2bc42fd58c75ae698c489293ba30c991380fe3f899c622f319`.
  Receipt records expected digest; this script cannot verify container image identity.
- Input `openfoam/extruded3d/{0,constant,system}`; reference
  `crosscode/geometry.json` containing `area_cm2`. No historical results needed.
- Dedicated investigation parent `/work/investigation`; both attempts use its
  **same** `budget.json`. Do not create a replacement ledger to reset the clock.
- Lead updates `/work/host-telemetry.json` at least every 30 seconds, atomically:
  `{"epoch": 0, "free_memory_fraction": 0.5, "load1": 2, "disk_free_bytes": 30000000000}`.
  `epoch` must be current Unix time; values come from the **host**, not guest.
  Missing/stale telemetry refuses/stops work. Host >=20% free memory on start,
  >=15% thereafter, load <=20, >=15 GiB free disk. Guest usage <3.5 GiB.
- No unrelated files/jobs in the dedicated investigation parent/cgroup. Disk scan
  includes **all** attempts below that parent, cap 24 GiB. CPU accounting belongs
  to this dedicated cgroup; no other processes may share it.

## One explicit attempt

Run staging from the trusted host code directory, not downloaded input directories;
replace `/tools` and `/work` with explicit host paths. The `run` command below is
interface documentation only: **blocked in the approved image without Python/uv**.
None were run by the implementation lane. No installation authorized.

```sh
uv run --offline --no-project python -I /tools/tesla-3d/preflight.py stage \
  --input /work/inputs/openfoam/extruded3d \
  --geometry /work/inputs/crosscode/geometry.json \
  --output /work/investigation/attempt-1 --attempt 1

uv run --offline --no-project python -I /tools/tesla-3d/preflight.py run \
  --output /work/investigation/attempt-1 \
  --budget /work/investigation/budget.json \
  --host-telemetry /work/host-telemetry.json
```

Staging refuses existing output, symlinks/special input files, unexpected pilot
cell count, IDs or eight-face topology, >=0.1% valve-area error. Copies only
`0`, `constant`, `system`; records SHA-256; retains read-only `input` plus writable
`case`. The top-level input path is explicitly resolved (a top-level symlink is
followed); nested symlinks are rejected. Original pilot is never written.
**Copied `0` fields are not mapped after split/extrusion: remap or recreate all
fields before any subsequent solver run.** JSON receipts contain paths, hashes,
commands, timestamps and measurements, never environment variables/secrets.
Paths are argument-array values, never interpolated shell code.

Attempt 1 uses the pilot's native algorithm, precisely
`splitCells -overwrite -set concaveCells 181` for
`73944,73967,147936,147959`. This is an **unverified candidate**, not a promise that
OpenFOAM can cut these cells. Full `checkMesh -allTopology -allGeometry` must emit
`Mesh OK.`, exactly one region, positive minimum volume; no failed check accepted.
No quality thresholds change. Reference area is trace `area_cm2 * 1e-4`, compared
with clipped front-face polygon areas inside `0 <= x <= 0.30`; tolerance <0.1%.
Patch names must remain unchanged; full topology checks guard patch connectivity.
A passing receipt means mesh passed only, never developed/matched-flow physics.

Shared locked ledger starts at **actual first mesh execution**, not staging or
image transfer. Both geometry attempts together get <=2 elapsed hours, <=2
attempts; overall deadline <=12 hours / <=24 core-hours, including pauses.
This tool launches one attempt then exits. No retry, solver, or campaign chain.
`status.json` records exact owned PID/process group, command, guest-memory peak,
CPU seconds, elapsed/core-hour upper bound, disk peak. `receipt.json` retains
success/failure/partial status. Monitoring every 2 seconds; disk every 15 seconds.
On a stop gate, TERM only the owned process group, wait 20 seconds; if still alive,
record exact owned PID/group and require lead intervention. No automatic SIGKILL,
forced cleanup, or retry. Lead must provide a finite external supervisor for this
residual case. All data/logs remain; no automatic cleanup.
Native mesh commands write at command completion; interrupted transformations
are partial, never restart from them. Original copied mesh remains restart source.

## Attempt 2: currently incompatible source

Optional stage requires explicit `--attempt 2 --input .../openfoam/coarse-base`,
new `attempt-2` output, same investigation ledger. It first diagnoses an exact
two-z-level, one-layer source with identical x-y pairs, then would split native
source `concaveCells` before 24-layer extrusion to 0.019 m. No averaging or
coordinate nudges. **Saved coarse-base fails exact x-y pairing**, so staging stops;
no OpenFOAM command runs. Old `fix-extrusion.py` averaged front/back coordinates;
that algorithm is intentionally excluded. No assumption that repair is possible.
Read-only diagnosis from `coarse-base/constant/polyMesh/{points,faces}` finds
3374/11103 cross-layer edges with unequal x-y coordinates; maximum paired distance
0.00081277158152055513 m. This is edge-pair diagnostic distance, not an allowed
repair displacement. Lead must diagnose/regenerate a geometry-preserving compatible
source, or declare geometry repair failed. No third attempt, no relaxed checkMesh gate.

## Refined source plan (not executed)

Regenerate a fresh one-layer source from the same immutable STL/polygon trace,
not by rescaling an already snapped mesh. Increase background `nx`,`ny` by 1.5x
(round up), nominal cells across width 12 to18; extrude 36 instead of24 layers
at the same 0.019 m physical depth. Keep geometry, snapping/quality parameters,
physical acceleration, interpolation and probes frozen. Verify actual sizes,
source pairing, valve area, connectivity and full checkMesh before any field
mapping. Estimate 245756 * 1.5^3 =829426.5 cells, not an observed count. Stop if
source incompatible, resource forecast fails, or two-attempt geometry budget
exhausted. This is a plan only, not a third repair attempt or production command.

## Read-only analysis / self-check

```sh
uv run --offline --no-project python -I scripts/tesla-3d/self_check.py
uv run --offline --no-project python -I scripts/tesla-3d/self_check.py \
  --pilot /absolute/path/to/openfoam
uv run --offline --no-project python -I scripts/tesla-3d/preflight.py analyze \
  /absolute/path/to/samples.json --block 8
```

Samples are a JSON array of `section_q_m3_s` (five **consistently +x-oriented**
signed fluxes), `p0`, `pL` (**area-weighted** means, kinematic pressure),
`acceleration_x`. Head is `sign(Q)*(p0-pL+acceleration_x*0.30)`. Analysis rejects
nonfinite samples, mixed flow signs, >0.1% section spread. Emits head/block means;
no confidence interval, ratio, stationarity, or reproduction claim. Block size is
samples, not measured correlation time; incomplete final blocks are omitted from
block means, included in full mean. Sampling extraction/area weights still need
lead verification against OpenFOAM outputs; old phi sums are not assumed oriented.

Self-check covers pressure/body-force signs, deadlines, mesh pass/fail gates,
polygon clipping, immutable copy/existing-output refusal, symlink refusal, block
means. Optional pilot diagnosis reads only; never executes mesh tools.

Solver/control/monitor integration intentionally deferred until a mesh passes.
Later lead-owned pimpleFoam execution must preserve the frozen baseline, pressure
final residual <=1e-9, CFL <=0.4, finite fields and <=0.1% section imbalance;
checkpoint every 0.25T =3.3707865 physical seconds, `purgeWrite 0`; retain all
restart fields, failed attempts, logs. No solver commands provided here. Stop at
12-hour deadline regardless of incomplete stage. No 96-hour campaign authorized.
