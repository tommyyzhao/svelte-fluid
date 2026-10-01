import { expect, it } from 'vitest';
import { advanceDewetting, dewettingEnergy, dewettingHeight, dewettingProfile, dewettingState,
	seedDewetting, setDewettingSpreading, finishDewetting, DEWETTING_WIDTH, FILM_HEIGHT, RESIDUAL_HEIGHT,
	SHAPE_MAXIMUM } from './dewetting-model.js';

it('places the actual removed profile volume into a positive, wholly contained rim', () => {
	for (const [x, y] of [[0.5, 0.5], [0, 0], [1, 1], [0.7, 0.3]]) {
		const state = dewettingState(); seedDewetting(state, x, y); finishDewetting(state);
		const profile = dewettingProfile(state);
		expect(profile.amplitude * profile.rimIntegral).toBeCloseTo(profile.removed, 14);
		expect(state.radius * SHAPE_MAXIMUM + profile.width).toBeLessThan(Math.min(state.x, DEWETTING_WIDTH - state.x, state.y, 1 - state.y));
		// Independent midpoint integration of the actual spatial height, not the
		// claimed accounting fields. 720×400 resolves the narrow contact profile.
		let volume = 0, minimum = Infinity;
		for (let j = 0; j < 400; j++) for (let i = 0; i < 720; i++) {
			const h = dewettingHeight(state, (i + 0.5) / 720 * DEWETTING_WIDTH, (j + 0.5) / 400);
			volume += h * DEWETTING_WIDTH / (720 * 400); minimum = Math.min(minimum, h);
		}
		expect(Math.abs(volume - DEWETTING_WIDTH * FILM_HEIGHT)).toBeLessThan(4e-7);
		expect(minimum).toBeGreaterThanOrEqual(RESIDUAL_HEIGHT);
	}
});

it('descends its energy and explicitly accounts for parameter work', () => {
	const state = dewettingState(); seedDewetting(state, 0.5, 0.5);
	for (let i = 0; i < 1800; i++) {
		if (i === 200) setDewettingSpreading(state, 0.35);
		if (i === 450) setDewettingSpreading(state, 0.82);
		const before = dewettingEnergy(state); advanceDewetting(state, 1 / 120);
		expect(dewettingEnergy(state)).toBeLessThanOrEqual(before + 1e-14);
		expect(dewettingEnergy(state) + state.dissipated - state.work).toBeCloseTo(0, 12);
	}
	expect(state.moving).toBe(false); expect(state.dissipated).toBeGreaterThan(0);
});

it('settles all controls with positive radius and ignores further time at rest', () => {
	for (const spreading of [0.3, 0.85]) for (const viscosity of [0.7, 3]) {
		const state = dewettingState(); state.viscosity = viscosity; setDewettingSpreading(state, spreading); seedDewetting(state, 0.5, 0.5);
		for (let i = 0; i < 1440; i++) advanceDewetting(state, 1 / 120);
		expect(state.moving).toBe(false); expect(state.radius).toBeGreaterThan(0); expect(state.radius).toBeLessThan(state.limit);
		const frozen = { ...state }; advanceDewetting(state, 1 / 60); expect(state).toEqual(frozen);
	}
});

it('rejects undefined numerical regimes instead of disguising them as plausible motion', () => {
	const state = dewettingState();
	expect(() => seedDewetting(state, NaN, 0.5)).toThrow();
	expect(() => setDewettingSpreading(state, 4)).toThrow();
	expect(() => advanceDewetting(state, Infinity)).toThrow();
	expect(() => advanceDewetting(state, 0.2)).toThrow();
});
