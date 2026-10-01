// Asserts private R&D routes are absent from the static build. Run after `bun run build`.
import { existsSync, readFileSync } from 'node:fs';

const fail = [];
for (const p of ['build/lab', 'build/examples/webgpu']) if (existsSync(p)) fail.push(`${p} exists`);
for (const f of ['sitemap.xml', 'llms.txt', 'llms-full.txt', 'index.html', 'examples.html']) {
	const p = `build/${f}`;
	if (existsSync(p) && /\/lab\/|examples\/webgpu/.test(readFileSync(p, 'utf8'))) fail.push(`${p} links R&D route`);
}
if (fail.length) {
	console.error(fail.join('\n'));
	process.exit(1);
}
console.log('Build output: R&D routes excluded.');
