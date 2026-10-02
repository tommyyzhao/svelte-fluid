// Strict-consumer check: compile a tiny TS consumer against dist/ with only the
// DOM lib (no GL augmentation), then scan every declaration file in dist/ that
// the compiler loaded for GL / internal type names.
import ts from 'typescript';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, '__public_declaration_consumer__.ts');
const source = `
import { Fluid, FluidBackground, FluidReveal, FluidDistortion, FluidStick, FluidText, FluidEngine,
	isWebGLAvailable, WebGLUnavailableError,
	type FluidProps, type FluidBackgroundProps, type FluidRevealProps, type FluidDistortionProps,
	type FluidStickProps, type FluidTextProps, type FluidConfig, type FluidHandle } from './dist/index.js';
import type { ComponentProps } from 'svelte';
export const fluid: ComponentProps<typeof Fluid> = { simResolution: 64, onReady: () => {}, fallbackText: 'x' };
export const text: FluidTextProps = { text: 'hi', poster: '/p.png', posterAlt: 'p' };
export const props: FluidProps[] = [fluid];
export const handle: FluidHandle | undefined = undefined;
export const engine: typeof FluidEngine = FluidEngine;
export const values: unknown[] = [FluidBackground, FluidReveal, FluidDistortion, FluidStick, FluidText,
	isWebGLAvailable, WebGLUnavailableError];
export type Types = [FluidBackgroundProps, FluidRevealProps, FluidDistortionProps, FluidStickProps, FluidConfig];
`;
const options = {
	noEmit: true,
	strict: true,
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
	types: [],
	skipLibCheck: false
};
const host = ts.createCompilerHost(options);
const read = host.getSourceFile.bind(host);
host.getSourceFile = (name, ...rest) =>
	path.resolve(name) === file ? ts.createSourceFile(name, source, rest[0]) : read(name, ...rest);
const program = ts.createProgram([file], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
let failed = false;
if (diagnostics.length) {
	failed = true;
	console.error(
		ts.formatDiagnosticsWithColorAndContext(diagnostics, {
			getCurrentDirectory: () => root,
			getCanonicalFileName: (n) => n,
			getNewLine: () => '\n'
		})
	);
}

// The library's own, GL-free names that merely start with "WebGL".
const ALLOWED = new Set(['WebGLUnavailableError', 'WebGLUnavailableReason']);
const BANNED = /^(WebGL2?[A-Z]\w*|GPU[A-Z]\w*|ProgramWrap|DoubleFBO|FBO|ExtInfo|ResolvedConfig)$/;
const dist = path.join(root, 'dist') + path.sep;
// Scan identifier tokens only: prose in JSDoc may legitimately say "FBO" or "WebGL".
for (const sf of program.getSourceFiles()) {
	if (!sf.fileName.startsWith(dist) || !sf.fileName.endsWith('.d.ts')) continue;
	if (/__(tests|benches)__/.test(sf.fileName)) continue;
	const scanner = ts.createScanner(ts.ScriptTarget.ES2022, true, ts.LanguageVariant.Standard, sf.text);
	for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scanner.scan()) {
		const name = scanner.getTokenText();
		if (t !== ts.SyntaxKind.Identifier || !BANNED.test(name) || ALLOWED.has(name)) continue;
		failed = true;
		const { line } = sf.getLineAndCharacterOfPosition(scanner.getTokenStart());
		console.error(`${path.relative(root, sf.fileName)}:${line + 1}: public declaration mentions ${name}`);
	}
}

if (failed) process.exitCode = 1;
else console.log('Public declarations: strict consumer passes; no GL or internal types exposed.');
