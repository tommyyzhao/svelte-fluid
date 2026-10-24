"""CPU-only pressure-space gate; run with uv run --with numpy --with scipy python -I.

Arguments: capture directory, optional section spacing (default 8), optional PCG steps (default 4).
The saved checkpoint tentative is reconstructed by undoing its saved projection;
its saved pressure is the warm start. No new trajectory or GPU capture is implied.
"""

import base64
from collections import deque
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import numpy as np
from scipy import linalg, sparse
from scipy.sparse import csgraph
from scipy.sparse.linalg import splu


def decode(value, dtype):
    result = np.frombuffer(base64.b64decode(value, validate=True), dtype=dtype).copy()
    assert np.isfinite(result).all()
    return result


def geometry(raw):
    q = decode(raw['exact'], '<f8')
    faces = decode(raw['tentative'], '<f8')
    n = len(q)
    total = len(faces) // 2 - n - 1
    width = round((total + np.sqrt(total * total - 4 * n)) / 2)
    height = total - width
    assert width * height == n
    # The exact solve writes zero only to solid cells. Cross-check the actual
    # patent polygon independently below; never infer an operator from q values alone.
    text = (Path(__file__).parents[1] / 'geometry.ts').read_text()
    path = text.split("export const PAPER_PATH =\n\t'")[1].split("';")[0]
    import re
    polygons = []
    for part in path.split('M ')[1:]:
        nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', part)]
        polygons.append(np.array(nums).reshape(-1, 2))
    valve_width = raw['options']['width']
    plenum = (width - valve_width) // 2
    yy, xx = np.mgrid[:height, :width]
    px = (xx + .5 - plenum) * 29.973013 / valve_width
    py = (height - yy - .5) * 3.508246 / height
    inside = np.zeros((height, width), dtype=bool)
    for polygon in polygons:
        for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
            if a[1] == b[1]:
                continue
            inside ^= ((a[1] > py) != (b[1] > py)) & (px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0])
    inside |= (xx < plenum) | (xx >= width - plenum)
    assert np.array_equal(inside.ravel(), q != 0), 'Polygon/actual captured mask differ'
    ids = np.full((height, width), -1, dtype=int)
    ids[inside] = np.arange(inside.sum())
    n = int(inside.sum())
    rows, cols = [], []
    for dy, dx in [(0, 1), (1, 0)]:
        a = ids[:height-dy, :width-dx]
        b = ids[dy:, dx:]
        valid = (a >= 0) & (b >= 0)
        rows.extend(a[valid]); cols.extend(b[valid])
    edges = sparse.coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)).tocsr()
    edges = edges + edges.T
    degree = np.asarray(edges.sum(axis=1)).ravel()
    boundary = np.zeros(n)
    boundary[ids[:, 0]] += 2
    boundary[ids[:, -1]] += 2
    a0 = sparse.diags(degree) - edges
    a = (a0 + sparse.diags(boundary)).tocsr()
    assert csgraph.connected_components(edges)[0] == 1
    assert boundary.sum() > 0
    return dict(width=width, height=height, mask=inside, ids=ids, edges=edges,
                a0=a0.tocsr(), a=a, diagonal=a.diagonal(), plenum=plenum,
                valve_width=valve_width, n=n, boundary=boundary)


def interpolation(g, spacing):
    edges, ids, n = g['edges'], g['ids'], g['n']
    assert 2 <= spacing <= 64
    distance = np.full(n, -1, dtype=int)
    queue = deque(ids[:, 0].tolist())
    distance[ids[:, 0]] = 0
    while queue:
        i = queue.popleft()
        for j in edges.indices[edges.indptr[i]:edges.indptr[i + 1]]:
            if distance[j] < 0:
                distance[j] = distance[i] + 1
                queue.append(j)
    assert (distance >= 0).all()
    # A single BFS level has no face-connected edges on a bipartite MAC graph.
    # ponytail: two-level constant anchors lose within-section branch modes;
    # upgrade to constrained linear/root-node interpolation, not more cycles.
    root = distance % spacing <= 1
    root[ids[:, 0]] = True
    root[ids[:, -1]] = True
    roots = np.flatnonzero(root)
    # Each connected cross-section is independent: branches never merge through walls.
    count, labels = csgraph.connected_components(edges[roots][:, roots])
    p = sparse.lil_matrix((n, count))
    p[roots, labels] = 1
    interior = np.flatnonzero(~root)
    components, component = csgraph.connected_components(edges[interior][:, interior])
    root_id = np.full(n, -1, dtype=int)
    root_id[roots] = labels
    for block in range(components):
        cells = interior[component == block]
        neighbors = np.unique(edges[cells].indices)
        columns = np.unique(root_id[neighbors][root_id[neighbors] >= 0])
        assert len(columns)
        coupling = edges[cells][:, roots] @ sparse.csr_matrix(
            (np.ones(len(roots)), (np.arange(len(roots)), labels)), shape=(len(roots), count))
        values = splu(g['a0'][cells][:, cells].tocsc()).solve(coupling[:, columns].toarray())
        assert np.min(values) > -1e-12
        p[np.ix_(cells, columns)] = values
    p = p.tocsr()
    p.eliminate_zeros()
    # Dirichlet contributions act only on fixed roots; minimizing A0 here is
    # therefore exactly minimizing the captured A under these root constraints.
    harmonic_residual = g['a'][interior] @ p
    harmonic_error = float(np.max(abs(harmonic_residual.data)))
    assert harmonic_error < 1e-11
    ac = (p.T @ g['a'] @ p).toarray()
    factor = linalg.cho_factor(ac, lower=True, check_finite=False)
    assert np.max(abs(ac - ac.T)) < 1e-11
    assert np.max(abs(p @ np.ones(count) - 1)) < 1e-11
    root_coordinate = np.bincount(labels, weights=distance[roots]) / np.bincount(labels)
    ramp = p @ root_coordinate
    return p, factor, dict(
        count=count, nnz=p.nnz, meanRowNnz=p.nnz / n,
        maxRowNnz=int(np.max(np.diff(p.indptr))),
        maxColumnNnz=int(np.max(np.diff(p.tocsc().indptr))),
        constantMaxError=float(np.max(abs(p @ np.ones(count) - 1))),
        geodesicRampMaxError=float(np.max(abs(ramp - distance))),
        geodesicRampRelativeL2=float(np.linalg.norm(ramp-distance)/np.linalg.norm(distance)),
        harmonicExtensionMaxResidual=harmonic_error,
        rampCheck='geodesic ramp only approximate; harmonic extension residual checked independently',
        galerkinSymmetry=float(np.max(abs(ac-ac.T))),
        coarseMinEigenvalue=float(linalg.eigvalsh(ac, subset_by_index=[0, 0])[0]),
        farthest=int(distance.max()), spacing=spacing)


def packed_gradient(g, q):
    h, w = g['height'], g['width']
    field = np.zeros((h, w)); field[g['mask']] = q
    u = np.zeros((h, w + 1)); v = np.zeros((h + 1, w))
    u[:, 0] = 2 * field[:, 0]; u[:, -1] = -2 * field[:, -1]
    u[:, 1:-1] = (field[:, 1:] - field[:, :-1]) * (g['mask'][:, 1:] & g['mask'][:, :-1])
    v[1:-1] = (field[1:] - field[:-1]) * (g['mask'][1:] & g['mask'][:-1])
    out = np.zeros((h + 1, w + 1, 2))
    out[:h, :w, 0] = u[:, 1:]; out[:h, w, 0] = u[:, 0]
    out[:h, :w, 1] = v[1:]; out[h, :w, 1] = v[0]
    return out.ravel()


def divergence(g, state):
    h, w = g['height'], g['width']
    f = state.reshape(h + 1, w + 1, 2)
    u = np.concatenate([f[:h, w:, 0], f[:h, :w, 0]], axis=1)
    v = np.concatenate([f[h:, :w, 1], f[:h, :w, 1]], axis=0)
    return (u[:, 1:] - u[:, :-1] + v[1:] - v[:-1])[g['mask']]


def metrics(g, state, q, exact, a):
    projected = state - packed_gradient(g, q)
    f = projected.reshape(g['height'] + 1, g['width'] + 1, 2)
    sections = [g['plenum'] + int(np.floor(t * g['valve_width'] + .5)) for t in [0, .25, .5, .75, 1]]
    fluxes = [float(np.sum(f[:g['height'], x-1, 0])) for x in sections]
    error = q - exact
    return dict(spread=float(np.ptp(fluxes) / np.max(np.abs(fluxes))), fluxes=fluxes,
                energy=float(np.sqrt(max(0, error @ (a @ error)))),
                residualL2=float(np.linalg.norm(divergence(g, projected))),
                maxDivergence=float(np.max(abs(divergence(g, projected)))))


def pass_budget(g, p, sweeps, iterations):
    # Exact output-pixel accounting for a declared, not implemented, GPU schedule.
    # Restriction uses a padded CSC list, four weighted gathers per first-pass
    # texel, then four-way row reductions. No atomics or CPU readback assumed.
    w, h = g['width'], g['height']; grid = w*h
    count = p.shape[1]
    max_column = int(np.max(np.diff(p.tocsc().indptr)))
    restriction_shapes = []
    length = max_column
    while length > 1:
        length = (length+3)//4
        restriction_shapes.append([length, count])
    restriction = sum(x*y for x,y in restriction_shapes)/grid
    prolongation = 1
    coarse = count / grid
    reduction_shapes = []
    rw, rh = w, h
    while rw > 1 or rh > 1:
        rw, rh = (rw+1)//2, (rh+1)//2
        reduction_shapes.append([rw, rh])
    pyramid = sum(x*y for x,y in reduction_shapes)/grid
    # Eight weighted-Jacobi draws, residual, CSC restriction, cached dense
    # inverse, full-grid prolongation. Static interpolation setup is CPU-only.
    preconditioner = 2*sweeps + 1 + restriction + coarse + prolongation
    iteration = preconditioner + 5 + 2*pyramid
    # Tentative-velocity divergence and warm-start residual; final gradient
    # and column-flux diagnostic. Count RHS formation even though captures save it.
    initialization = 2
    final = (w+1)*(h+1)/grid + (w+1)/grid
    return dict(unit='rendered output pixels / (width*height); MRT counts one draw',
                preconditioner=preconditioner, restriction=restriction,
                restrictionShapes=restriction_shapes,
                prolongation=prolongation, coarseSolve=coarse,
                reductionPyramid=pyramid, reductionShapes=reduction_shapes,
                perIteration=iteration, initialization=initialization,
                finalDiagnostics=final,
                total=initialization + iterations*iteration + final,
                stationaryTotal=2 + iterations*(preconditioner+2) + final,
                denseCoarseMultiplyAdds=count*count,
                interpolationMultiplyAdds=p.nnz,
                paddedRestrictionGathers=4*restriction_shapes[0][0]*count,
                maxProlongationGathers=int(np.max(np.diff(p.indptr))),
                draws=dict(initialization=2, smoothingPerIteration=2*sweeps,
                           preconditionerResidualPerIteration=1,
                           restrictionPerIteration=len(restriction_shapes),
                           coarseApplyPerIteration=1, prolongationPerIteration=1,
                           dotProductsPerIteration=2, reductionLevelsPerIteration=2*len(reduction_shapes),
                           searchDirectionPerIteration=1, operatorPerIteration=1,
                           pressureResidualMrtPerIteration=1, finalProjectionAndDiagnostic=2,
                           perIteration=2*sweeps+1+len(restriction_shapes)+1+1+5+2*len(reduction_shapes),
                           total=4+iterations*(2*sweeps+1+len(restriction_shapes)+1+1+5+2*len(reduction_shapes))),
                note='Declared schedule, not GPU timing; dense coarse and sparse gathers have unequal per-pixel costs')


def small_check():
    # Non-tautological reproduction/SPD check on the identical open-end stencil.
    width, height = 33, 5
    yy, xx = np.mgrid[:height, :width]
    ids = np.arange(width*height).reshape(height, width)
    edges = sparse.lil_matrix((width*height, width*height))
    for dy, dx in [(0,1), (1,0)]:
        i = ids[:height-dy, :width-dx].ravel()
        j = ids[dy:, dx:].ravel()
        edges[i,j] = 1; edges[j,i] = 1
    edges = edges.tocsr()
    a0 = sparse.diags(np.asarray(edges.sum(axis=1)).ravel())-edges
    boundary = np.zeros(width*height)
    boundary[ids[:,0]] = 2; boundary[ids[:,-1]] = 2
    a = (a0+sparse.diags(boundary)).tocsr()
    g = dict(edges=edges, ids=ids, n=width*height, a0=a0.tocsr(), a=a)
    p, factor, stats = interpolation(g, 8)
    roots = np.arange(width) % 8 <= 1
    roots[-1] = True
    _, labels = csgraph.connected_components(edges[np.flatnonzero(np.tile(roots,height))][:,np.flatnonzero(np.tile(roots,height))])
    # Two-cell-wide roots deliberately impose constant values there; the
    # constrained ramp is exactly linear only between their section centres.
    expected = xx.ravel().astype(float)
    values = np.bincount(labels, weights=xx.ravel()[np.tile(roots,height)])/np.bincount(labels)
    ramp = p@values
    error = float(np.max(abs(ramp-expected)))
    # The imposed two-cell plateaux are the documented ramp-reproduction ceiling.
    assert error <= .50000000001
    def b(rhs):
        x = np.zeros(len(rhs))
        for _ in range(4): x += (2/3)*(rhs-a@x)/a.diagonal()
        x += p@linalg.cho_solve(factor,p.T@(rhs-a@x))
        for _ in range(4): x += (2/3)*(rhs-a@x)/a.diagonal()
        return x
    dense = np.column_stack([b(e) for e in np.eye(width*height)])
    symmetry = float(np.max(abs(dense-dense.T)))
    minimum = float(linalg.eigvalsh(dense)[0])
    assert symmetry < 1e-11 and minimum > 0
    return dict(preconditionerMaxAsymmetry=symmetry, preconditionerMinEigenvalue=minimum,
                constrainedStraightRampMaxError=error, constantMaxError=stats['constantMaxError'])


def ritz_location(g, directions, alphas, betas, rz_values, precondition):
    # Standard PCG/Lanczos relation for B^(1/2) A B^(1/2). Recover the
    # physical error-space vector as a combination of z_k/sqrt(r_k^T z_k).
    k = len(alphas)
    diagonal = np.array([1/alphas[i] + (betas[i-1]/alphas[i-1] if i else 0) for i in range(k)])
    off = np.array([np.sqrt(betas[i])/alphas[i] for i in range(k-1)])
    values, vectors = linalg.eigh_tridiagonal(diagonal, off)
    vector = sum(((-1)**i)*vectors[i,0]*directions[i]/np.sqrt(rz_values[i]) for i in range(k))
    vector /= np.linalg.norm(vector)
    field = np.zeros_like(g['mask'], dtype=float); field[g['mask']] = vector
    yy, xx = np.mgrid[:g['height'], :g['width']]
    valve = (xx >= g['plenum']) & (xx < g['plenum']+g['valve_width'])
    open_end = (xx < 8) | (xx >= g['width']-8)
    mouths = (abs(xx-g['plenum']) <= 12) | (abs(xx-(g['plenum']+g['valve_width'])) <= 12)
    # Branch joins and tips are indexed by the unchanged patent island bounds.
    text = (Path(__file__).parents[1]/'geometry.ts').read_text()
    path = text.split("export const PAPER_PATH =\n\t'")[1].split("';")[0]
    import re
    tips = np.zeros_like(valve); junctions = np.zeros_like(valve)
    for part in path.split('M ')[2:]:
        nums = np.array([float(x) for x in re.findall(r'-?\d+(?:\.\d+)?',part)]).reshape(-1,2)
        for cm in [nums[:,0].min(),nums[:,0].max()]:
            x = g['plenum']+cm/29.973013*g['valve_width']
            tips |= abs(xx-x) <= 4
            junctions |= abs(xx-x) <= 14
    categories = dict(openEndDirichletFaces=open_end,
                      plenumMouths=mouths & ~open_end,
                      islandTips=tips & valve & ~mouths,
                      loopJunctions=junctions & valve & ~tips & ~mouths,
                      plenumInterior=~valve & ~mouths & ~open_end)
    used = np.zeros_like(valve)
    for mask in categories.values(): used |= mask
    categories['branchInteriors'] = ~used
    a = g['a']; edge = g['edges']
    difference = np.array(edge.tocoo().data, copy=True)
    coo = edge.tocoo()
    difference *= .5*(vector[coo.row]-vector[coo.col])**2
    energy_density = np.bincount(coo.row, weights=difference, minlength=g['n']) + g['boundary']*vector**2
    total_energy = float(vector@(a@vector))
    shares = {}
    for name, mask in categories.items():
        selected = mask[g['mask']]
        shares[name] = dict(cellCount=int(selected.sum()),
                            l2Fraction=float(np.sum(vector[selected]**2)),
                            energyFraction=float(np.sum(energy_density[selected])/total_energy))
    peak = np.unravel_index(np.argmax(abs(field)),field.shape)
    ay = a@vector
    # Ritz defect in error space, reported without pretending a four-vector
    # Krylov space contains the global smallest eigenmode.
    defect = precondition(ay)-values[0]*vector
    return dict(krylovDimension=k, smallestRitzValue=float(values[0]),
                largestRitzValue=float(values[-1]),
                relativeRitzDefect=float(np.linalg.norm(defect)/np.linalg.norm(precondition(ay))),
                peakCell=[int(peak[1]),int(peak[0])], categoryShares=shares,
                warning=f'smallest {k}-step Ritz vector, not a converged global eigenvector; 8-cell ends, 12-cell mouths, 4-cell tips, 14-cell junction bands',
                alphas=alphas, betas=betas)


def draw_neutral(g, p, factor, state, previous, rhs, exact):
    # Pre-registered 64 pressure draws; common divergence/gradient excluded,
    # exactly as the existing engine's 64 paired-Jacobi pressure draws.
    a, diagonal = g['a'], g['diagonal']
    rows = []

    def load_guard():
        if os.getloadavg()[0] > 20:
            raise RuntimeError('CPU measurement stopped: one-minute load exceeds 20')

    def jacobi(x, count, omega=1):
        for _ in range(count):
            load_guard()
            x += omega*(rhs-a@x)/diagonal
        return x

    def correct(x):
        load_guard()
        x += p@linalg.cho_solve(factor,p.T@(rhs-a@x),check_finite=False)
        return x

    def record(name, restriction, pairs, cycles, run, draws=64):
        load_guard()
        x = run(previous.copy())
        row = metrics(g,state,x,exact,a)
        row.update(name=name, restrictionDraws=restriction, pairDraws=pairs,
                   stationaryCycles=cycles, pressureDraws=draws,
                   qualifies=row['spread'] <= .0115 and draws <= 64)
        rows.append(row)

    record('baseline',0,64,0,lambda x:jacobi(x,128))
    for restriction in [7,2,1]:
        coarse = restriction+3
        remaining = 64-coarse
        record('coarse-first',restriction,remaining,0,
               lambda x:jacobi(correct(x),2*remaining))
        record('coarse-last',restriction,remaining,0,
               lambda x:correct(jacobi(x,2*remaining)))
        pairs = 64-2*coarse
        thirds = [pairs//3,pairs//3,pairs-2*(pairs//3)]
        def interleaved(x):
            for count in thirds[:2]:
                x = correct(jacobi(x,2*count))
            return jacobi(x,2*thirds[2])
        record('two-interleaved',restriction,pairs,0,interleaved)
        cycles = 64//(8+coarse)
        remainder = 64-cycles*(8+coarse)
        def stationary(x):
            for _ in range(cycles):
                x = jacobi(correct(jacobi(x,4,2/3)),4,2/3)
            return x
        # Record truly pure cycles separately; then spend the remaining draws
        # on paired Jacobi so every equal-budget row really totals 64.
        record('pure-stationary',restriction,0,cycles,stationary,cycles*(8+coarse))
        record('stationary-plus-remainder',restriction,remainder,cycles,
               lambda x:jacobi(stationary(x),2*remainder))
    return rows


def main():
    start = time.monotonic()
    draw_mode = len(sys.argv) > 4 and sys.argv[4] == 'draw-neutral'
    if draw_mode and os.getloadavg()[0] > 20:
        raise RuntimeError('CPU measurement stopped: one-minute load exceeds 20')
    load_start = subprocess.check_output(['uptime'],text=True).strip()
    small = small_check()
    directory = Path(sys.argv[1]).resolve()
    spacing = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    assert 2 <= spacing <= 64
    pcg_steps = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    assert 4 <= pcg_steps <= 7
    raw = json.loads((directory / 'capture-worst.json').read_text())
    g = geometry(raw)
    a = g['a']; diagonal = g['diagonal']
    direct = splu(a.tocsc(), permc_spec='MMD_AT_PLUS_A')
    p, factor, stats = interpolation(g, spacing)
    sweeps = 4
    omega = 2/3

    def smooth(x, rhs):
        for _ in range(sweeps):
            x = x + omega * (rhs-a@x)/diagonal
        return x

    def precondition(rhs):
        x = smooth(np.zeros(g['n']), rhs)
        x += p @ linalg.cho_solve(factor, p.T @ (rhs-a@x), check_finite=False)
        return smooth(x, rhs)

    rng = np.random.default_rng(1159)
    u, v = rng.normal(size=(2, g['n']))
    bu, bv = precondition(u), precondition(v)
    symmetry = abs(u@bv - v@bu) / max(abs(u@bv), abs(v@bu))
    assert symmetry < 1e-10
    assert u@bu > 0 and v@bv > 0
    # Matched weighted Jacobi is SPD because 0 < omega < 2/lambda_max(D^-1 A).
    # This graph has lambda_max <= 2; the positive Galerkin correction preserves it.
    assert 0 < omega < 1
    checks = dict(symmetryRelative=float(symmetry), randomQuadraticForms=[float(u@bu), float(v@bv)],
                  fineSymmetry=float(sparse.linalg.norm(a-a.T)),
                  constantEnergy=float(np.ones(g['n'])@(a@np.ones(g['n']))),
                  nullspace='none: connected graph, strictly positive open-end conductance',
                  exactGradientIdentity=float(np.max(abs(divergence(g, packed_gradient(g, u)) + a@u))))
    assert checks['exactGradientIdentity'] < 1e-12
    cases = []
    for name in ['capture-worst.json', 'forward200final-checkpoint.json', 'reverse400c-checkpoint.json']:
        data = json.loads((directory / name).read_text())
        assert data['options']['width'] == raw['options']['width']
        if 'tentative' in data:
            state = decode(data['tentative'], '<f8')
            previous = decode(data['previous'], '<f8')[g['mask'].ravel()]
            rhs = -decode(data['rhs'], '<f8')[g['mask'].ravel()]
            recorded = decode(data['exact'], '<f8')[g['mask'].ravel()]
            provenance = 'actual preprojection GPU capture; saved previous-step pressure'
        else:
            saved = decode(data['pressure'], '<f4').astype(float)[g['mask'].ravel()]
            state = decode(data['velocity'], '<f4').astype(float) + packed_gradient(g, saved)
            previous = saved
            rhs = -divergence(g, state)
            recorded = None
            provenance = 'saved GPU checkpoint; tentative reconstructed as velocity + G(saved pressure); warm saved pressure'
        exact = direct.solve(rhs)
        assert np.linalg.norm(a@exact-rhs)/max(1, np.linalg.norm(rhs)) < 1e-10
        case = dict(name=name, sha256=hashlib.sha256((directory/name).read_bytes()).hexdigest(),
                    provenance=provenance, direction=data['options']['direction'], step=data['step'],
                    exact=metrics(g, state, exact, exact, a),
                    initial=metrics(g, state, previous, exact, a), stationary=[], pcg=[])
        if recorded is not None:
            case['capturedExactMaxDifference'] = float(np.max(abs(exact-recorded)))
            assert case['capturedExactMaxDifference'] < 1e-8
        if draw_mode:
            case['drawNeutral'] = draw_neutral(g,p,factor,state,previous,rhs,exact)
            cases.append(case)
            continue
        x = previous.copy()
        old = case['initial']['energy']
        for iteration in range(1, 5):
            x += precondition(rhs-a@x)
            row = metrics(g, state, x, exact, a)
            row.update(iteration=iteration, energyFactor=row['energy']/old,
                       fe=pass_budget(g, p, sweeps, iteration)['stationaryTotal'])
            case['stationary'].append(row); old = row['energy']
        x = previous.copy(); r = rhs-a@x; z = precondition(r); direction = z.copy(); rz = r@z
        lanczos_z, alphas, betas, rz_values = [], [], [], []
        for iteration in range(1, pcg_steps + 1):
            lanczos_z.append(z.copy()); rz_values.append(float(rz))
            ad = a@direction; denominator = direction@ad
            alpha = rz/denominator if denominator > np.finfo(float).tiny else 0
            alphas.append(float(alpha))
            x += alpha*direction; r -= alpha*ad
            row = metrics(g, state, x, exact, a)
            row.update(iteration=iteration, fe=pass_budget(g, p, sweeps, iteration)['total'])
            case['pcg'].append(row)
            z = precondition(r); next_rz = r@z
            beta = next_rz/rz if rz > np.finfo(float).tiny else 0
            betas.append(float(beta))
            direction = z + beta*direction
            rz = next_rz
        case['ritz'] = ritz_location(g, lanczos_z, alphas, betas, rz_values, precondition)
        case['energyVersusSpread'] = [dict(iteration=row['iteration'],
            energyRatio=row['energy']/case['initial']['energy'],
            spreadRatio=row['spread']/case['initial']['spread']) for row in case['pcg']]
        cases.append(case)
    report = dict(smallCheck=small, geometry={k:g[k] for k in ['width','height','n','plenum','valve_width']},
                  interpolation=stats, checks=checks, sweeps=sweeps, omega=omega,
                  budget3=pass_budget(g,p,sweeps,3), budget4=pass_budget(g,p,sweeps,4), cases=cases,
                  wallSeconds=time.monotonic()-start, loadStart=load_start,
                  load=subprocess.check_output(['uptime'], text=True).strip(),
                  threadLimits={k:os.environ.get(k) for k in ['OPENBLAS_NUM_THREADS','VECLIB_MAXIMUM_THREADS','OMP_NUM_THREADS']})
    report['gate'] = all(any(row['spread'] <= .002 and row['fe'] <= 64 for row in c['pcg'] if row['iteration'] in [3,4]) for c in cases)
    if draw_mode:
        max_column = stats['maxColumnNnz']
        report['drawNeutral'] = dict(
            pressureDrawBudget=64, commonDivergenceAndGradientExcluded=True,
            warmStart='W saved previous-step pressure; F/R saved current pressure with reconstructed tentative',
            restriction=[dict(draws=7, gathersPerPixel=[4]*7),
                         dict(draws=2, gathersPerPixel=[64,(max_column+63)//64]),
                         dict(draws=1, gathersPerPixel=[max_column])],
            qualifies=any(row['qualifies'] for row in cases[0]['drawNeutral']))
    if pcg_steps == 7 and not draw_mode:
        report['amendmentApcg'] = dict(
            gate1=any(row['spread'] <= .005 and row['fe'] <= 128 for row in cases[0]['pcg'] if row['iteration'] in [5,6,7]),
            budgets={str(i):pass_budget(g,p,sweeps,i) for i in [5,6,7]})
        for budget in report['amendmentApcg']['budgets'].values():
            budget['estimatedFrameGpuMs'] = 12.7-64*4*.040+budget['draws']['total']*4*.040
            budget['gate2'] = budget['estimatedFrameGpuMs'] <= 16
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
