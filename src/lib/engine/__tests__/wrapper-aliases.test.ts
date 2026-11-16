import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

// Stub <Fluid>: record the props each wrapper forwards (server render, no GL).
const seen = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('/Users/admin/Projects/personal-archive/fluid-project/svelte-fluid/src/lib/Fluid.svelte', () => ({
	default: (_payload: unknown, props: Record<string, unknown>) => {
		seen.push({ ...props });
	}
}));

import FluidDistortion from '../../FluidDistortion.svelte';
import FluidReveal from '../../FluidReveal.svelte';
import FluidStick from '../../FluidStick.svelte';

function forwarded(component: unknown, props: Record<string, unknown>): Record<string, unknown> {
	seen.length = 0;
	// `body` is lazy: reading it runs the render.
	void render(component as never, { props: props as never }).body;
	expect(seen).toHaveLength(1);
	return seen[0];
}

type Case = [component: unknown, base: Record<string, unknown>, pairs: [oldName: string, newName: string, forwardedAs: string, a: unknown, b: unknown][]];

const cases: Record<string, Case> = {
	FluidDistortion: [
		FluidDistortion,
		{ src: 'x.png' },
		[
			['strength', 'distortionPower', 'distortionPower', 0.7, 0.2],
			['fit', 'distortionFit', 'distortionFit', 'contain', 'cover'],
			['scale', 'distortionScale', 'distortionScale', 2, 3]
		]
	],
	FluidReveal: [
		FluidReveal,
		{},
		[
			['sensitivity', 'revealSensitivity', 'revealSensitivity', 0.3, 0.6],
			['curve', 'revealCurve', 'revealCurve', 0.9, 0.2],
			['coverColor', 'revealCoverColor', 'revealCoverColor', { r: 1, g: 0, b: 0 }, { r: 0, g: 1, b: 0 }],
			['accentColor', 'revealAccentColor', 'revealAccentColor', { r: 1, g: 0, b: 0 }, { r: 0, g: 1, b: 0 }],
			['fringeColor', 'revealFringeColor', 'revealFringeColor', { r: 1, g: 0, b: 0 }, { r: 0, g: 1, b: 0 }]
		]
	],
	FluidStick: [
		FluidStick,
		{ text: 'hi', autoAnimate: false },
		[
			['strength', 'stickyStrength', 'stickyStrength', 0.5, 0.8],
			['stickyPressureAmount', 'stickyPressure', 'stickyPressure', 0.3, 0.4],
			['amplify', 'stickyAmplify', 'stickyAmplify', 1.5, 2.5]
		]
	]
};

describe.each(Object.entries(cases))('%s prop aliases', (_name, [component, base, pairs]) => {
	it.each(pairs)('%s is an alias of %s; the new name wins', (oldName, newName, key, a, b) => {
		const viaOld = forwarded(component, { ...base, [oldName]: a });
		const viaNew = forwarded(component, { ...base, [newName]: a });
		expect(viaOld[key]).toEqual(a);
		expect(viaOld[key]).toEqual(viaNew[key]);
		const both = forwarded(component, { ...base, [oldName]: a, [newName]: b });
		expect(both[key]).toEqual(b);
	});

	it('forwards the same defaults whichever name is used', () => {
		const plain = forwarded(component, base);
		for (const [, newName, key] of pairs) {
			const explicitDefault = forwarded(component, { ...base, [newName]: plain[key] });
			expect(explicitDefault[key]).toEqual(plain[key]);
		}
	});
});

describe('FluidReveal fadeSpeed vs densityDissipation', () => {
	it('densityDissipation forwards the same value fadeSpeed does; fadeSpeed keeps precedence', () => {
		expect(forwarded(FluidReveal, { fadeSpeed: 0.9 }).densityDissipation).toBe(0.9);
		expect(forwarded(FluidReveal, { densityDissipation: 0.9 }).densityDissipation).toBe(0.9);
		expect(forwarded(FluidReveal, { fadeSpeed: 0.9, densityDissipation: 0.5 }).densityDissipation).toBe(0.9);
		expect(forwarded(FluidReveal, {}).densityDissipation).toBe(0.995);
		expect(forwarded(FluidReveal, { fadeBack: false }).densityDissipation).toBe(1);
	});
});

describe('autoAnimate aliases (source contract; the loops need a DOM)', () => {
	it('resolves new name over old, for both flag and speed', async () => {
		const { default: dist } = await import('../../FluidDistortion.svelte?raw');
		const { default: rev } = await import('../../FluidReveal.svelte?raw');
		expect(dist).toContain('autoAnimate ?? autoDistort');
		expect(dist).toContain('autoAnimateSpeed ?? autoDistortSpeed');
		expect(rev).toContain('autoAnimate ?? autoReveal');
		expect(rev).toContain('autoAnimateSpeed ?? autoRevealSpeed');
	});
});
