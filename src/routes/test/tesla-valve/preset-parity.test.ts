import { describe, expect, it } from 'vitest';
import { flowDyeAt, flowPulseGain } from '$lib/engine/flow-source-clock.js';
import { TESLA_VALVE_CONFIG } from '$lib/presets/registry.js';
import { jetFlow, jetVelocity, SALT_DYES } from './jet-pulse.js';
import { getTuning } from './tunings.js';

describe('native pulse matches the route-side jet clock', () => {
	it('gain x peak equals jetVelocity', () => {
		for (let t = 0; t <= 6; t += 0.07) {
			expect(flowPulseGain({ period: 1.2, floor: 1 / 3, sharpness: 12 }, t) * 240).toBeCloseTo(jetVelocity(t, 80, 240), 9);
		}
	});
	it('dyeCycle matches the jetFlow salt palette', () => {
		const tuning = getTuning('flame-jet');
		for (let t = 0; t <= 12; t += 0.37) {
			const legacy = jetFlow(tuning.config.flow!, t, 80, 240, SALT_DYES).sources![0].dye;
			expect(flowDyeAt({ period: 6, colors: SALT_DYES }, t)).toEqual(legacy);
		}
	});
});

describe('preset is the card-budget derivation of flame-jet', () => {
	const lab = getTuning('flame-jet').config;
	// Lab drives are x2 (256 grid); the card halves them, so the preset equals the 128-grid ratio.
	const half = 0.5;
	it('derives drives, source, scalars, emission and outlets', () => {
		const flow = TESLA_VALVE_CONFIG.flow!;
		const labFlow = lab.flow!;
		const force = labFlow.forces![0] as { vector: { x: number; y: number } };
		expect(flow.forces).toEqual([{ kind: 'pressureGradient', vector: { x: force.vector.x * half, y: 0 } }]);
		const src = flow.sources![0];
		const labSrc = labFlow.sources![0];
		expect(src).toMatchObject({ kind: labSrc.kind, from: (labSrc as any).from, to: (labSrc as any).to, radius: labSrc.radius, profile: labSrc.profile, rate: labSrc.rate, inflow: true, scalars: labSrc.scalars });
		expect(src.velocity!.x).toBe(labSrc.velocity!.x * half);
		expect(src.dyeCycle!.colors).toEqual(SALT_DYES);
		expect(src.dye).toEqual(SALT_DYES[0]);
		expect(flow.scalarFields).toEqual(labFlow.scalarFields);
		expect(flow.visualization).toEqual(labFlow.visualization);
		expect(flow.outlets).toEqual(labFlow.outlets);
		expect(flow.walls).toBe(labFlow.walls);
	});
	it('keeps the lab look settings', () => {
		for (const k of ['glass', 'glassThickness', 'glassRefraction', 'glassReflectivity', 'glassChromatic', 'bloom', 'bloomIntensity', 'bloomThreshold', 'toneMapping', 'viscosity', 'advectionScheme', 'pressure'] as const) {
			expect(TESLA_VALVE_CONFIG[k], k).toEqual(lab[k]);
		}
	});
});
