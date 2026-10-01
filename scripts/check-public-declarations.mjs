// A strict consumer catches declaration problems that publint cannot type-check.
import ts from 'typescript';
const file = `${process.cwd()}/__public_declaration_consumer__.ts`;
const source = `
import { MaterialFoil, MaterialEnamel, MaterialImage, type MaterialStatus } from './dist/index.js';
import type { ComponentProps } from 'svelte';
const foil: ComponentProps<typeof MaterialFoil> = { selected: true };
const enamel: ComponentProps<typeof MaterialEnamel> = { text: 'Made to be felt.' };
const image: ComponentProps<typeof MaterialImage> = { src: '/art.jpg', alt: 'Art', width: 300, height: 200 };
const status: MaterialStatus = { state: 'ready' };
function retry(ref: ReturnType<typeof MaterialFoil>) { ref.retry(); }
`;
const options = { noEmit: true, strict: true, target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
	lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: [], skipLibCheck: false };
const host = ts.createCompilerHost(options), read = host.getSourceFile.bind(host);
host.getSourceFile = (name, version, ...rest) => name === file ? ts.createSourceFile(name, source, version) : read(name, version, ...rest);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
if (diagnostics.length) {
	console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => process.cwd(), getCanonicalFileName: (name) => name, getNewLine: () => '\n' }));
	process.exitCode = 1;
} else console.log('Public declarations: strict consumer passes without WebGPU globals.');
