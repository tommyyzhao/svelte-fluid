// Run: bun scripts/check-browser-config.ts
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const configUrl = new URL('../vitest.config.ts', import.meta.url).href;
const source = `
	import config from ${JSON.stringify(configUrl)};
	const project = config.test.projects.find((project) => project.test.name === 'browser');
	const { browser, env } = project.test;
	console.log(JSON.stringify({
		instances: browser.instances,
		provider: browser.provider.name,
		options: browser.provider.options,
		gate: env.SVELTE_FLUID_HARDWARE_GATE
	}));
`;
const chromePath = '/config-check/not-a-real-chrome';
const cases = [
	{ name: undefined, chrome: undefined },
	{ name: 'chromium', chrome: undefined },
	{ name: undefined, chrome: chromePath },
	{ name: 'chromium', chrome: chromePath },
	{ name: 'firefox', chrome: chromePath },
	{ name: 'webkit', chrome: chromePath },
	{ name: '', chrome: chromePath },
	{ name: 'safari', chrome: chromePath },
	{ name: 'CHROMIUM', chrome: chromePath }
];

for (const { name, chrome } of cases) {
	const env = { ...process.env };
	delete env.VITEST_BROWSER_NAME;
	delete env.VITEST_CHROME_PATH;
	if (name !== undefined) env.VITEST_BROWSER_NAME = name;
	if (chrome !== undefined) env.VITEST_CHROME_PATH = chrome;
	env.VITEST_BROWSER = '1';
	env.SVELTE_FLUID_DPR = '2';

	const result = Bun.spawnSync([process.execPath, '--eval', source], {
		cwd: fileURLToPath(new URL('..', import.meta.url)),
		env,
		stdout: 'pipe',
		stderr: 'pipe'
	});
	const browser = name ?? 'chromium';
	if (!['chromium', 'firefox', 'webkit'].includes(browser)) {
		assert.notEqual(result.exitCode, 0, 'Invalid browser was accepted');
		assert.match(
			new TextDecoder().decode(result.stderr),
			/VITEST_BROWSER_NAME must be chromium, firefox, or webkit/
		);
		continue;
	}

	assert.equal(result.exitCode, 0, `Config import failed for ${browser}`);
	const config = JSON.parse(new TextDecoder().decode(result.stdout));
	assert.deepEqual(config.instances, [{ browser }]);
	assert.equal(config.provider, 'playwright');
	const customChrome = browser === 'chromium' && chrome !== undefined;
	assert.equal(config.gate, customChrome ? '1' : '');
	assert.deepEqual(
		config.options,
		customChrome
			? {
					launchOptions: {
						executablePath: chromePath,
						ignoreDefaultArgs: ['--enable-unsafe-swiftshader']
					},
					contextOptions: { deviceScaleFactor: 2 }
				}
			: {}
	);
}

console.log('Browser config checks passed');
