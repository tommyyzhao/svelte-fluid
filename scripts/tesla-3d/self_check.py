"""CPU-only synthetic checks. Optional --pilot reads immutable evidence, never stages it."""
import argparse
import contextlib
import io
import importlib.util
import json
import sys
from pathlib import Path
import tempfile

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('preflight', Path(__file__).with_name('preflight.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def rejects(call):
	try:
		call()
	except (ValueError, FileExistsError):
		return
	raise AssertionError('Expected refusal')


def check():
	assert abs(p.head(1, .1, 0, .0225)-.10675) < 1e-12
	assert abs(p.head(-1, -.1, 0, -.0225)-.10675) < 1e-12
	assert p.head(1, 0, 0, 1) == p.head(-1, 0, 0, -1) == .3
	rejects(lambda: p.head(0, 0, 0, 1))
	rejects(lambda: p.head(1, float('nan'), 0, 1))
	assert p.deadline(100, 100, 'mesh') == 7200
	assert p.deadline(100, 7300, 'mesh') == 0
	assert p.deadline(100, 43301, 'physics') == -1
	p.mesh_gate('Mesh OK.\nNumber of regions: 1 (OK).\nMin volume = 1e-12.')
	rejects(lambda: p.mesh_gate('Mesh OK.\nNumber of regions: 2\nMin volume = 1e-12.'))
	rejects(lambda: p.mesh_gate('Failed 1 mesh checks.'))
	assert abs(p.area(p.clip(p.clip([(-1, 0), (1, 0), (1, 1), (-1, 1)], 0, True), .3, False))-.3) < 1e-12
	with tempfile.TemporaryDirectory(prefix='tesla-3d-self-check-') as tmp:
		root = Path(tmp)
		case = root / 'input'
		for directory in ['0', 'constant', 'system']:
			(case / directory).mkdir(parents=True)
			(case / directory / 'original').write_text('immutable\n')
		hashes = p.snapshot(case, root / 'copy')
		assert len(hashes) == 3
		assert (case / '0/original').read_text() == 'immutable\n'
		rejects(lambda: p.snapshot(case, root / 'copy'))
		(case / '0/link').symlink_to(case / '0/original')
		rejects(lambda: p.snapshot(case, root / 'other'))
		(root / 'samples.json').write_text(json.dumps([dict(section_q_m3_s=[-1]*5, p0=-.1, pL=0, acceleration_x=-.0225)]*16))
		capture = io.StringIO()
		with contextlib.redirect_stdout(capture):
			p.analyze(argparse.Namespace(samples=root / 'samples.json', block=8))
		result = json.loads(capture.getvalue())
		assert result['samples'] == 16 and len(result['block_means']) == 2
		assert all(abs(v-.10675) < 1e-12 for v in result['block_means'])
		print(capture.getvalue().strip())
	print('synthetic pressure/sign/budget/mesh-gate/clipping/immutable-copy/block checks PASS')


if __name__ == '__main__':
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('--pilot', type=Path)
	args = parser.parse_args()
	check()
	if args.pilot:
		info = p.diagnose(args.pilot / 'extruded3d')
		assert info['cells'] == 245756
		assert all(n == 8 for n in info['target_faces'].values())
		assert sorted(p.labels(args.pilot / 'extruded3d/constant/polyMesh/sets/concaveCells')) == p.TARGETS
		print(json.dumps(info))
		try:
			print(json.dumps(p.paired_source(args.pilot / 'coarse-base')))
		except ValueError as error:
			print('attempt2 source compatibility REFUSED:', error)
