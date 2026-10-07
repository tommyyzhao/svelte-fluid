import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, cp, rm, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parse } from 'svelte/compiler';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const here = resolve(root, 'evals/agent-docs');
const suite = JSON.parse(await readFile(resolve(here, 'tasks.json'), 'utf8'));
const args = process.argv.slice(2);
const base = '/tmp/agent-docs-eval';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const ordered = [...suite.tasks].sort((a, b) => hash(suite.splitSalt + a.id).localeCompare(hash(suite.splitSalt + b.id)));
const held = new Set(ordered.slice(0, Math.ceil(suite.tasks.length * 0.3)).map((t) => t.id));
const children = new Set();
async function command(cmd, cwd, log, timeout = 360_000) {
	const child = spawn(cmd[0], cmd.slice(1), { cwd, env: { ...process.env, PATH: `${cwd}/node_modules/.bin:${root}/node_modules/.bin:${process.env.PATH}`, CLAUDECODE: '', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
	children.add(child);
	let output = '';
	child.stdout.on('data', (s) => { output += s; });
	child.stderr.on('data', (s) => { output += s; });
	const timer = setTimeout(() => child.kill('SIGTERM'), timeout);
	const code = await new Promise((done, reject) => { child.on('error', reject); child.on('close', done); });
	clearTimeout(timer);
	children.delete(child);
	if (log) await writeFile(log, output);
	return { ok: code === 0, code, output };
}
process.on('SIGINT', () => { for (const p of children) p.kill('SIGTERM'); process.exit(130); });

function walk(node, fn) {
	if (!node || typeof node !== 'object') return;
	if (node.type) fn(node);
	for (const [key, value] of Object.entries(node)) {
		if (key === 'loc') continue;
		if (Array.isArray(value)) value.forEach((v) => walk(v, fn));
		else if (value && typeof value === 'object') walk(value, fn);
	}
}
export function staticGrade(source, task) {
	try {
		const ast = parse(source, { modern: true });
		const imports = new Map();
		const constants = new Map();
		const nodes = [];
		const calls = new Set();
		walk(ast, (node) => {
			if (node.type === 'ImportDeclaration' && node.source.value === 'svelte-fluid') {
				for (const s of node.specifiers) if (s.imported) imports.set(s.local.name, s.imported.name);
			}
			if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') constants.set(node.id.name, node.init);
			if (node.type === 'Component') nodes.push(node);
			if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') calls.add(node.callee.property.name);
		});
		function value(node, seen = new Set()) {
			if (!node) return undefined;
			if (node.type === 'Literal') return node.value;
			if (node.type === 'Text') return node.data;
			if (node.type === 'ExpressionTag' || node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') return value(node.expression, seen);
			if (node.type === 'Identifier' && !seen.has(node.name)) return value(constants.get(node.name), new Set([...seen, node.name]));
			if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.filter((p) => p.type === 'Property').map((p) => [p.key.name ?? p.key.value, value(p.value, seen)]));
			if (node.type === 'ArrayExpression') return node.elements.map((e) => value(e, seen));
			if (node.type === 'UnaryExpression' && node.operator === '-') return -value(node.argument, seen);
			return undefined;
		}
		const props = (node) => Object.fromEntries(node.attributes.filter((a) => a.type === 'Attribute').map((a) => [a.name, a.value === true ? true : Array.isArray(a.value) ? a.value.length === 1 ? value(a.value[0]) : undefined : value(a.value)]));
		const errors = [];
		for (const component of task.components) {
			const matches = nodes.filter((n) => imports.get(n.name) === component);
			if (matches.length < (task.count ?? 1)) errors.push(`missing ${component} instance/import`);
			for (const [key, expected] of Object.entries(task.byComponent?.[component] ?? task.props ?? {})) {
				if (!matches.some((n) => {
					const actual = key.split('.').reduce((v, part) => v?.[part], props(n));
					return JSON.stringify(actual) === JSON.stringify(expected);
				})) errors.push(`${component}.${key} != ${JSON.stringify(expected)}`);
			}
		}
		for (const prop of task.present ?? []) if (!nodes.some((n) => n.attributes.some((a) => a.name === prop))) errors.push(`missing ${prop}`);
		for (const binding of task.bindings ?? []) if (!nodes.some((n) => n.attributes.some((a) => a.type === 'BindDirective' && a.name === binding))) errors.push(`missing bind:${binding}`);
		for (const call of task.calls ?? []) if (!calls.has(call)) errors.push(`missing ${call}() call`);
		for (const text of task.strings ?? []) if (!source.includes(text)) errors.push(`missing ${text}`);
		return { ok: errors.length === 0, errors };
	} catch (error) { return { ok: false, errors: [error.message] }; }
}
export function wilson(passed, total) {
	const z = 1.959963984540054;
	const p = passed / total;
	const den = 1 + z * z / total;
	const center = (p + z * z / (2 * total)) / den;
	const half = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / den;
	return { passed, total, rate: p, lower: center - half, upper: center + half };
}

async function prepare() {
	await mkdir(base, { recursive: true });
	const packed = await command(['bun', 'pm', 'pack', '--destination', base], root, resolve(base, 'pack.log'));
	assert(packed.ok, packed.output);
	const tarball = resolve(base, `svelte-fluid-${JSON.parse(await readFile(resolve(root, 'package.json'))).version}.tgz`);
	Bun.plugin({ name: 'docs-alias', setup(build) { build.onResolve({ filter: /^\$lib\// }, ({ path }) => ({ path: resolve(root, 'src/lib', path.slice(5).replace(/\.js$/, '.ts')) })); } });
	const docs = await import(resolve(root, 'src/routes/agent-docs.ts'));
	const template = resolve(base, 'template');
	await mkdir(resolve(template, 'src/routes'), { recursive: true });
	await mkdir(resolve(template, 'static'), { recursive: true });
	await mkdir(resolve(template, 'docs'), { recursive: true });
	const repo = JSON.parse(await readFile(resolve(root, 'package.json')));
	const names = ['svelte', 'vite', '@sveltejs/kit', '@sveltejs/vite-plugin-svelte', '@sveltejs/adapter-auto', 'svelte-check', 'typescript'];
	const dependencies = Object.fromEntries(names.map((name) => [name, repo.devDependencies[name].replace(/^\^/, '')]));
	dependencies['svelte-fluid'] = tarball;
	await writeFile(resolve(template, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }));
	await writeFile(resolve(template, 'svelte.config.js'), "import adapter from '@sveltejs/adapter-auto';\nexport default { kit: { adapter: adapter() } };\n");
	await writeFile(resolve(template, 'vite.config.js'), "import { sveltekit } from '@sveltejs/kit/vite';\nexport default { plugins: [sveltekit()] };\n");
	await writeFile(resolve(template, 'tsconfig.json'), JSON.stringify({ extends: './.svelte-kit/tsconfig.json', compilerOptions: { allowJs: true, checkJs: true, strict: true, moduleResolution: 'bundler', skipLibCheck: true } }));
	await writeFile(resolve(template, 'src/app.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>%sveltekit.head%</head><body data-sveltekit-preload-data="hover"><div style="display: contents">%sveltekit.body%</div></body></html>');
	await writeFile(resolve(template, 'static/sample.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="600" height="360" fill="#004488"/><circle cx="180" cy="160" r="100" fill="#ff9933"/><path d="M300 0L600 360" stroke="white" stroke-width="40"/></svg>');
	await writeFile(resolve(template, 'docs/llms-full.txt'), docs.buildLlmsFullTxt());
	await writeFile(resolve(template, 'docs/SKILL.md'), docs.buildSkillMd());
	const install = await command(['bun', 'install', '--ignore-scripts'], template, resolve(base, 'install.log'));
	assert(install.ok, install.output);
	return template;
}
async function fixture(template, id) {
	const dir = resolve(base, id);
	await cp(template, dir, { recursive: true });
	return dir;
}
async function compile(dir, task) {
	const route = resolve(dir, task.route);
	let source = '';
	try { source = await readFile(route, 'utf8'); } catch {}
	const assertions = staticGrade(source, task);
	const sync = await command(['bun', 'x', '--no-install', 'svelte-kit', 'sync'], dir, resolve(dir, 'sync.log'));
	const check = await command(['bun', 'x', '--no-install', 'svelte-check', '--tsconfig', './tsconfig.json', '--fail-on-warnings'], dir, resolve(dir, 'check.log'));
	const build = await command(['bun', 'x', '--no-install', 'vite', 'build'], dir, resolve(dir, 'build.log'));
	return { assertions, check: { ok: sync.ok && check.ok }, build: { ok: build.ok } };
}
async function lockBatch(fn) {
	const lock = '/tmp/svelte-fluid-gpu.lock';
	while (true) {
		try { await mkdir(lock); break; } catch (error) {
			if (error.code !== 'EEXIST') throw error;
			await new Promise((done) => setTimeout(done, 30_000));
		}
	}
	const owner = { lane: 'E3', worktree: root, sha: (await command(['git', 'rev-parse', 'HEAD'], root)).output.trim(), pid: process.pid };
	await writeFile(resolve(lock, 'owner'), JSON.stringify(owner));
	try { await fn(); } finally {
		if (JSON.parse(await readFile(resolve(lock, 'owner'))).pid === process.pid) await rm(lock, { recursive: true });
	}
}
async function render(dir, task, port = 5210) {
	const server = spawn('bun', ['x', '--no-install', 'vite', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: dir, stdio: 'ignore' });
	children.add(server);
	let browser;
	try {
		const url = `http://127.0.0.1:${port}${task.route.replace(/^src\/routes/, '').replace(/\/\+page\.svelte$/, '') || '/'}`;
		for (let i = 0; i < 100; i++) { try { const r = await fetch(url); if (r.ok) break; } catch {} await new Promise((d) => setTimeout(d, 100)); }
		browser = await chromium.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] });
		const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(url);
		await page.waitForTimeout(3000);
		const canvases = page.locator('canvas');
		const count = await canvases.count();
		const samples = [];
		for (let i = 0; i < count; i++) {
			const canvas = canvases.nth(i);
			if (!await canvas.isVisible()) continue;
			await canvas.screenshot({ path: resolve(dir, `canvas-${i}.png`) });
			// Decode the actual screenshot through browser Canvas2D; WebGL's cleared drawing buffer is not evidence.
			const png = (await canvas.screenshot()).toString('base64');
			samples.push(await page.evaluate(async (png) => {
				const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
				const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
				const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
				const data = ctx.getImageData(0, 0, c.width, c.height).data;
				let different = 0;
				for (let p = 0; p < data.length; p += 4) if (Math.abs(data[p] - data[0]) + Math.abs(data[p + 1] - data[1]) + Math.abs(data[p + 2] - data[2]) > 12) different++;
				return { pixels: data.length / 4, different, fraction: different / (data.length / 4) };
			}, png));
		}
		const gpu = await page.evaluate(() => {
			const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
			if (!gl) return null;
			const ext = gl.getExtension('WEBGL_debug_renderer_info');
			return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'hardware context accepted';
		});
		return { ok: errors.length === 0 && !!gpu && !/swiftshader|llvmpipe|software/i.test(gpu) && samples.some((s) => s.fraction > 0.001), errors, samples, gpu };
	} catch (error) { return { ok: false, errors: [error.message], fixtureError: true }; }
	finally { if (browser) await browser.close(); server.kill('SIGTERM'); await new Promise((d) => server.once('close', d)); children.delete(server); }
}

if (args.includes('--freeze')) {
	for (const task of suite.tasks) { task.split = held.has(task.id) ? 'test' : 'train'; task.route = `src/routes/${task.id}/+page.svelte`; }
	suite.splitOrder = ordered.map((t) => t.id);
	await writeFile(resolve(here, 'tasks.json'), JSON.stringify(suite, null, '\t') + '\n');
} else if (args.includes('--self-check')) {
	assert.equal(suite.tasks.length, 30);
	assert.equal(held.size, 9);
	for (const task of suite.tasks) assert.equal(task.split, held.has(task.id) ? 'test' : 'train');
	const task = suite.tasks[0];
	const good = `<script>import { Fluid as F } from 'svelte-fluid'; const size = 600;</script><F width={size} height={360}/>`;
	assert(staticGrade(good, task).ok);
	assert(!staticGrade(good.replace('600', '601'), task).ok);
	assert(!staticGrade(good.replace('svelte-fluid', 'other'), task).ok);
	assert(!staticGrade('<Fluid width={600} height={360}/>', task).ok);
	assert(!staticGrade(good + '<!-- width={600} -->', { ...task, props: { width: 601 } }).ok);
	assert.equal(wilson(0, 18).passed, 0); assert(wilson(18, 18).lower > 0.82);
	const template = await prepare();
	const cases = [
		['good', good, true],
		['type-bad', `<script lang="ts">import {Fluid} from 'svelte-fluid'; const bad: number = 'oops';</script><Fluid width={600} height={360}/>`, false],
		['render-bad', `<script>import {Fluid} from 'svelte-fluid';</script><Fluid width={600} height={360} initialSplatCount={0} pointerInput={false}/>`, false]
	];
	const results = [];
	for (const [id, source, expected] of cases) {
		const dir = await fixture(template, `self-${id}`); await mkdir(dirname(resolve(dir, task.route)), { recursive: true }); await writeFile(resolve(dir, task.route), source);
		results.push({ id, dir, expected, checks: await compile(dir, task) });
	}
	await lockBatch(async () => { for (const result of results) result.checks.render = await render(result.dir, task); });
	assert(results[0].checks.check.ok && results[0].checks.build.ok && results[0].checks.render.ok, JSON.stringify(results[0]));
	assert(!results[1].checks.check.ok);
	assert(!results[2].checks.render.ok);
	const broken = await fixture(template, 'self-build-bad'); await mkdir(dirname(resolve(broken, task.route)), { recursive: true }); await writeFile(resolve(broken, task.route), good.replace("import {", "import './missing.js'; import {"));
	assert(!(await compile(broken, task)).build.ok);
	console.log('self-check passed: good route; import/prop/type/build/blank-render failures detected');
} else if (args.includes('--baseline')) {
	const template = await prepare();
	const trials = [];
	for (const task of suite.tasks) for (const model of ['haiku', 'sonnet']) for (let repeat = 1; repeat <= 2; repeat++) trials.push({ id: `${task.id}-${model}-${repeat}`, task, model, repeat });
	let cursor = 0;
	await Promise.all(Array.from({ length: 4 }, async () => {
		while (cursor < trials.length) {
			const trial = trials[cursor++];
			trial.dir = await fixture(template, trial.id);
			await mkdir(dirname(resolve(trial.dir, trial.task.route)), { recursive: true });
			const prompt = `${trial.task.prompt}\nWrite ${trial.task.route}. Use Svelte 5. Use only docs/llms-full.txt and docs/SKILL.md for library documentation. No web, no package installation, no repository or node_modules source inspection. Do not modify fixture configuration. The local /sample.svg image is supplied. Give the animation visible space. Write the route file, not just an answer.`;
			const subject = await command(['claude', '--model', trial.model, '--dangerously-skip-permissions', '--bare', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--no-session-persistence', '--tools', 'Read,Write,Edit,Glob,Grep', '--disallowedTools', 'WebFetch,WebSearch,mcp__9router-web__web_fetch,mcp__9router-web__web_search,Bash,Agent', '--output-format', 'json', '-p', prompt], trial.dir, resolve(trial.dir, 'transcript.json'));
			trial.subject = { ok: subject.ok, code: subject.code };
			trial.checks = await compile(trial.dir, trial.task);
			await writeFile(resolve(trial.dir, 'result.json'), JSON.stringify(trial));
			console.log(`compiled ${trial.id}`);
		}
	}));
	await writeFile(resolve(base, 'trials.json'), JSON.stringify(trials));
	for (let offset = 0; offset < trials.length; offset += 20) await lockBatch(async () => {
		for (const trial of trials.slice(offset, offset + 20)) { trial.checks.render = await render(trial.dir, trial.task); await writeFile(resolve(trial.dir, 'result.json'), JSON.stringify(trial)); console.log(`rendered ${trial.id}`); }
	});
	const compact = trials.map(({ id, task, model, repeat, subject, checks }) => ({ id, task: task.id, split: task.split, model, repeat, subject, checks, pass: Object.values(checks).every((c) => c.ok) }));
	const summary = Object.fromEntries(['haiku', 'sonnet'].flatMap((model) => ['train', 'test'].map((split) => { const rows = compact.filter((r) => r.model === model && r.split === split); return [`${model}-${split}`, wilson(rows.filter((r) => r.pass).length, rows.length)]; })));
	await writeFile(resolve(here, 'baseline.json'), JSON.stringify({ protocol: 'ADR 0107 E3', docsSha: '1006e8f', repeats: 2, summary, trials: compact }, null, '\t') + '\n');
	console.log(JSON.stringify(summary));
} else { console.log('bun evals/agent-docs/run.mjs --freeze | --self-check | --baseline'); }
