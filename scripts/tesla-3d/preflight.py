"""Bounded preparation; uv run --offline --no-project python -I preflight.py --help.
Run ONLY inside a lead-provisioned Linux container. No runtime provisioning/cleanup.
"""
import argparse
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time

TARGETS = [73944, 73967, 147936, 147959]
GIB = 1024**3
T = 13.483146
BASHRC = '/usr/lib/openfoam/openfoam2512/etc/bashrc'
IMAGE = 'sha256:33fb575aa9980d2bc42fd58c75ae698c489293ba30c991380fe3f899c622f319'


def require(ok, message):
	if not ok:
		raise ValueError(message)


def save(path, value):
	tmp = path.with_suffix(path.suffix + '.tmp')
	tmp.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
	tmp.replace(path)


def foam(path):
	text = path.read_text()
	require(re.search(r'format\s+ascii\s*;', text), f'ASCII required: {path}')
	text = re.sub(r'/\*.*?\*/|//[^\n]*', '', text, flags=re.S)
	text = re.sub(r'FoamFile\s*\{[^}]*\}', '', text)
	match = re.search(r'^\s*(\d+)\s*\((.*)\)\s*$', text, re.S)
	require(match is not None, f'Unsupported list: {path}')
	return int(match[1]), match[2]


def labels(path):
	n, text = foam(path)
	values = list(map(int, text.split()))
	require(len(values) == n, f'Label count: {path}')
	return values


def mesh(case):
	root = case / 'constant/polyMesh'
	n, text = foam(root / 'points')
	points = [tuple(map(float, row.split())) for row in re.findall(r'\(([^()]*)\)', text)]
	require(len(points) == n and all(len(p) == 3 and all(map(math.isfinite, p)) for p in points), 'Invalid points')
	n, text = foam(root / 'faces')
	faces = []
	for count, row in re.findall(r'(\d+)\s*\(([^()]*)\)', text):
		face = list(map(int, row.split()))
		require(len(face) == int(count) and all(0 <= i < len(points) for i in face), 'Invalid face')
		faces.append(face)
	require(len(faces) == n, 'Face count mismatch')
	owner, neighbour = labels(root / 'owner'), labels(root / 'neighbour')
	require(len(owner) == len(faces) and len(neighbour) <= len(owner), 'Addressing mismatch')
	boundary = (root / 'boundary').read_text()
	patches = {}
	for name, body in re.findall(r'([\w]+)\s*\{([^{}]*)\}', boundary):
		start, count = re.search(r'startFace\s+(\d+)', body), re.search(r'nFaces\s+(\d+)', body)
		if start and count:
			patches[name] = (int(start[1]), int(count[1]))
	require('front' in patches and 'back' in patches, 'Missing front/back patches')
	return points, faces, owner, neighbour, patches


def clip(poly, x, lower):
	out = []
	for a, b in zip(poly, poly[1:] + poly[:1]):
		inside_a = a[0] >= x if lower else a[0] <= x
		inside_b = b[0] >= x if lower else b[0] <= x
		if inside_a:
			out.append(a)
		if inside_a != inside_b:
			fraction = (x - a[0]) / (b[0] - a[0])
			out.append((x, a[1] + fraction * (b[1] - a[1])))
	return out


def area(poly):
	return abs(sum(a[0]*b[1] - b[0]*a[1] for a, b in zip(poly, poly[1:] + poly[:1]))) / 2


def diagnose(case):
	points, faces, owner, neighbour, patches = mesh(case)
	start, count = patches['front']
	valve_area = sum(area(clip(clip([points[i][:2] for i in f], 0, True), .3, False)) for f in faces[start:start+count])
	counts = {}
	for cell in owner + neighbour:
		counts[cell] = counts.get(cell, 0) + 1
	return dict(cells=max(owner + neighbour)+1, valve_area_m2=valve_area,
		patches=sorted(patches), target_faces={str(i): counts.get(i) for i in TARGETS})


def paired_source(case):
	points, faces, owner, neighbour, patches = mesh(case)
	levels = sorted({p[2] for p in points})
	require(len(levels) == 2, 'Source is not exactly two planar z levels; no coordinate correction permitted')
	layers = [{p[:2] for p in points if p[2] == z} for z in levels]
	pairs = {tuple(sorted((a, b))) for face in faces for a, b in zip(face, face[1:]+face[:1]) if points[a][2] != points[b][2]}
	mismatches = [math.hypot(points[a][0]-points[b][0], points[a][1]-points[b][1]) for a, b in pairs
		if points[a][:2] != points[b][:2]]
	require(layers[0] == layers[1] and len(points) == 2*len(layers[0]) and not mismatches,
		f'Source x-y pairing is not exact: {len(mismatches)}/{len(pairs)} cross-layer edges differ, '
		f'max_xy_m={max(mismatches, default=0):.17g}; incompatible geometry, no averaging/nudging permitted')
	for name, z in [('front', levels[0]), ('back', levels[1])]:
		start, count = patches[name]
		require(all(points[i][2] == z for f in faces[start:start+count] for i in f), 'Unexpected source patch orientation')
	return dict(point_pairs=len(layers[0]), depth=levels[1]-levels[0])


def argsafe_tree(root):
	for path in root.rglob('*'):
		require(not path.is_symlink(), f'Symlink in owned output: {path}')
		if path.is_file():
			yield path


def snapshot(source, dest):
	require(source.is_dir(), f'Missing input: {source}')
	files = []
	for folder in ['0', 'constant', 'system']:
		root = source / folder
		require(root.is_dir() and not root.is_symlink(), f'Missing/plain directory required: {root}')
		for path in sorted(root.rglob('*')):
			require(not path.is_symlink() and (path.is_file() or path.is_dir()), f'Non-regular input: {path}')
			if path.is_file():
				files.append(path)
	require(sum(p.stat().st_size for p in files) < 8*GIB, 'Input exceeds 8 GiB staging cap')
	dest.mkdir()
	hashes = {}
	for path in files:
		rel = path.relative_to(source)
		out = dest / rel
		out.parent.mkdir(parents=True, exist_ok=True)
		shutil.copyfile(path, out)
		hashes[str(rel)] = hashlib.sha256(out.read_bytes()).hexdigest()
		out.chmod(0o444)
	return hashes


def stage(args):
	source, output = args.input.resolve(), args.output.resolve()
	require(not output.exists() and not output.is_relative_to(source) and not source.is_relative_to(output), 'Output must be fresh, disjoint from input')
	output.mkdir(parents=True, exist_ok=False)
	info = dict(status='staging', attempt=args.attempt, source=str(source), image_digest=IMAGE,
		transform='native splitCells 181; no coordinate edits; original quality thresholds',
		script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
	try:
		info['input_sha256'] = snapshot(source, output / 'input')
		info['before'] = diagnose(output / 'input')
		shutil.copytree(output / 'input', output / 'case')
		for path in (output / 'case').rglob('*'):
			if path.is_file():
				path.chmod(0o644)
		geometry = json.loads(args.geometry.read_text())
		info['geometry_sha256'] = hashlib.sha256(args.geometry.read_bytes()).hexdigest()
		info['reference_valve_area_m2'] = float(geometry['area_cm2'])*1e-4
		require(math.isfinite(info['reference_valve_area_m2']) and info['reference_valve_area_m2'] > 0, 'Invalid reference area')
		require(abs(info['before']['valve_area_m2']/info['reference_valve_area_m2'] - 1) < .001, 'Initial valve area error >=0.1%')
		case = output / 'case'
		if args.attempt == 1:
			require(info['before']['cells'] == 245756, 'Expected exact 245756-cell pilot')
			require(sorted(labels(case / 'constant/polyMesh/sets/concaveCells')) == TARGETS, 'Unexpected concave-cell IDs')
			require(all(n == 8 for n in info['before']['target_faces'].values()), 'Expected four eight-face cells')
			info['commands'] = [['splitCells', '-overwrite', '-set', 'concaveCells', '181']]
		else:
			info['source_pairing'] = paired_source(case)
			require(0 < info['before']['cells'] < 20000, 'Expected coarse one-layer source')
			require(labels(case / 'constant/polyMesh/sets/concaveCells'), 'Source has no diagnosed concave cells')
			shutil.copytree(case, output / 'source')
			(case / 'system/extrudeMeshDict').write_text('''FoamFile { version 2.0; format ascii; class dictionary; object extrudeMeshDict; }
constructFrom patch;
sourceCase "../source";
sourcePatches (front);
exposedPatchName back;
flipNormals true;
extrudeModel linearDirection;
nLayers 24;
expansionRatio 1;
linearDirectionCoeffs { direction (0 0 1); thickness .019; }
mergeFaces false;
mergeTol 0;
''')
			info['commands'] = [['splitCells', '-overwrite', '-set', 'concaveCells', '181'], ['extrudeMesh']]
		info['status'] = 'staged-not-verified'
	except BaseException as error:
		info.update(status='refused', error=str(error))
		raise
	finally:
		save(output / 'stage.json', info)
	print(json.dumps(dict(output=str(output), status=info['status'])))


def mesh_gate(text):
	require('Mesh OK.' in text and not re.search(r'Failed\s+\d+\s+mesh checks|FOAM FATAL|\*\*\*', text), 'checkMesh did not fully pass')
	require(re.search(r'Number of regions:\s+1\b', text), 'Expected one connected fluid region')
	match = re.search(r'Min volume\s*=\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)', text)
	require(match and math.isfinite(float(match[1])) and float(match[1]) > 0, 'Positive cell volumes not verified')


def deadline(start, now, phase):
	return min(start + 43200, start + 7200 if phase == 'mesh' else start + 43200) - now


def host(path, starting=False):
	data = json.loads(path.read_text())
	values = {k: float(data[k]) for k in ['epoch', 'free_memory_fraction', 'load1', 'disk_free_bytes']}
	require(all(map(math.isfinite, values.values())) and 0 <= time.time()-values['epoch'] <= 30, 'Missing/stale host telemetry')
	require((.20 if starting else .15) <= values['free_memory_fraction'] <= 1, 'Host memory gate')
	require(0 <= values['load1'] <= 20 and values['disk_free_bytes'] >= 15*GIB, 'Host load/disk gate')
	return values


def resources():
	root = Path('/sys/fs/cgroup')
	try:
		memory = int((root / 'memory.max').read_text())
		quota, period = map(int, (root / 'cpu.max').read_text().split())
	except (OSError, ValueError) as error:
		raise ValueError('Missing/unlimited cgroup v2 CPU/memory quotas; verified host-limit receipt adapter required, no fallback') from error
	require(period > 0 and 0 < memory <= 4*GIB and 0 < quota/period <= 2, 'Lead must provision <=2 CPUs / <=4 GiB cgroup v2')
	return root


def execute(command, case, log, output, budget, phase, telemetry, cg):
	env = dict(os.environ, OMP_NUM_THREADS='1', OPENBLAS_NUM_THREADS='1')
	argv = ['bash', '-c', '. "$1" || exit; shift; [ "$WM_PROJECT_VERSION" = v2512 ] || exit 2; exec "$@"', 'tesla-3d', BASHRC, *command, '-case', str(case)]
	last_disk_check = 0
	start_usage = dict(line.split() for line in (cg / 'cpu.stat').read_text().splitlines())
	cpu_start = int(start_usage['usage_usec'])
	with log.open('x') as stream:
		process = subprocess.Popen(argv, stdout=stream, stderr=subprocess.STDOUT, env=env, start_new_session=True)
		state = dict(status='running', pid=process.pid, process_group=process.pid, command=command, case=str(case), start_epoch=time.time())
		save(output / 'status.json', state)
		try:
			while process.poll() is None:
				require(deadline(budget['start_epoch'], time.time(), phase) > 0, 'Deadline exhausted')
				host(telemetry)
				used = int((cg / 'memory.current').read_text())
				require(used < 3.5*GIB, 'Guest memory >=3.5 GiB')
				state['peak_guest_bytes'] = max(used, state.get('peak_guest_bytes', 0))
				usage = dict(line.split() for line in (cg / 'cpu.stat').read_text().splitlines())
				state['owned_cgroup_cpu_s'] = (int(usage['usage_usec'])-cpu_start)/1e6
				if time.time()-last_disk_check >= 15:
					disk = sum(p.stat().st_size for p in argsafe_tree(output.parent))
					require(disk < 24*GIB and shutil.disk_usage(output).free >= 15*GIB, 'Investigation disk/free-space gate')
					state['peak_disk_bytes'] = max(disk, state.get('peak_disk_bytes', 0))
					last_disk_check = time.time()
				state['elapsed_s'] = time.time()-budget['start_epoch']
				state['conservative_core_hours'] = 2*state['elapsed_s']/3600
				save(output / 'status.json', state)
				time.sleep(2)
			process.wait()
			require(process.returncode == 0, f'Command failed: {command[0]} exit {process.returncode}')
		except BaseException:
			if process.poll() is None:
				# Exact owned group only; retain all files. Existing 0.25T checkpoints survive.
				os.killpg(process.pid, signal.SIGTERM)
				try:
					process.wait(timeout=20)
				except subprocess.TimeoutExpired:
					state.update(status='term-timeout-owned-process-remains', process_reaped=False,
						manual_action='Lead supervisor must stop exact owned PID/group; no forced cleanup here')
					save(output / 'status.json', state)
					raise RuntimeError(f'Owned process group {process.pid} remains after TERM; lead intervention required')
			raise


def run(args):
	require(sys.platform == 'linux', 'Runtime only inside Linux; no provisioning here')
	output = args.output.resolve()
	info = json.loads((output / 'stage.json').read_text())
	require(info['status'] == 'staged-not-verified', 'Stage incompatible/incomplete')
	require(not (output / 'receipt.json').exists(), 'Attempt already executed; preserve it')
	require(args.budget.resolve() == output.parent / 'budget.json', 'Use one dedicated investigation parent and its budget.json')
	cg = resources()
	host(args.host_telemetry, starting=True)
	require(Path(BASHRC).is_file(), 'OpenFOAM 2512 bashrc missing')
	# A single shared, locked ledger spans attempts; an existing ledger is never reset.
	with args.budget.open('a+') as ledger:
		fcntl.flock(ledger, fcntl.LOCK_EX | fcntl.LOCK_NB)
		ledger.seek(0)
		text = ledger.read()
		budget = json.loads(text) if text else dict(start_epoch=time.time(), attempts=[])
		require(info['attempt'] == len(budget['attempts']) + 1 <= 2, 'Attempts must be explicit 1 then 2; maximum two')
		require(deadline(budget['start_epoch'], time.time(), 'mesh') > 0, 'Geometry budget exhausted')
		budget['attempts'].append(str(output))
		ledger.seek(0)
		json.dump(budget, ledger)
		ledger.truncate()
		ledger.flush()
		os.fsync(ledger.fileno())
		receipt = dict(status='partial', start_epoch=time.time(), deadline_epoch=budget['start_epoch']+7200,
			investigation_deadline_epoch=budget['start_epoch']+43200, limits=dict(cpus=2, memory_bytes=4*GIB, disk_bytes=24*GIB),
			image_digest_expected=IMAGE, attempt=info['attempt'], cleanup='none; all files retained',
			checkMesh='-allTopology -allGeometry; native defaults; no meshQualityDict overrides',
			physics='not run; no acceptance claim; split/extrusion invalidates copied 0 fields; remap/recreate before any solver', commands=[])
		try:
			for i, command in enumerate(info['commands']):
				case = output / ('source' if info['attempt'] == 2 and i == 0 else 'case')
				receipt['commands'].append(command)
				execute(command, case, output / f'log.{i}.{command[0]}', output, budget, 'mesh', args.host_telemetry, cg)
			command = ['checkMesh', '-allTopology', '-allGeometry']
			execute(command, output / 'case', output / 'log.checkMesh', output, budget, 'mesh', args.host_telemetry, cg)
			mesh_gate((output / 'log.checkMesh').read_text())
			after = diagnose(output / 'case')
			require(after['patches'] == info['before']['patches'], 'Boundary connectivity changed')
			require(abs(after['valve_area_m2']/info['reference_valve_area_m2']-1) < .001, 'Final valve area error >=0.1%')
			receipt.update(status='mesh-passed-awaiting-lead', after=after)
		except BaseException as error:
			receipt['error'] = str(error)
			raise
		finally:
			receipt['end_epoch'] = time.time()
			receipt['elapsed_investigation_s'] = time.time()-budget['start_epoch']
			if (output / 'status.json').exists():
				state = json.loads((output / 'status.json').read_text())
				receipt['last_command_metrics'] = state
				if state.get('process_reaped') is not False:
					state['status'] = receipt['status']
					state['process_reaped'] = True
				save(output / 'status.json', state)
			save(output / 'receipt.json', receipt)
			print(json.dumps(receipt))


def analyze(args):
	# Explicit JSON samples: areaMean pressures, signed section fluxes, fixed signed acceleration.
	rows = json.loads(args.samples.read_text())
	heads = []
	for row in rows:
		q = list(map(float, row['section_q_m3_s']))
		values = [*q, float(row['p0']), float(row['pL']), float(row['acceleration_x'])]
		require(len(q) == 5 and all(map(math.isfinite, values)), 'Five finite signed section fluxes required')
		mean = sum(q)/5
		require(mean != 0 and all(v*mean > 0 for v in q), 'Mixed/zero flow signs')
		require((max(q)-min(q))/abs(mean) <= .001, 'Section imbalance >0.1%')
		heads.append(head(mean, values[-3], values[-2], values[-1]))
	require(heads, 'No samples')
	blocks = [sum(heads[i:i+args.block])/len(heads[i:i+args.block]) for i in range(0, len(heads)-args.block+1, args.block)]
	print(json.dumps(dict(samples=len(heads), mean_head=sum(heads)/len(heads), block_means=blocks,
		inference='screening only; no confidence interval, stationarity, matched-flow or reproduction claim')))


def head(q, p0, pL, acceleration):
	require(all(map(math.isfinite, [q, p0, pL, acceleration])) and q != 0, 'Finite nonzero flow required')
	return math.copysign(1, q) * (p0-pL+acceleration*.3)


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	sub = parser.add_subparsers(dest='action', required=True)
	p = sub.add_parser('stage', help='Copy immutable inputs; diagnose; prepare one explicit attempt; NEVER execute OpenFOAM')
	p.add_argument('--input', type=Path, required=True)
	p.add_argument('--geometry', type=Path, required=True, help='Frozen crosscode/geometry.json containing area_cm2')
	p.add_argument('--output', type=Path, required=True)
	p.add_argument('--attempt', type=int, choices=[1, 2], required=True)
	p.set_defaults(func=stage)
	p = sub.add_parser('run', help='Linux-only single mesh attempt; no solver, no automatic next attempt')
	p.add_argument('--output', type=Path, required=True)
	p.add_argument('--budget', type=Path, required=True, help='Shared local ledger for BOTH attempts')
	p.add_argument('--host-telemetry', type=Path, required=True, help='Lead-updated <=30s-old JSON; epoch/free_memory_fraction/load1/disk_free_bytes')
	p.set_defaults(func=run)
	p = sub.add_parser('analyze', help='Read-only explicit areaMean pressure / signed flux JSON')
	p.add_argument('samples', type=Path)
	p.add_argument('--block', type=int, default=8)
	p.set_defaults(func=analyze)
	args = parser.parse_args()
	if hasattr(args, 'block'):
		require(args.block > 0, 'Positive block size required')
	args.func(args)


if __name__ == '__main__':
	main()
