/* Standalone diagnostic; fresh hardware browser per run, external phase capture.
 * VITEST_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
 * bun scripts/bitmap-loss-diagnostic.mjs [transfer2d|transfer|transfer-close-only|snapshot] [count=30]
 * Mixed24/three churn rounds run once, only after all 30 isolated runs pass.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { release } from 'node:os';
const mode = process.argv[2] || 'transfer2d';
const count = Number(process.argv[3] || 30);
if (!['transfer2d', 'transfer', 'transfer-close-only', 'snapshot'].includes(mode) || !Number.isInteger(count) || count < 1 || count > 30) throw new Error('invalid diagnostic arguments');
if (!process.env.VITEST_CHROME_PATH) throw new Error('VITEST_CHROME_PATH required');
const artifact = fileURLToPath(new URL('../dev-docs/decisions/artifacts/0088-bitmap-loss-repro.html', import.meta.url));
const out = `/tmp/strict-budget-bitmap-${mode}.json`;
const boundaries = ['aftertransfer', 'afterdraw', 'afterclose', 'nexttask', 'aftervisible'];
const rows = [];
const metadata = { mode, sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(), os: `Darwin ${release()}`, executablePath: process.env.VITEST_CHROME_PATH };
async function run(run, mixed = false) {
	const boundary = boundaries[(run - 1) % boundaries.length];
	const browser = await chromium.launch({ executablePath: process.env.VITEST_CHROME_PATH, headless: true });
	const page = await browser.newPage();
	const row = { run, browser: browser.version(), boundary, mixed, status: 'pending', crashed: false, errors: [], messages: [] };
	page.on('console', (message) => {
		const text = message.text();
		row.messages.push(text);
		console.log(JSON.stringify({ run, mixed, phase: text }));
		if (message.type() === 'error' || /INVALID_OPERATION|GL_INVALID|CONTEXT_LOST_WEBGL/.test(text)) row.errors.push(text);
	});
	page.on('crash', () => { row.crashed = true; console.log(JSON.stringify({ run, mixed, crash: true, lastPhase: row.messages.at(-1) })); });
	page.on('pageerror', (error) => { row.errors.push(String(error)); console.log(JSON.stringify({ run, mixed, error: String(error), lastPhase: row.messages.at(-1) })); });
	try {
		await page.goto(`file://${artifact}?mode=${mode}&boundary=${boundary}${mixed ? '&mixed&churn=3' : ''}`);
		await page.waitForFunction(() => document.querySelector('#status').textContent.split('\n').includes('completed'), undefined, { timeout: 20000 });
		row.status = row.errors.length ? 'failed' : 'passed';
	} catch (error) { row.status = 'failed'; row.errors.push(String(error)); }
	finally { await browser.close().catch(() => {}); }
	row.lastPhase = row.messages.at(-1);
	rows.push(row);
	await writeFile(out, JSON.stringify({ ...metadata, rows }, null, 2));
	console.log(JSON.stringify({ ...row, messages: undefined }));
	return row.status === 'passed' && !row.crashed;
}
let passed = true;
for (let i = 1; i <= count; i++) if (!await run(i)) { passed = false; break; }
if (passed && count === 30) await run(31, true);
console.log(out);
if (rows.some((row) => row.status !== 'passed' || row.crashed)) process.exitCode = 1;
