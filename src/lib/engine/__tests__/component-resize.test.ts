import { describe, expect, it } from 'vitest';
import fluidSrc from '../../Fluid.svelte?raw';

function braceBody(source: string, marker: string): string {
	const start = source.indexOf(marker);
	if (start < 0) throw new Error(`Missing marker: ${marker}`);
	const open = source.indexOf('{', start);
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === '{') depth++;
		else if (source[i] === '}') {
			depth--;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	throw new Error(`Unclosed body: ${marker}`);
}

describe('Fluid component resize ownership', () => {
	it('coalesces ResizeObserver events without tearing down a live engine', () => {
		const observer = braceBody(fluidSrc, 'new ResizeObserver');
		expect(observer).toContain('scheduleResize()');
		expect(observer).not.toContain('setTimeout');
		expect(observer).not.toContain('teardown()');
		const schedule = braceBody(fluidSrc, 'const scheduleResize');
		expect(schedule).toContain('requestAnimationFrame(applyResize)');
	});

	it('uses in-place resize and retains a one-shot constructor fallback', () => {
		const apply = braceBody(fluidSrc, 'const applyResize');
		expect(apply).toContain('engine.resize(physicalWidth, physicalHeight)');
		expect(apply).toContain('engine.setConfig(buildCanvasConfig');
		expect(apply).toContain('if (rebuildingAfterResizeFailure) return');
		expect(apply).toContain('teardown()');
		expect(apply).toContain('instantiate()');
	});

	it('keeps deliberate zero-size and lazy teardown paths', () => {
		const observer = braceBody(fluidSrc, 'new ResizeObserver');
		expect(observer).toContain('w <= 0 || h <= 0');
		expect(observer).toContain('reconcile()');
		const reconcile = braceBody(fluidSrc, 'function reconcile');
		expect(reconcile).toContain('!shouldExist && engine');
		expect(reconcile).toContain('teardown()');
	});
});
