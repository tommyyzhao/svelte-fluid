import { displayShaderSource, sunraysMaskShader, sunraysShader } from '../shaders.js';

export const precisionSources = { display: displayShaderSource, mask: sunraysMaskShader, radial: sunraysShader };
export type PrecisionPass = keyof typeof precisionSources;

// Baseline arithmetic is all highp; remove the prototype's scoped defaults/qualifiers.
export function baselineSource(source: string): string {
	let first = true;
	return source.replace(/precision (?:highp|mediump) float;/g, () => {
		if (!first) return '';
		first = false;
		return 'precision highp float;';
	}).replace(/(?<!precision )\bhighp (?=(?:vec[234]|float)\b)/g, '');
}

export function withBaseline<T>(fn: () => T, passes: PrecisionPass[] = ['display', 'mask', 'radial']): T {
	const proto = WebGL2RenderingContext.prototype;
	const original = proto.shaderSource;
	proto.shaderSource = function (shader, source) {
		for (const pass of passes) {
			if (source.includes(precisionSources[pass])) source = source.replace(precisionSources[pass], baselineSource(precisionSources[pass]));
		}
		return original.call(this, shader, source);
	};
	try { return fn(); } finally { proto.shaderSource = original; }
}
