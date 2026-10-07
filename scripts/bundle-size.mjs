import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Run after bun run prepack; measure emitted modules, not a consumer's tree-shaken bundle.
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
function files(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? files(path) : [path];
	});
}
const paths = files(dist);
const js = paths.filter((path) => path.endsWith('.js'));
assert(js.includes(resolve(dist, 'index.js')), 'Run bun run prepack first');
const scratch = mkdtempSync(join(tmpdir(), 'svelte-fluid-pack-'));
try {
	const tarball = join(scratch, 'package.tgz');
	execFileSync('bun', ['pm', 'pack', '--ignore-scripts', '--filename', tarball], {
		cwd: root,
		stdio: 'pipe'
	});
	console.log(JSON.stringify({
		sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
		tarballBytes: statSync(tarball).size,
		distBytes: paths.reduce((sum, path) => sum + statSync(path).size, 0),
		jsFiles: js.length,
		jsGzipBytes: js.reduce((sum, path) => sum + gzipSync(readFileSync(path)).length, 0),
		indexGzipBytes: gzipSync(readFileSync(join(dist, 'index.js'))).length
	}, null, 2));
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
