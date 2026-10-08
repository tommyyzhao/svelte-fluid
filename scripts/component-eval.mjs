// ADR 0111 E4. Measurement only; no component or dependency changes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
	mkdir,
	readFile,
	writeFile,
	rm,
	cp,
	symlink,
	mkdtemp
} from 'node:fs/promises';
import { dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import {
	randomSides,
	unblind,
	pairVerdict,
	parseJudge
} from './quality-eval.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'evals/components');
const LOCK = '/tmp/svelte-fluid-gpu.lock';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NAMES = [
	'Fluid',
	'FluidBackground',
	'FluidReveal',
	'FluidDistortion',
	'FluidStick',
	'FluidText',
	'EnamelText',
	'InkPaper',
	'LiquidButton',
	'LiquidCaustics',
	'LiquidDropZone',
	'LiquidSegmented',
	'LiquidToggle',
	'splash-cursor'
];
const SALT = 'svelte-fluid-e4-split-v1:';
const hash = (x) => createHash('sha256').update(x).digest('hex');
const ordered = [...NAMES].sort((a, b) =>
	hash(SALT + a).localeCompare(hash(SALT + b))
);
const held = new Set(ordered.slice(0, Math.ceil(NAMES.length * 0.3)));
const json = async (p) => JSON.parse(await readFile(p, 'utf8'));
const save = async (p, x) => {
	await mkdir(dirname(p), { recursive: true });
	await writeFile(p, JSON.stringify(x, null, '\t') + '\n');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = new Set();
const sha = () =>
	execFileSync('git', ['rev-parse', 'HEAD'], {
		cwd: ROOT,
		encoding: 'utf8'
	}).trim();
let browser,
	server,
	ownedLock = false,
	temp;

export function wilson(passed, total) {
	if (!total) return { passed, total, rate: null, lower: null, upper: null };
	const z = 1.959963984540054,
		p = passed / total,
		d = 1 + (z * z) / total;
	const c = (p + (z * z) / (2 * total)) / d;
	const h =
		(z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / d;
	return {
		passed,
		total,
		rate: p,
		lower: Math.max(0, c - h),
		upper: Math.min(1, c + h)
	};
}
export function summary(rows) {
	return Object.fromEntries(
		['train', 'test'].map((split) => {
			const selected = rows.filter((r) => r.split === split),
				cells = selected.flatMap((r) =>
					r.trials.flatMap((t) => Object.values(t.checks))
				);
			const scored = cells.filter((c) => ['pass', 'fail'].includes(c.status));
			return [
				split,
				{
					...wilson(
						scored.filter((c) => c.status === 'pass').length,
						scored.length
					),
					missing: cells.filter((c) => c.status === 'missing').length,
					na: cells.filter((c) => c.status === 'na').length,
					allPassComponents: wilson(
						selected.filter((r) =>
							r.trials.every((t) =>
								Object.values(t.checks).every((c) =>
									['pass', 'na'].includes(c.status)
								)
							)
						).length,
						selected.length
					)
				}
			];
		})
	);
}
export function targetPath(base, target) {
	assert.equal(typeof target, 'string');
	const path = resolve(base, target);
	assert(
		path.startsWith(resolve(base) + sep),
		`Unsafe registry target: ${target}`
	);
	return path;
}
export function nonblank(png) {
	const { data } = PNG.sync.read(png);
	let different = 0;
	for (let i = 0; i < data.length; i += 4)
		if (
			Math.abs(data[i] - data[0]) +
				Math.abs(data[i + 1] - data[1]) +
				Math.abs(data[i + 2] - data[2]) >
			12
		)
			different++;
	return {
		different,
		pixels: data.length / 4,
		fraction: different / (data.length / 4)
	};
}
export function meaningful(html) {
	const clean = html.replace(
		/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi,
		''
	);
	return (
		!!clean
			.replace(/<[^>]*>/g, '')
			.replace(/&(?:nbsp|#160);/g, ' ')
			.trim() || /(?:aria-label|alt)="[^"]+"/.test(clean)
	);
}
const check = (ok, cause, evidence = {}) => ({
	status: ok ? 'pass' : 'fail',
	cause: ok ? null : cause,
	...evidence
});
const missing = (reason) => ({ status: 'missing', cause: reason });
async function command(argv, cwd = ROOT, timeout = 360000) {
	const p = spawn(argv[0], argv.slice(1), {
		cwd,
		env: {
			...process.env,
			PATH: `${cwd}/node_modules/.bin:${ROOT}/node_modules/.bin:${process.env.PATH}`
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	children.add(p);
	let output = '';
	p.stdout.on('data', (s) => (output += s));
	p.stderr.on('data', (s) => (output += s));
	const timer = setTimeout(() => p.kill('SIGTERM'), timeout);
	try {
		const code = await new Promise((r, reject) => {
			p.once('error', reject);
			p.once('close', r);
		});
		return { ok: code === 0, code, output };
	} finally {
		clearTimeout(timer);
		children.delete(p);
	}
}
async function release() {
	if (!ownedLock) return;
	const owner = await json(join(LOCK, 'owner'));
	assert(
		owner.pid === process.pid && owner.worktree === ROOT && owner.lane === 'E4',
		'Lock ownership changed; refusing release'
	);
	await rm(LOCK, { recursive: true });
	ownedLock = false;
}
async function cleanup(removeFixture = false) {
	if (browser) {
		await browser.close();
		browser = undefined;
	}
	if (server) {
		const p = server;
		server = undefined;
		const closed = new Promise((r) => p.once('close', r));
		p.kill('SIGTERM');
		await Promise.race([closed, sleep(5000)]);
		children.delete(p);
	}
	for (const p of children) p.kill('SIGTERM');
	await release();
	if (removeFixture && temp) await rm(temp, { recursive: true, force: true });
}
for (const signal of ['SIGINT', 'SIGTERM'])
	process.once(signal, async () => {
		await cleanup();
		process.exit(signal === 'SIGINT' ? 130 : 143);
	});
async function acquire() {
	let lastRelease = 0;
	try {
		lastRelease = (await json(join(OUT, 'local-state.json'))).releasedAt ?? 0;
	} catch {}
	let freeSince = lastRelease ? 0 : Date.now() - 300000,
		observedOther = false;
	while (true) {
		try {
			await readFile(join(LOCK, 'owner'));
			observedOther = true;
			freeSince = 0;
		} catch (e) {
			if (e.code !== 'ENOENT') throw e;
			if (!freeSince) freeSince = Date.now();
			if (!lastRelease || observedOther || Date.now() - freeSince >= 300000) {
				try {
					await mkdir(LOCK);
					ownedLock = true;
					break;
				} catch (e) {
					if (e.code !== 'EEXIST') throw e;
				}
			}
		}
		console.log('E4 waiting for shared GPU lock / cooldown');
		await sleep(75000);
	}
	const start = new Date().toISOString();
	await writeFile(
		join(LOCK, 'owner'),
		JSON.stringify({
			lane: 'E4',
			purpose: 'component baseline R=2 hardware/AX/fallback/static screenshots',
			start,
			worktree: ROOT,
			pid: process.pid
		})
	);
	await writeFile(join(LOCK, 'acquired-at'), start + '\n');
}

function imports(name) {
	return name === 'splash-cursor'
		? "import SplashCursor from '$lib/splash-cursor/SplashCursor.svelte';"
		: `import { ${name} } from 'svelte-fluid';`;
}
const child = '<button data-ink-resist data-ink-wick="0">Keep dry</button>';
function specimen(name, themed = false) {
	const w = themed ? 400 : 320,
		h = themed ? 220 : 180,
		tone = themed ? 'dark' : 'light';
	const cases = {
		Fluid: `<Fluid width={${w}} height={${h}} seed={5} />`,
		FluidBackground: `<FluidBackground style="width: ${w}px; min-height: 180px" seed={5}>${child}</FluidBackground>`,
		FluidReveal: `<FluidReveal width={${w}} height={${h}} seed={5} autoReveal>${child}</FluidReveal>`,
		FluidDistortion: `<FluidDistortion src="/hero.jpg" posterAlt="Colour study" width={${w}} height={${h}} seed={5} autoDistort />`,
		FluidStick: `<FluidStick text="FLUID" width={${w}} height={${h}} seed={5} autoAnimate />`,
		FluidText: `<FluidText text="SVELTE" height={${
			themed ? 140 : 100
		}} seed={5} />`,
		InkPaper: `<InkPaper paper="${
			themed ? '#ddeeff' : '#f4ecdc'
		}" style="width:320px;height:180px;padding:20px">${child}</InkPaper>`,
		LiquidButton: `<LiquidButton tone="${tone}">Save changes</LiquidButton>`,
		LiquidSegmented: `<LiquidSegmented name="range" legend="Time range" tone="${tone}" options={[{value:'day',label:'Day'},{value:'week',label:'Week'},{value:'month',label:'Month'}]} value="week" />`,
		LiquidDropZone: `<LiquidDropZone tone="${tone}" label="Choose images" accept="image/*" />`,
		LiquidToggle: `<LiquidToggle tone="${tone}">Notifications</LiquidToggle>`,
		LiquidCaustics: `<LiquidCaustics tone="dark" intensity={0.75} style="width:320px;padding:20px;background:${
			themed ? '#eeeeee' : '#14181f'
		};color:${themed ? '#14181f' : '#e8ecf4'}">${child}</LiquidCaustics>`,
		EnamelText: `<h2 style="font-size:4rem"><EnamelText text="Harbour" color="${
			themed ? '#2549a8' : '#d9462b'
		}" /></h2>`,
		'splash-cursor': '<SplashCursor />'
	};
	return `<script lang="ts">${imports(name)}</script><article id="specimen">${
		cases[name]
	}</article>`;
}
function docsSnippet(source, name) {
	if (name === 'splash-cursor')
		return `<script lang="ts">${imports(name)}</script><SplashCursor />`;
	const section = source.split(`<h2 id="${name.toLowerCase()}">`)[1];
	assert(section, name);
	const raw = section.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
	assert(raw, name);
	let snippet = raw
		.replace(/\{SCRIPT_OPEN\}/g, '<script lang="ts">')
		.replace(/\{SCRIPT_CLOSE\}/g, '</script>');
	const constant = raw.match(/^\{([A-Z_]+)\}$/)?.[1];
	if (constant) {
		snippet = source.match(
			new RegExp(`const ${constant} = \x60([\\s\\S]*?)\x60;`)
		)?.[1];
		assert(snippet, constant);
		snippet = snippet
			.replace(/\$\{SCRIPT_OPEN\}/g, '<script lang="ts">')
			.replace(/\$\{SCRIPT_CLOSE\}/g, '</script>');
	}
	snippet = snippet.replace(/\{'\{'\}/g, '{').replace(/\{'\}'\}/g, '}');
	const entities = {
		'&lt;': '<',
		'&gt;': '>',
		'&amp;': '&',
		'&quot;': '"',
		'&#123;': '{',
		'&#125;': '}'
	};
	for (const [a, b] of Object.entries(entities))
		snippet = snippet.replaceAll(a, b);
	if (name === 'LiquidButton')
		snippet = snippet.replace('</script>', 'const save = () => {};\n</script>');
	if (name === 'LiquidDropZone')
		snippet = snippet.replace(
			'</script>',
			'const upload = (_files: File[]) => {};\n</script>'
		);
	if (name === 'LiquidToggle')
		snippet = snippet.replace(
			'</script>',
			'const save = (_on: boolean) => {};\n</script>'
		);
	return snippet;
}
function wrapped(source) {
	// Fixture space only, not a decorative heading that could satisfy the render grader.
	return (
		source.replace('</script>', '</script><div id="target">') +
		'</div><style>:global(body){margin:24px;background:#ffffff;color:#14181f;font-family:Arial,sans-serif}#target{min-height:260px;width:720px}</style>'
	);
}
async function cpu() {
	temp = await mkdtemp('/tmp/svelte-fluid-e4-');
	await mkdir(OUT, { recursive: true });
	const packed = await command(['bun', 'pm', 'pack', '--destination', temp]);
	assert(packed.ok, packed.output);
	const repo = await json(join(ROOT, 'package.json'));
	const dependencies = Object.fromEntries(
		[
			'svelte',
			'vite',
			'@sveltejs/kit',
			'@sveltejs/vite-plugin-svelte',
			'@sveltejs/adapter-auto',
			'svelte-check',
			'typescript'
		].map((n) => [n, repo.devDependencies[n].replace(/^\^/, '')])
	);
	dependencies['svelte-fluid'] = join(temp, `svelte-fluid-${repo.version}.tgz`);
	const template = join(temp, 'template');
	await mkdir(join(template, 'src/routes'), { recursive: true });
	await mkdir(join(template, 'static'));
	await save(join(template, 'package.json'), {
		private: true,
		type: 'module',
		dependencies
	});
	await writeFile(
		join(template, 'svelte.config.js'),
		"import adapter from '@sveltejs/adapter-auto'; export default {kit:{adapter:adapter()}};\n"
	);
	await writeFile(
		join(template, 'vite.config.js'),
		"import {sveltekit} from '@sveltejs/kit/vite'; export default {plugins:[sveltekit()]};\n"
	);
	await save(join(template, 'tsconfig.json'), {
		extends: './.svelte-kit/tsconfig.json',
		compilerOptions: {
			allowJs: true,
			checkJs: true,
			strict: true,
			moduleResolution: 'bundler',
			skipLibCheck: true
		}
	});
	await writeFile(
		join(template, 'src/app.html'),
		'<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>%sveltekit.head%</head><body><div style="display:contents">%sveltekit.body%</div></body></html>'
	);
	await writeFile(
		join(template, 'static/hero.jpg'),
		'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#2549a8"/><circle cx="220" cy="160" r="100" fill="#e7b112"/></svg>'
	);
	// Vite serves this SVG with a .jpg MIME; browsers sniff it inconsistently. Use a real PNG payload at the documented URL.
	const image = new PNG({ width: 640, height: 360 });
	for (let y = 0; y < 360; y++)
		for (let x = 0; x < 640; x++) {
			const i = (y * 640 + x) * 4;
			image.data[i] = x % 256;
			image.data[i + 1] = y % 256;
			image.data[i + 2] = 120;
			image.data[i + 3] = 255;
		}
	await writeFile(join(template, 'static/hero.jpg'), PNG.sync.write(image));
	const installed = await command(
		['bun', 'install', '--ignore-scripts'],
		template
	);
	assert(installed.ok, installed.output);
	const docs = await readFile(
		join(ROOT, 'src/routes/docs/components/+page.svelte'),
		'utf8'
	);
	const exports = [
		...(await readFile(join(ROOT, 'src/lib/index.ts'), 'utf8')).matchAll(
			/default as (\w+) } from '\.\/(\w+)\.svelte'/g
		)
	].map((m) => m[1]);
	assert.deepEqual(
		[...exports].sort(),
		NAMES.filter((n) => n !== 'splash-cursor').sort()
	);
	const registry = await json(join(ROOT, 'static/r/splash-cursor.json'));
	const rows = [];
	for (const name of NAMES) {
		const dir = join(temp, name);
		await cp(template, dir, {
			recursive: true,
			filter: (p) => !p.includes('node_modules')
		});
		await symlink(join(template, 'node_modules'), join(dir, 'node_modules'));
		if (name === 'splash-cursor')
			for (const file of registry.files) {
				const dest = targetPath(join(dir, 'src/lib'), file.target);
				await mkdir(dirname(dest), { recursive: true });
				await writeFile(dest, file.content);
			}
		const snippet = docsSnippet(docs, name);
		await writeFile(join(dir, 'src/routes/+page.svelte'), wrapped(snippet));
		for (const route of ['specimen', 'themed']) {
			await mkdir(join(dir, 'src/routes', route));
			await writeFile(
				join(dir, 'src/routes', route, '+page.svelte'),
				specimen(name, route === 'themed')
			);
		}
		const sync = await command(
			['bun', 'x', '--no-install', 'svelte-kit', 'sync'],
			dir
		);
		const checked = await command(
			[
				'bun',
				'x',
				'--no-install',
				'svelte-check',
				'--tsconfig',
				'./tsconfig.json'
			],
			dir
		);
		const built = await command(
			['bun', 'x', '--no-install', 'vite', 'build'],
			dir
		);
		const logs = {
			sync: sync.output,
			check: checked.output,
			build: built.output
		};
		await save(join(OUT, `${name}-cpu.json`), logs);
		const entry = join(dir, 'entry.js');
		await writeFile(
			entry,
			name === 'splash-cursor'
				? "export {default} from './src/lib/splash-cursor/SplashCursor.svelte';"
				: `export {${name}} from 'svelte-fluid';`
		);
		let bundle;
		try {
			const result = await build({
				configFile: false,
				root: dir,
				plugins: [svelte()],
				logLevel: 'error',
				build: {
					write: false,
					minify: true,
					lib: { entry, formats: ['es'], fileName: 'component' },
					rollupOptions: { external: [] }
				}
			});
			const output = (Array.isArray(result) ? result[0] : result).output;
			const assets = output
				.filter((a) => a.type === 'chunk' || /\.css$/.test(a.fileName))
				.map((a) => ({
					file: a.fileName,
					gzipBytes: gzipSync(a.type === 'chunk' ? a.code : a.source, {
						level: 9
					}).length
				}));
			bundle = {
				gzipBytes: assets.reduce((s, a) => s + a.gzipBytes, 0),
				assets
			};
		} catch (e) {
			bundle = { missing: e.message };
		}
		let ssr = { meaningful: false, html: '', missing: 'SSR build failed' };
		if (built.ok) {
			try {
				await start(dir, 5237);
				const html = await (
					await fetch('http://127.0.0.1:5237/specimen')
				).text();
				const body =
					html.match(/<article id="specimen">([\s\S]*?)<\/article>/)?.[1] ?? '';
				ssr = { meaningful: meaningful(body), html: body };
			} catch (e) {
				ssr.missing = e.message;
			} finally {
				await cleanup();
			}
		}
		rows.push({
			name,
			split: held.has(name) ? 'test' : 'train',
			hash: hash(SALT + name),
			snippet,
			snippetSha: hash(snippet),
			ssr,
			cpu: { sync: sync.ok, check: checked.ok, build: built.ok },
			bundle,
			trials: [1, 2].map((repeat) => ({
				repeat,
				checks: Object.fromEntries(
					['a11y', 'reducedMotion', 'ssrFallback', 'theming', 'install'].map(
						(key) => [
							key,
							name === 'splash-cursor' && key === 'theming'
								? {
										status: 'na',
										cause: 'No documented registry theming contract'
								  }
								: missing('Hardware stage not run')
						]
					)
				)
			}))
		});
		console.log(
			`CPU ${name}: check=${checked.ok} build=${built.ok} gzip=${
				bundle.gzipBytes ?? 'missing'
			}`
		);
	}
	const result = {
		protocol: 'ADR 0111 E4',
		librarySha: '2a9216564d1e7d7653991c7ff794dd5c428f7b16',
		harnessSha: sha(),
		createdAt: new Date().toISOString(),
		repeats: 2,
		splitSalt: SALT,
		splitOrder: ordered,
		knownGaps: [
			'axe pending owner approval',
			'Static UI judge calibration pending; no baseline visual verdict',
			'Wilson intervals pool correlated repeated checks; descriptive only'
		],
		rows
	};
	await save(join(OUT, 'baseline.json'), result);
	await save(join(OUT, 'local-state.json'), { temp, pid: process.pid });
	await pageReport(result);
	console.log(`CPU fixtures preserved for hardware resume: ${temp}`);
}

async function start(dir, port) {
	server = spawn(
		'bun',
		[
			'x',
			'--no-install',
			'vite',
			'preview',
			'--host',
			'127.0.0.1',
			'--port',
			String(port),
			'--strictPort'
		],
		{ cwd: dir, stdio: 'ignore' }
	);
	children.add(server);
	for (let i = 0; i < 60; i++) {
		try {
			const r = await fetch(`http://127.0.0.1:${port}/specimen`, {
				signal: AbortSignal.timeout(1000)
			});
			if (r.ok) return;
		} catch {}
		await sleep(250);
	}
	throw new Error('Fixture preview did not return HTTP 200');
}
async function ax(page) {
	const session = await page.context().newCDPSession(page);
	try {
		return (await session.send('Accessibility.getFullAXTree')).nodes
			.filter((n) => !n.ignored)
			.map((n) => ({ role: n.role?.value, name: n.name?.value }));
	} finally {
		await session.detach();
	}
}
async function ring(page) {
	return page.evaluate(() => {
		for (
			let el = document.activeElement;
			el && el !== document.body;
			el = el.parentElement
		) {
			const s = getComputedStyle(el);
			if (
				(parseFloat(s.outlineWidth) >= 1 &&
					s.outlineStyle !== 'none' &&
					!/rgba\(.*?, 0\)$|transparent/.test(s.outlineColor)) ||
				(s.boxShadow !== 'none' && s.boxShadow !== el.dataset.e4Shadow)
			)
				return true;
		}
		return false;
	});
}
async function accessibility(page, name) {
	const snapshot = await page.locator('#specimen').ariaSnapshot(),
		tree = await ax(page),
		errors = [];
	const controls = await page
		.locator('#specimen button,#specimen input,#specimen a[href]')
		.count();
	const names = tree.filter((n) =>
		['button', 'radio', 'switch', 'link'].includes(n.role)
	);
	if (names.some((n) => !n.name))
		errors.push('Native control lacks accessible name');
	if (
		name === 'LiquidSegmented' &&
		(tree.filter((n) => n.role === 'radio' && n.name).length !== 3 ||
			!tree.some((n) => n.role === 'group' && n.name === 'Time range'))
	)
		errors.push('Named radio group/option semantics missing');
	if (
		name === 'LiquidToggle' &&
		!tree.some((n) => n.role === 'switch' && n.name.includes('Notifications'))
	)
		errors.push('Named switch semantics missing');
	if (
		name === 'LiquidDropZone' &&
		!tree.some((n) => n.role === 'button' && n.name.includes('Choose images'))
	)
		errors.push('Named file input semantics missing');
	if (
		['FluidText', 'FluidStick'].includes(name) &&
		!tree.some(
			(n) =>
				n.role === 'image' &&
				n.name === (name === 'FluidText' ? 'SVELTE' : 'FLUID')
		)
	)
		errors.push('Named text image semantics missing');
	if (
		name === 'EnamelText' &&
		!tree.some((n) => n.role === 'heading' && n.name === 'Harbour')
	)
		errors.push('Named heading semantics missing');
	if (tree.some((n) => n.role === 'Canvas'))
		errors.push('Decorative canvas exposed to accessibility tree');
	await page.evaluate(() => {
		document.activeElement?.blur();
		document.body.tabIndex = -1;
		document.body.focus();
		for (const e of document.querySelectorAll('#specimen *')) {
			e.dataset.e4Clicks = '0';
			e.dataset.e4Shadow = getComputedStyle(e).boxShadow;
			e.addEventListener(
				'click',
				() => (e.dataset.e4Clicks = String(Number(e.dataset.e4Clicks) + 1))
			);
		}
	});
	const reached = new Set(),
		keyboard = [];
	for (let i = 0; i < controls + 4; i++) {
		await page.keyboard.press('Tab');
		const target = await page.evaluate(() => {
			const e = document.activeElement;
			if (!e?.closest('#specimen') || !e.matches('button,input,a[href]'))
				return null;
			return {
				tag: e.tagName,
				type: e.type ?? '',
				text: e.textContent,
				value: e.value,
				idx: [
					...document.querySelectorAll(
						'#specimen button,#specimen input,#specimen a[href]'
					)
				].indexOf(e)
			};
		});
		if (!target || reached.has(target.idx)) continue;
		reached.add(target.idx);
		const focus = await ring(page);
		if (!focus) errors.push(`Focus indicator invisible: control ${target.idx}`);
		if (name === 'LiquidSegmented') {
			for (let j = 0; j < 3; j++) {
				const idx = await page.evaluate(() =>
					[...document.querySelectorAll('#specimen input')].indexOf(
						document.activeElement
					)
				);
				reached.add(idx);
				await page.keyboard.press('ArrowRight');
			}
		}
		for (const key of ['Enter', 'Space']) {
			const before = await page.evaluate(() => ({
				clicks: document.activeElement?.dataset.e4Clicks,
				checked: document.activeElement?.checked
			}));
			let activated = false;
			if (target.type === 'file') {
				const chooser = page
					.waitForEvent('filechooser', { timeout: 800 })
					.then(() => true)
					.catch(() => false);
				await page.keyboard.press(key);
				activated = await chooser;
			} else {
				await page.keyboard.press(key);
				const after = await page.evaluate(() => ({
					clicks: document.activeElement?.dataset.e4Clicks,
					checked: document.activeElement?.checked
				}));
				activated =
					after.clicks !== before.clicks || after.checked !== before.checked;
			}
			keyboard.push({ control: target.idx, key, activated, focus });
			if (!activated)
				errors.push(
					`${key} does not activate ${target.type || target.tag.toLowerCase()}`
				);
		}
	}
	if (reached.size < controls)
		errors.push(`Keyboard reaches ${reached.size}/${controls} controls`);
	return check(!errors.length, errors.join('; '), {
		snapshot,
		tree,
		keyboard,
		controls,
		reached: reached.size
	});
}
async function themed(page, name) {
	if (name === 'splash-cursor')
		return { status: 'na', cause: 'No documented registry theming contract' };
	const selector = {
		Fluid: '.svelte-fluid-container',
		FluidBackground: '.svelte-fluid-bg',
		FluidReveal: '.svelte-fluid-reveal',
		FluidDistortion: '.svelte-fluid-distortion',
		FluidStick: '.svelte-fluid-stick',
		FluidText: '.svelte-fluid-text',
		InkPaper: '.svelte-fluid-ink-paper',
		LiquidButton: 'button',
		LiquidSegmented: '.track',
		LiquidDropZone: 'label',
		LiquidToggle: '.track',
		LiquidCaustics: '.liquid-caustics',
		EnamelText: '.enamel-text'
	}[name];
	const measure = () =>
		page
			.locator(selector)
			.first()
			.evaluate((e) => {
				const r = e.getBoundingClientRect(),
					s = getComputedStyle(e);
				return {
					width: r.width,
					height: r.height,
					color: s.color,
					background: s.backgroundColor,
					fill: s.getPropertyValue('--liquid-fill')
				};
			});
	const before = await measure();
	await page.goto(page.url().replace('/specimen', '/themed'));
	await page.waitForTimeout(400);
	const after = await measure();
	const sized = [
		'Fluid',
		'FluidBackground',
		'FluidReveal',
		'FluidDistortion',
		'FluidStick',
		'FluidText'
	].includes(name);
	const expected = name === 'FluidText' ? 140 : 400;
	const ok = sized
		? Math.abs(
				(name === 'FluidText' ? after.height : after.width) - expected
		  ) <= 2 &&
		  Math.abs(
				(name === 'FluidText' ? after.height : after.width) -
					(name === 'FluidText' ? before.height : before.width)
		  ) >= 10
		: before.color !== after.color ||
		  before.background !== after.background ||
		  before.fill !== after.fill;
	return check(
		ok,
		'Documented prop/style change does not change measured size/colour',
		{ before, after, selector }
	);
}
async function exercise(page) {
	await page.mouse.move(100, 120);
	await page.mouse.down();
	await page.mouse.move(260, 160, { steps: 10 });
	await page.mouse.up();
	await page.keyboard.press('Tab');
	await page.keyboard.press('Space');
}
async function motion(context, url) {
	const page = await context.newPage();
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.addInitScript(() => {
		window.__e4Raf = 0;
		const raf = window.requestAnimationFrame;
		window.requestAnimationFrame = (fn) =>
			raf.call(window, (t) => {
				window.__e4Raf++;
				fn(t);
			});
	});
	try {
		await page.goto(url);
		await page.waitForTimeout(3000);
		const count = () => page.evaluate(() => window.__e4Raf);
		const a = await count();
		await page.waitForTimeout(1000);
		const b = await count();
		await exercise(page);
		await page.waitForTimeout(1000);
		const c = await count();
		await page.waitForTimeout(1000);
		const d = await count();
		return check(
			b === a && d === c,
			'Continuous rAF callbacks under reduced motion',
			{ idleCallbacks: b - a, postInputCallbacks: d - c, settleMs: 3000 }
		);
	} finally {
		await page.close();
	}
}
async function fallback(context, url, ssr) {
	const page = await context.newPage(),
		errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
			if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
			return original.call(this, kind, ...args);
		};
	});
	try {
		await page.goto(url);
		await page.waitForTimeout(500);
		const snapshot = await page.locator('#specimen').ariaSnapshot(),
			tree = await ax(page);
		const accessible = tree.some(
			(n) =>
				n.name?.trim() && !['RootWebArea', 'generic', 'none'].includes(n.role)
		);
		return check(
			ssr.meaningful && accessible && !errors.length,
			[
				!ssr.meaningful
					? 'SSR specimen contains only blank/decorative canvas'
					: null,
				!accessible ? 'No meaningful accessible no-GPU fallback/content' : null,
				errors.length ? 'Unhandled no-GPU page error' : null
			]
				.filter(Boolean)
				.join('; '),
			{ ssr, snapshot, tree, errors }
		);
	} finally {
		await page.close();
	}
}
async function install(page, url, row) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const response = await page.goto(url);
	await page.waitForTimeout(1200);
	let sample = nonblank(await page.locator('#target').screenshot());
	if (sample.fraction <= 0.001) {
		await exercise(page);
		await page.waitForTimeout(500);
		sample = {
			...nonblank(await page.locator('#target').screenshot()),
			dragged: true
		};
	}
	const ok =
		row.cpu.sync &&
		row.cpu.check &&
		row.cpu.build &&
		response.ok() &&
		!errors.length &&
		sample.fraction > 0.001;
	return check(
		ok,
		[
			!row.cpu.check ? 'Docs/registry snippet fails svelte-check' : null,
			!row.cpu.build ? 'Docs/registry snippet fails vite build' : null,
			sample.fraction <= 0.001
				? 'Docs/registry route blank after pointer stroke'
				: null,
			...errors
		]
			.filter(Boolean)
			.join('; '),
		{ cpu: row.cpu, http: response.status(), sample, errors }
	);
}
async function ssrOnly() {
	const result = await json(join(OUT, 'baseline.json'));
	temp = (await json(join(OUT, 'local-state.json'))).temp;
	for (const row of result.rows) {
		try {
			await start(join(temp, row.name), 5237);
			const html = await (await fetch('http://127.0.0.1:5237/specimen')).text();
			const body =
				html.match(/<article id="specimen">([\s\S]*?)<\/article>/)?.[1] ?? '';
			row.ssr = { meaningful: meaningful(body), html: body };
		} catch (e) {
			row.ssr = { meaningful: false, missing: e.message };
		} finally {
			await cleanup();
		}
		console.log(`SSR ${row.name}: ${row.ssr.meaningful}`);
	}
	await save(join(OUT, 'baseline.json'), result);
}
async function hardware() {
	const result = await json(join(OUT, 'baseline.json')),
		state = await json(join(OUT, 'local-state.json'));
	temp = state.temp;
	await acquire();
	const deadline = Date.now() + 650000;
	const hardStop = setTimeout(async () => {
		console.error('E4 12-minute lock ceiling reached');
		await cleanup();
		process.exit(2);
	}, 700000);
	try {
		browser = await chromium.launch({
			executablePath: CHROME,
			headless: true,
			ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
			args: ['--disable-software-rasterizer']
		});
		const probe = await browser.newPage();
		const renderer = await probe.evaluate(() => {
			const gl = document
				.createElement('canvas')
				.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
			if (!gl) return null;
			const ext = gl.getExtension('WEBGL_debug_renderer_info');
			return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
		});
		await probe.close();
		assert(
			renderer && !/swiftshader|llvmpipe|software/i.test(renderer),
			`Hardware renderer unavailable: ${renderer}`
		);
		result.renderer = renderer;
		for (const row of result.rows) {
			if (
				row.trials.every(
					(t) => !Object.values(t.checks).some((c) => c.status === 'missing')
				)
			)
				continue;
			if (Date.now() > deadline - 25000) break;
			await start(join(temp, row.name), 5237);
			const url = 'http://127.0.0.1:5237/specimen';
			const html = await (await fetch(url)).text();
			const specimenHtml =
				html.match(/<article id="specimen">([\s\S]*?)<\/article>/)?.[1] ?? '';
			const ssr = { meaningful: meaningful(specimenHtml), html: specimenHtml };
			for (const trial of row.trials) {
				const context = await browser.newContext({
					viewport: { width: 800, height: 600 },
					deviceScaleFactor: 1
				});
				context.setDefaultTimeout(5000);
				context.setDefaultNavigationTimeout(10000);
				try {
					const page = await context.newPage();
					await page.goto(url);
					await page.waitForTimeout(800);
					await mkdir(join(OUT, 'baseline'), { recursive: true });
					const screenshot = join(
						OUT,
						'baseline',
						`${row.name}-r${trial.repeat}.png`
					);
					await page.screenshot({ path: screenshot });
					trial.screenshot = `baseline/${row.name}-r${trial.repeat}.png`;
					trial.screenshotSha = hash(await readFile(screenshot));
					for (const [key, fn] of [
						['a11y', () => accessibility(page, row.name)],
						[
							'theming',
							async () => {
								await page.goto(url);
								await page.waitForTimeout(300);
								return themed(page, row.name);
							}
						],
						['install', () => install(page, 'http://127.0.0.1:5237/', row)],
						['reducedMotion', () => motion(context, url)],
						['ssrFallback', () => fallback(context, url, ssr)]
					]) {
						try {
							trial.checks[key] = await fn();
						} catch (e) {
							trial.checks[key] = missing(
								`Harness observation error: ${e.message}`
							);
						}
					}
				} finally {
					await context.close();
				}
				console.log(
					`Hardware ${row.name} R${trial.repeat}: ${Object.entries(trial.checks)
						.map(([k, v]) => `${k}=${v.status}`)
						.join(' ')}`
				);
				await save(join(OUT, 'baseline.json'), result);
			}
			const p = server;
			server = undefined;
			const closed = new Promise((r) => p.once('close', r));
			p.kill('SIGTERM');
			await Promise.race([closed, sleep(5000)]);
			children.delete(p);
		}
	} finally {
		await cleanup();
		clearTimeout(hardStop);
		state.releasedAt = Date.now();
		await save(join(OUT, 'local-state.json'), state);
		result.summary = summary(result.rows);
		result.complete = result.rows.every((r) =>
			r.trials.every((t) =>
				Object.values(t.checks).every((c) => c.status !== 'missing')
			)
		);
		await save(join(OUT, 'baseline.json'), result);
		await pageReport(result);
	}
}
async function pageReport(result) {
	const pct = (x) => (x === null ? 'missing' : `${(x * 100).toFixed(1)}%`);
	const stats = summary(result.rows);
	for (const row of result.rows) {
		const cells = row.trials
			.flatMap((t) => Object.values(t.checks))
			.filter((c) => ['pass', 'fail'].includes(c.status));
		row.score = {
			passed: cells.filter((c) => c.status === 'pass').length,
			total: cells.length,
			rate: cells.length
				? cells.filter((c) => c.status === 'pass').length / cells.length
				: null
		};
	}
	await save(join(OUT, 'baseline.json'), result);
	let text = `# E4 — Component excellence\n\nProtocol: [ADR 0111](../decisions/0111-component-excellence-eval.md). Frozen library: \`2a92165\`. Measurement only; no component fixes.\n\nRun: \`bun scripts/component-eval.mjs --self-check\`, then \`baseline --cpu-only\`, then \`baseline --hardware\`. CPU fixtures remain machine-local until hardware completes; \`--cleanup\` removes only this lane's recorded fixture.\n\nRenderer: ${
		result.renderer ?? 'hardware stage pending'
	}. R=2 fresh browser contexts, 800×600, DPR 1.\n\n## Scores\n\nWilson 95% intervals are descriptive: repeated component checks are correlated. N/A excluded; missing reported, never passed.\n\n| Split | Passed / observed | Pass rate | Wilson 95% | Missing | N/A | All-pass components |\n|---|---|---|---|---|---|---|\n`;
	for (const [split, s] of Object.entries(stats))
		text += `| ${split} | ${s.passed}/${s.total} | ${pct(s.rate)} | ${pct(
			s.lower
		)}–${pct(s.upper)} | ${s.missing} | ${s.na} | ${
			s.allPassComponents.passed
		}/${s.allPassComponents.total} |\n`;
	text +=
		'\n## Component results and bundle cost\n\nCells show R1/R2. a=accessibility, b=reduced motion, c=SSR+fallback, d=theming, e=install. Gzip level 9; complete one-component JS+CSS graph including Svelte runtime.\n\n| Component | Split | a | b | c | d | e | gzip bytes |\n|---|---|---|---|---|---|---|---|\n';
	for (const row of result.rows)
		text += `| ${row.name} | ${row.split} | ${[
			'a11y',
			'reducedMotion',
			'ssrFallback',
			'theming',
			'install'
		]
			.map((k) => row.trials.map((t) => t.checks[k].status).join('/'))
			.join(' | ')} | ${row.bundle.gzipBytes ?? 'missing'} |\n`;
	text += '\n## Candidate work queue (causes, not fixes)\n\n';
	const causes = new Map();
	for (const row of result.rows)
		for (const t of row.trials)
			for (const [key, c] of Object.entries(t.checks))
				if (['fail', 'missing'].includes(c.status)) {
					const id = `${key}: ${c.cause}`;
					const entries = causes.get(id) ?? [];
					entries.push(`${row.name} R${t.repeat} (${row.split})`);
					causes.set(id, entries);
				}
	for (const [cause, entries] of [...causes].sort(
		(a, b) => b[1].length - a[1].length
	))
		text += `- **${entries.length} cells — ${cause.replaceAll(
			'|',
			'\\|'
		)}**: ${entries.join(', ')}.\n`;
	if (!causes.size) text += 'No observed failing cells.\n';
	text +=
		'\n## Failure interpretation before candidate design\n\n- **Harness-first: LiquidButton focus.** The pre-registered computed outline/shadow proxy fails because live mode removes the CSS outline and paints its ring in WebGL (`LiquidButton.svelte`, live focus style). This is not evidence that the actual ring is absent. Static focus screenshot verification is a known measurement gap; do not fix the button from this proxy alone.\n- **Harness-first: native keyboard contract.** LiquidToggle implements native Space, not Enter. LiquidSegmented implements native arrows; the Space probe targets an already selected radio after the arrow sweep, which need not fire another click. Strict pre-registered failures remain scored, but are not accessibility defects by themselves.\n- **Docs integration: FluidDistortion.** The canonical snippet supplies no width/height; its percentage-height wrapper collapses inside the fixture parent with only min-height. The explicitly sized specimen renders successfully. This is a copy-paste layout gap, not a GPU/image-loading failure.\n- **Decorative SSR contract.** Fluid emits an empty decorative canvas on the server, then supplies its accessible no-GPU message after mount. splash-cursor emits nothing during SSR and hides its entire decorative subtree from AX. Strict meaningful-content requirement fails both; adding meaningless labels solely to improve the score would be wrong.\n- **Hardware noise: LiquidDropZone.** Enter filechooser observation failed R1, passed R2; 800 ms event timeout. Reproduce before changing the control.\n\n## Noise and known gaps\n\n';
	for (const row of result.rows) {
		const disagreement = Object.keys(row.trials[0].checks).filter(
			(k) => row.trials[0].checks[k].status !== row.trials[1].checks[k].status
		);
		if (disagreement.length)
			text += `- ${row.name}: R1/R2 disagree on ${disagreement.join(', ')}.\n`;
	}
	for (const gap of result.knownGaps) text += `- ${gap}.\n`;
	text +=
		'- Visual is candidate-only. Baseline static PNGs and SHA-256 are frozen under `evals/components/baseline/`; no visual score claimed. Reuse E2 side randomisation, swapped trials, tie collapse and calibrated no-worse logic; calibrate static UI before use.\n- Strict Enter+Space rule can fail native switches/radios that intentionally implement Space/arrow semantics. This was pre-registered, not changed after observation.\n- No contrast, screen-reader user testing, touch, mobile GPU, or temporal smoothness claim.\n';
	await writeFile(join(ROOT, 'dev-docs/benchmarks/component-eval.md'), text);
}
// Candidate-only adapter: caller owns model invocation and static-UI calibration.
// ponytail: baseline freezes stills only; add candidate CLI when a calibrated round exists.
export async function staticJudgePair(
	reference,
	candidate,
	{ judge, judgeTier, implementerTier, calibration }
) {
	assert(
		judgeTier !== implementerTier,
		'Judge tier must differ from implementer'
	);
	assert(
		calibration?.scope === 'static-ui' && calibration.passed,
		'Static UI calibration required; fluid calibration does not transfer'
	);
	const a = PNG.sync.read(await readFile(reference)),
		b = PNG.sync.read(await readFile(candidate));
	assert(
		a.width === b.width && a.height === b.height,
		'Pair dimensions differ'
	);
	const trials = [];
	for (const referenceLeft of randomSides()) {
		const image = new PNG({ width: a.width * 2 + 8, height: a.height });
		image.data.fill(128);
		for (const [source, offset] of [
			[referenceLeft ? a : b, 0],
			[referenceLeft ? b : a, a.width + 8]
		])
			for (let y = 0; y < a.height; y++)
				source.data.copy(
					image.data,
					(y * image.width + offset) * 4,
					y * a.width * 4,
					(y + 1) * a.width * 4
				);
		const prompt =
			'Blind static UI pair. Compare legibility, hierarchy, shape, spacing and visual finish. Describe both panels; tie when indistinguishable. Do not infer labels. Return ONLY JSON {"verdict":"left"|"right"|"tie","reason":"evidence"}.';
		const verdict = parseJudge(await judge(PNG.sync.write(image), prompt));
		trials.push({
			...verdict,
			unblinded: unblind(verdict.verdict, referenceLeft)
		});
	}
	return {
		verdict: pairVerdict(trials.map((t) => t.unblinded)),
		trials,
		judgeTier,
		calibration
	};
}
function selfCheck() {
	assert.equal(held.size, 5);
	assert.deepEqual(
		[...held],
		['FluidStick', 'FluidReveal', 'Fluid', 'FluidBackground', 'LiquidCaustics']
	);
	assert(wilson(0, 10).upper < 0.28);
	assert(wilson(10, 10).lower > 0.72);
	assert.equal(wilson(0, 0).rate, null);
	assert.throws(() => targetPath('/tmp/fixture/src/lib', '../../escape'));
	assert.throws(() => targetPath('/tmp/fixture/src/lib', '/etc/passwd'));
	assert.equal(
		targetPath('/tmp/fixture/src/lib', 'splash-cursor/SplashCursor.svelte'),
		'/tmp/fixture/src/lib/splash-cursor/SplashCursor.svelte'
	);
	assert(!meaningful('<canvas></canvas><!-- marker -->'));
	assert(meaningful('<span>Harbour</span>'));
	assert(meaningful('<div role="img" aria-label="FLUID"></div>'));
	const png = new PNG({ width: 10, height: 10 });
	png.data.fill(255);
	assert.equal(nonblank(PNG.sync.write(png)).fraction, 0);
	png.data[4] = 0;
	assert.equal(nonblank(PNG.sync.write(png)).fraction, 0.01);
	const s = summary([
		{
			split: 'train',
			trials: [
				{
					checks: {
						a: { status: 'pass' },
						b: { status: 'na' },
						c: { status: 'missing' },
						d: { status: 'fail' }
					}
				}
			]
		}
	]);
	assert.equal(s.train.total, 2);
	assert.equal(s.train.rate, 0.5);
	assert.equal(s.train.missing, 1);
	assert.equal(s.train.na, 1);
	assert.deepEqual(
		randomSides(() => 1),
		[true, false]
	);
	assert.equal(unblind('left', true), 'reference');
	assert.equal(pairVerdict(['reference', 'candidate']), 'tie');
	assert.equal(
		parseJudge('{"verdict":"tie","reason":"identical"}').verdict,
		'tie'
	);
	console.log(
		'E4 self-check passed: split, Wilson, N/A/missing, target containment, SSR/nonblank, E2 blind judge logic'
	);
}
if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args.includes('--self-check')) selfCheck();
	else if (args.includes('--cleanup')) {
		const state = await json(join(OUT, 'local-state.json'));
		temp = state.temp;
		assert(temp.startsWith('/tmp/svelte-fluid-e4-'));
		await cleanup(true);
		await rm(join(OUT, 'local-state.json'));
		console.log(
			`Removed owned fixture ${temp}; no owned GPU lock or browser/server`
		);
	} else if (args[0] === 'baseline' && args.includes('--cpu-only')) await cpu();
	else if (args[0] === 'baseline' && args.includes('--ssr-only'))
		await ssrOnly();
	else if (args[0] === 'baseline' && args.includes('--hardware'))
		await hardware();
	else if (args.includes('--report'))
		await pageReport(await json(join(OUT, 'baseline.json')));
	else
		console.log(
			'bun scripts/component-eval.mjs --self-check | baseline --cpu-only | baseline --hardware | --report | --cleanup'
		);
}
