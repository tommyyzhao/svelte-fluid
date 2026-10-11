import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

// Server-rendering the real pages yields exactly the text a reader copies,
// after every {SCRIPT_OPEN}/{LB}/{'{'} escape has been resolved.
const pages = import.meta.glob<{ default: Component }>(['./docs/**/+page.svelte', './for-agents/+page.svelte'], { eager: true });

// Dropping or adding an example must be a deliberate edit here.
const EXPECTED: Record<string, number> = {
	'./docs/+page.svelte': 5,
	'./docs/api/+page.svelte': 15,
	'./docs/components/+page.svelte': 14,
	'./docs/configuration/+page.svelte': 0,
	'./docs/presets/+page.svelte': 1,
	'./docs/recipes/splash-cursor/+page.svelte': 2,
	'./docs/shapes/+page.svelte': 10,
	'./for-agents/+page.svelte': 0
};

// The shadcn recipe installs this file into the reader's own project.
const FOREIGN_SPECIFIERS = new Set(['$lib/components/splash-cursor/SplashCursor.svelte']);

const SHELL = /^(npm|npx|bun|bunx|pnpm|yarn|curl)\s/;

const decode = (html: string) =>
	html.replace(/<!--[\s\S]*?-->/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');

const snippets = Object.entries(pages).flatMap(([page, mod]) =>
	[...render(mod.default).body.matchAll(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g)]
		.map((match) => decode(match[1]).trim())
		.filter((code) => !SHELL.test(code))
		.map((code, index) => ({ page, id: `${page}#${index}`, code, svelte: code.startsWith('<') }))
);

const publicExports = (() => {
	const filename = decodeURIComponent(new URL('../lib/index.ts', import.meta.url).pathname);
	const program = ts.createProgram([filename], { strict: true, skipLibCheck: true, allowImportingTsExtensions: true, noEmit: true });
	const checker = program.getTypeChecker();
	return new Set(checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(filename)!)!).map((s) => s.name));
})();

describe('docs code examples', () => {
	it('match the expected count per page', () => {
		expect(Object.keys(pages).sort()).toEqual(Object.keys(EXPECTED).sort());
		const counts = Object.fromEntries(Object.keys(EXPECTED).map((page) => [page, snippets.filter((s) => s.page === page).length]));
		expect(counts).toEqual(EXPECTED);
	});

	it.each(snippets.map((s) => [s.id, s] as const))('%s compiles', (_id, { id, code, svelte }) => {
		expect(code, 'unresolved HTML entity').not.toMatch(/&(#\d+|\w+);/);
		if (svelte) {
			const { warnings } = compile(code, { filename: `${id}.svelte`, generate: 'server' });
			expect(warnings.map((w) => `${w.code}: ${w.message}`)).toEqual([]);
		} else {
			const { diagnostics } = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext } });
			expect(diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
		}
	});

	it.each(snippets.map((s) => [s.id, s] as const))('%s imports only public svelte-fluid names', (_id, { code }) => {
		for (const [, names, specifier] of code.matchAll(/import\s+(?:type\s+)?(?:\{([^}]*)\}|\w+)\s+from\s+'([^']+)'/g)) {
			if (FOREIGN_SPECIFIERS.has(specifier)) continue;
			expect(specifier).toBe('svelte-fluid');
			for (const name of (names ?? '').split(',').map((n) => n.trim().replace(/^type\s+/, '')).filter(Boolean)) {
				expect(publicExports, name).toContain(name);
			}
		}
	});
});
