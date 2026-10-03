/* Standalone ADR-0088 diagnostic. Fresh browser per run; stop transfer on crash.
 * bun scripts/bitmap-loss-diagnostic.mjs [transfer|snapshot] [count=30]
 * VITEST_CHROME_PATH must name the ordinary hardware browser. No unsafe flags.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
const mode = process.argv[2] || 'transfer';
const count = Number(process.argv[3] || 30);
if (!['transfer', 'snapshot'].includes(mode) || !Number.isInteger(count) || count < 1) throw new Error('invalid diagnostic arguments');
if (!process.env.VITEST_CHROME_PATH) throw new Error('VITEST_CHROME_PATH required');
const artifact = fileURLToPath(new URL('../dev-docs/decisions/artifacts/0088-bitmap-loss-repro.html', import.meta.url));
const out = `/tmp/strict-budget-bitmap-${mode}.json`;
const rows = [];
for (let run = 0; run < count; run++) {
	const browser = await chromium.launch({ executablePath: process.env.VITEST_CHROME_PATH, headless: true });
	const page = await browser.newPage();
	let crashed = false;
	const messages = [];
	page.on('console', (message) => messages.push(message.text()));
	const errors = [];
	page.on('crash', () => { crashed = true; });
	page.on('pageerror', (error) => errors.push(String(error)));
	const row = { run: run + 1, browser: browser.version(), mixed: false, status: 'pending', crashed: false, errors, messages };
	try {
		await page.goto(`file://${artifact}?churn=3${mode === 'snapshot' ? '&snapshot' : ''}`);
		await page.waitForFunction(() => document.querySelector('#status').textContent.includes('completed'), undefined, { timeout: 15000 });
		row.status = 'passed';
		// Mixed follow-up only after the isolated first diagnostic has survived.
		await page.goto(`file://${artifact}?churn=3&mixed${mode === 'snapshot' ? '&snapshot' : ''}`);
		row.mixed = true;
		await page.waitForFunction(() => document.querySelector('#status').textContent.includes('completed'), undefined, { timeout: 15000 });
	} catch (error) { row.status = 'failed'; errors.push(String(error)); }
	finally { row.crashed = crashed; await browser.close().catch(() => {}); }
	rows.push(row);
	await writeFile(out, JSON.stringify({ mode, rows }, null, 2));
	console.log(JSON.stringify(row));
	if (crashed) break;
	if (row.status !== 'passed') break;
}
console.log(out);
