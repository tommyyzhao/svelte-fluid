// ADR 0112. Hardware capture only under the owned shared lock.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { restProof } from '../src/routes/lab/image-convergence/metrics.ts';
const ROOT = resolve(import.meta.dirname, '..'),
	SCRATCH = '/tmp/e5-spike',
	LOCK = '/tmp/svelte-fluid-gpu.lock';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IMAGES = [
	'the-kiss.jpg',
	'earth.jpg',
	'fluid-text.png',
	'great-wave.jpg',
	'pearl-earring.jpg',
	'starry-night.jpg',
	'water-lilies.jpg',
	'mona-lisa.jpg',
	'flat.png',
	'birth-of-venus.png',
];
const owner = { lane: 'e5-spike', pid: process.pid, worktree: ROOT };
let owned = false,
	browser,
	server;
const variant = process.argv[2] === '2s' ? '2s' : Number(process.argv[2] ?? 0),
	split = process.argv[3] ?? 'train';
assert(
	[0, 1, 2, '2s'].includes(variant) &&
		['train', 'held-out', 'probe', 'probe-fix', 'diagnostic'].includes(split)
);
const batch = process.argv[4] ?? '';
assert(['', 'A', 'B'].includes(batch), 'Unknown batch');
const path = join(
	SCRATCH,
	`v${variant}-${split}${batch ? `-${batch}` : ''}.json`
);
let rows = [];
try {
	rows = JSON.parse(await readFile(path, 'utf8'));
} catch (e) {
	if (e.code !== 'ENOENT') throw e;
}
async function cleanup() {
	await browser?.close();
	browser = undefined;
	if (server) {
		const p = server;
		server = undefined;
		p.kill('SIGTERM');
		await Promise.race([new Promise((r) => p.once('close', r)), sleep(3000)]);
	}
	if (owned) {
		const o = JSON.parse(await readFile(join(LOCK, 'owner'), 'utf8'));
		assert(
			o.pid === owner.pid && o.lane === owner.lane && o.worktree === ROOT,
			'Unowned lock'
		);
		await rm(LOCK, { recursive: true });
		owned = false;
		await writeFile(
			join(SCRATCH, 'lock-state.json'),
			JSON.stringify({ releasedAt: Date.now(), worktree: ROOT })
		);
	}
}
for (const signal of ['SIGTERM', 'SIGINT'])
	process.once(signal, async () => {
		await cleanup();
		process.exit(2);
	});
await mkdir(SCRATCH, { recursive: true });
const localState = join(SCRATCH, 'lock-state.json');
let lastRelease = 0,
	observedOther = false,
	freeSince = 0;
try {
	lastRelease = JSON.parse(await readFile(localState, 'utf8')).releasedAt;
} catch (e) {
	if (e.code !== 'ENOENT') throw e;
}
while (!owned) {
	try {
		const other = JSON.parse(await readFile(join(LOCK, 'owner'), 'utf8'));
		if (
			other.lane !== 'e5-spike' &&
			(!process.env.E5_WAIT_FOR_LANE ||
				other.lane === process.env.E5_WAIT_FOR_LANE)
		)
			observedOther = true;
		freeSince = 0;
	} catch (e) {
		if (e.code !== 'ENOENT') throw e;
		if (!freeSince) freeSince = Date.now();
		if (
			(!lastRelease && !process.env.E5_WAIT_FOR_LANE) ||
			observedOther ||
			process.env.E5_GRANTED_TURN === '1' ||
			(!process.env.E5_WAIT_FOR_LANE && Date.now() - freeSince >= 1800000)
		) {
			try {
				await mkdir(LOCK);
				owned = true;
			} catch (e) {
				if (e.code !== 'EEXIST') throw e;
			}
		}
	}
	if (!owned) {
		console.log('E5 waiting for shared GPU lock / alternation');
		await sleep(60000);
	}
}
await writeFile(join(LOCK, 'owner'), JSON.stringify(owner));
await writeFile(
	join(LOCK, 'acquired-at'),
	String(Math.floor(Date.now() / 1000))
);
const acquiredAt = Date.now();
const timer = setTimeout(async () => {
	await cleanup();
	process.exit(2);
}, 700000);
try {
	server = spawn(
		'bun',
		['run', 'dev', '--host', '127.0.0.1', '--port', '5210', '--strictPort'],
		{ cwd: ROOT, stdio: 'ignore' }
	);
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch('http://127.0.0.1:5210/lab/image-convergence')).ok)
				break;
		} catch {}
		await sleep(200);
	}
	browser = await chromium.launch({
		executablePath:
			'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		headless: true,
		ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
		args: ['--disable-software-rasterizer'],
	});
	const slots =
		split === 'diagnostic'
			? [
					{
						image: variant === 2 ? 'the-kiss.jpg' : 'pearl-earring.jpg',
						seed: 23,
						phase: 'diagnostic',
					},
			  ]
			: (split.startsWith('probe')
					? IMAGES.slice(0, 1)
					: split === 'train'
					? IMAGES.slice(0, 6)
					: IMAGES.slice(6)
			  ).flatMap((image) =>
					(split.startsWith('probe') ? [5] : [5, 11, 23]).map((seed) => ({
						image,
						seed,
						phase: split,
					}))
			  );
	for (const { image, seed, phase } of slots) {
		if (Date.now() - acquiredAt > 660000) break;
		if (
			rows.some(
				(r) => r.image === image && r.seed === seed && r.split === phase
			)
		)
			continue;
		const context = await browser.newContext({
			viewport: { width: 1000, height: 900 },
			deviceScaleFactor: 1,
		});
		const page = await context.newPage(),
			errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto(
			`http://127.0.0.1:5210/lab/image-convergence?image=${image}&seed=${seed}&variant=${variant}`
		);
		await page.waitForFunction(() => window.__e5?.ready, { timeout: 15000 });
		const renderer = await page.evaluate(() => {
			const c = document.createElement('canvas'),
				gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
			if (!gl) return null;
			const ext = gl.getExtension('WEBGL_debug_renderer_info');
			return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
		});
		assert(
			renderer && !/swiftshader|software|llvmpipe/i.test(renderer),
			`Hardware renderer: ${renderer}`
		);
		let timedOut = false;
		try {
			await page.waitForFunction(() => window.__e5.state().settled, {
				timeout: 30000,
			});
		} catch {
			timedOut = true;
		}
		const initial = await page.evaluate(() => window.__e5.result()),
			a = await page.evaluate(() => window.__e5.state());
		await sleep(500);
		const b = await page.evaluate(() => window.__e5.state());
		let reform = null;
		if (!timedOut) {
			await page.evaluate(() => window.__e5.beginDisturbance());
			const box = await page.locator('canvas').boundingBox();
			await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
			await page.mouse.down();
			for (let j = 1; j <= 12; j++) {
				await page.mouse.move(
					box.x + box.width * (0.25 + (0.5 * j) / 12),
					box.y + box.height * 0.5
				);
				await sleep(200 / 12);
			}
			await page.mouse.up();
			const wake = await page.evaluate(() => window.__e5.state());
			await sleep(600);
			const disturbed = await page.evaluate(() => window.__e5.intermediate());
			try {
				await page.waitForFunction(() => window.__e5.state().settled, {
					timeout: 30000,
				});
			} catch {
				timedOut = true;
			}
			const result = await page.evaluate(() => window.__e5.result());
			const reformA = await page.evaluate(() => window.__e5.state());
			await sleep(500);
			const reformB = await page.evaluate(() => window.__e5.state());
			reform = {
				wake,
				visiblyDisturbed: disturbed !== initial.final,
				result,
				rest: { a: reformA, b: reformB, pass: restProof(reformA, reformB) },
			};
		}
		const postVerdictDiagnostic = [];
		if (split === 'diagnostic' && timedOut) {
			for (let sample = 0; sample <= 10; sample++) {
				postVerdictDiagnostic.push({
					afterVerdictSeconds: sample / 2,
					...(await page.evaluate(() => window.__e5.state())),
				});
				if (sample < 10) await sleep(500);
			}
		}
		rows.push({
			postVerdictDiagnostic,
			image,
			seed,
			variant,
			split: phase,
			renderer,
			errors,
			timedOut,
			initial,
			rest: {
				a,
				b,
				pass: restProof(a, b),
			},
			reform,
		});
		await writeFile(path, JSON.stringify(rows));
		console.log(image, seed, {
			timedOut,
			ssim: initial.ssim,
			deltaE76: initial.deltaE76,
			seconds: initial.seconds,
			wallMs: initial.wallMs,
			frames: initial.frameCount,
			draws: initial.draws,
			rest: rows.at(-1).rest.pass,
		});
		await page.evaluate(() => window.__e5.dispose());
		await context.close();
	}
} finally {
	clearTimeout(timer);
	await cleanup();
}
