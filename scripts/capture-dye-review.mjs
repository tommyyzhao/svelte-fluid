// Owner evidence only: reuse E2 wall-time capture, never invoke the spatial-blind judge.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { withCapture } from './quality-eval.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dev-docs/benchmarks/owner-review/dye-resolution');
const presets = ['Plasma', 'LavaLamp', 'Aurora', 'InkInWater', 'CircularFluid', 'Karman'];
const times = [2, 5, 10, 20],
	tile = 400;
const labels = ['owner-dye-1024', 'owner-dye-512'];
const scenes = presets.map((preset) => ({
	preset,
	w: 1440,
	h: 900,
	dpr: 2,
	seed: 5
}));
const location = (label, preset) => `/tmp/quality-eval/${label}/${preset}-1440x900-dpr2-seed5`;
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

function anchor(image) {
	// Reference-only gradient selection avoids picking whichever variant looks better.
	let best = -1,
		position = [0, 0];
	for (let y = 0; y <= image.height - tile; y += tile / 2)
		for (let x = 0; x <= image.width - tile; x += tile / 2) {
			let score = 0;
			for (let j = y; j < y + tile - 2; j += 8)
				for (let i = x; i < x + tile - 2; i += 8) {
					const p = (j * image.width + i) * 4;
					for (let c = 0; c < 3; c++) score += Math.abs(image.data[p + c] - image.data[p + 8 + c]);
				}
			if (score > best) {
				best = score;
				position = [x, y];
			}
		}
	return position;
}

if (process.argv.includes('--self-check')) {
	const image = new PNG({ width: 800, height: 400 });
	image.data.fill(0);
	for (let y = 0; y < 400; y++)
		for (let x = 400; x < 800; x++) image.data[(y * 800 + x) * 4] = x % 4 < 2 ? 255 : 0;
	assert.deepEqual(anchor(image), [400, 0]);
	console.log('Dye review self-check passed: reference-gradient crop selection');
	process.exit(0);
}
if (!process.argv.includes('--compose-only')) {
	process.env.QUALITY_EVAL_LANE = 'dye-review';
	await withCapture(
		[],
		'',
		{},
		'',
		root,
		labels.flatMap((label, side) =>
			scenes.map((scene) => ({
				scene,
				label,
				degradation: '',
				override: side ? { dyeResolution: 512 } : {}
			}))
		)
	);
}
await mkdir(output, { recursive: true });
// Offline 2D compositing needs no GPU lease; explicitly disable GPU in this separate browser.
const browser = await chromium.launch({
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true,
	args: ['--disable-gpu'],
	ignoreDefaultArgs: ['--enable-unsafe-swiftshader']
});
const records = [];
try {
	const page = await browser.newPage();
	for (const preset of presets) {
		const metadata = await Promise.all(
			labels.map((label) => json(join(location(label, preset), 'capture.json')))
		);
		for (const [i, meta] of metadata.entries()) {
			assert.deepEqual(
				meta.scene,
				scenes.find((s) => s.preset === preset)
			);
			assert.deepEqual(meta.backing, [2880, 1800]);
			assert.equal(meta.cfg.dyeResolution, i ? 512 : 1024);
			assert.ok(/ANGLE.*Metal.*Apple M1 Max/.test(meta.renderer), meta.renderer);
			assert.ok(meta.stats.every((s) => Math.abs(s.actualWall - s.wall) <= 0.25));
		}
		assert.equal(metadata[0].sourceSha, metadata[1].sourceSha);
		const images = await Promise.all(
			labels.map(async (label) =>
				Promise.all(
					times.map(async (t) =>
						(await readFile(join(location(label, preset), `${t}s.png`))).toString('base64')
					)
				)
			)
		);
		const anchors = images[0].map((image) => anchor(PNG.sync.read(Buffer.from(image, 'base64'))));
		const jpeg = await page.evaluate(
			async ({ images, anchors, times, tile, preset }) => {
				const gap = 16,
					panel = tile * 4,
					frameHeight = (tile * 900) / 1440;
				const canvas = document.createElement('canvas');
				canvas.width = panel * 2 + gap;
				canvas.height = 100 + frameHeight + tile;
				const ctx = canvas.getContext('2d');
				ctx.fillStyle = '#141414';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.fillStyle = '#ffffff';
				ctx.font = 'bold 24px sans-serif';
				for (let side = 0; side < 2; side++) {
					const offset = side * (panel + gap);
					ctx.fillText(
						`${preset} — dyeResolution ${side ? 512 : 1024}${side ? '' : ' (default)'}`,
						offset + 12,
						30
					);
					for (let i = 0; i < times.length; i++) {
						const img = new Image();
						img.src = `data:image/png;base64,${images[side][i]}`;
						await img.decode();
						const x = offset + tile * i;
						ctx.font = '20px sans-serif';
						ctx.fillStyle = '#ffffff';
						ctx.fillText(`${times[i]} s`, x + 12, 58);
						ctx.drawImage(img, x, 70, tile, frameHeight);
						ctx.strokeStyle = '#ffffff';
						ctx.lineWidth = 1;
						ctx.strokeRect(
							x + (anchors[i][0] * tile) / img.width,
							70 + (anchors[i][1] * frameHeight) / img.height,
							(tile * tile) / img.width,
							(tile * frameHeight) / img.height
						);
						ctx.fillText(`1:1 crop (${anchors[i].join(', ')})`, x + 12, 94 + frameHeight);
						ctx.drawImage(img, ...anchors[i], tile, tile, x, 100 + frameHeight, tile, tile);
					}
				}
				return canvas.toDataURL('image/jpeg', 0.90).split(',')[1];
			},
			{ images, anchors, times, tile, preset }
		);
		const file = join(output, `${preset}.jpg`);
		await writeFile(file, Buffer.from(jpeg, 'base64'));
		records.push({
			preset,
			file: `${preset}.jpg`,
			bytes: (await stat(file)).size,
			anchors,
			captures: metadata
		});
	}
} finally {
	await browser.close();
}
await writeFile(
	join(output, 'manifest.json'),
	JSON.stringify(
		{
			protocol: 'Owner review; no E2 verdict',
			tile,
			times,
			labels,
			jpegQuality: 0.90,
			records
		},
		null,
		2
	) + '\n'
);
const bytes = (
	await Promise.all(
		(await readdir(output)).map(async (file) => (await stat(join(output, file))).size)
	)
).reduce((a, b) => a + b, 0);
assert.ok(bytes < 3000000, `Packet exceeds 3 MB: ${bytes}`);
console.log(
	JSON.stringify(
		{
			output,
			bytes,
			files: records.map(({ file, bytes }) => ({ file, bytes }))
		},
		null,
		2
	)
);
