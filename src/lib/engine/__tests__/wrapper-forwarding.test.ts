import { describe, expect, it } from 'vitest';
import { createDistortionPresetSplats } from '../distortion-splats.js';
import backgroundSrc from '../../FluidBackground.svelte?raw';
import distortionSrc from '../../FluidDistortion.svelte?raw';
import revealSrc from '../../FluidReveal.svelte?raw';
import stickSrc from '../../FluidStick.svelte?raw';
import textSrc from '../../FluidText.svelte?raw';

describe('wrapper components expose fallback, poster and lifecycle props', () => {
	const pick =
		"Pick<FluidProps, 'fallback' | 'poster' | 'posterAlt' | 'fallbackText' | 'onReady' | 'onError'>";
	it.each([
		['FluidBackground', backgroundSrc],
		['FluidDistortion', distortionSrc],
		['FluidReveal', revealSrc],
		['FluidStick', stickSrc],
		['FluidText', textSrc]
	])('%s types them and spreads the rest to <Fluid>', (_name, src) => {
		expect(src).toContain(pick);
		expect(src).toContain('{...fluidProps}');
	});
});

describe('FluidDistortion opening splats and autoDistort', () => {
	it('is deterministic per seed and bounded 0-64', () => {
		expect(createDistortionPresetSplats(7, 20)).toEqual(createDistortionPresetSplats(7, 20));
		expect(createDistortionPresetSplats(7, 20)).not.toEqual(createDistortionPresetSplats(8, 20));
		expect(createDistortionPresetSplats(1, 0)).toBeUndefined();
		expect(createDistortionPresetSplats(1, -5)).toBeUndefined();
		expect(createDistortionPresetSplats(1, Number.NaN)).toBeUndefined();
		expect(createDistortionPresetSplats(1, 10_000)).toHaveLength(64);
	});

	it('drops Math.random and gates autoDistort on readiness with accumulated time', () => {
		expect(distortionSrc).not.toContain('Math.random');
		expect(distortionSrc).toContain('createDistortionPresetSplats(stableSeed, initialSplats)');
		expect(distortionSrc).toContain('!fluidReady');
		expect(distortionSrc).toContain('elapsed += now - previousReadyFrame');
		expect(distortionSrc).not.toContain('now - startTime');
	});
});

describe('FluidDistortion poster default tracks src', () => {
	it('resolves poster ?? src at the forward site, not as a one-shot prop default', () => {
		expect(distortionSrc).not.toContain('poster = src');
		expect(distortionSrc).toContain('poster={poster ?? src}');
	});
});

describe('auto-animation loops pause with the engine', () => {
	it.each([
		['FluidReveal', revealSrc, 'function startAutoReveal'],
		['FluidStick', stickSrc, 'function startAutoAnimate']
	])('%s skips splats while paused', (_name, src, marker) => {
		const loop = src.slice(src.indexOf(marker));
		expect(loop).toContain('!inner || inner.handle.isPaused');
		expect(loop.indexOf('inner.handle.isPaused')).toBeLessThan(loop.indexOf('inner.handle.splat('));
	});
});
