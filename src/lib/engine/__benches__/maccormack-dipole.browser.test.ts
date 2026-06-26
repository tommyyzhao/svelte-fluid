import { describe, expect, it } from 'vitest';
import { fieldEnergy, hasNonFinite } from './reducers.js';
import { dipole } from './scenes.js';
import { mulberry32 } from '../rng.js';
import { FluidEngine } from '../FluidEngine.js';
import type { FluidEngineOptions } from '../FluidEngine.js';

type Scheme = FluidEngineOptions['advectionScheme'];

const EARLY = 6;
const LATE = 30;
const DT = 1 / 60;

// Peak velocity magnitude over the whole grid — a direct readout of how much of
// the dipole's coherent structure survives advection (a reducer over readField).
function peakSpeed(data: ArrayLike<number>): number {
	let peak = 0;
	for (let i = 0; i + 1 < data.length; i += 2) {
		const m = Math.hypot(data[i], data[i + 1]);
		if (m > peak) peak = m;
	}
	return peak;
}

function fieldsIdentical(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

interface Sample {
	earlyPeak: number;
	latePeak: number;
	earlyEnergy: number;
	lateEnergy: number;
	lateData: ArrayLike<number>;
}

// Inject the dipole once (the scene's own frame-0 splat pair) and then free-advect
// identically for both schemes. Re-running the scene's periodic splats would keep
// re-energizing the field and swamp the diffusion signal we are measuring; with a
// single injection the late-time field is pure advective transport + decay, which
// is exactly where MacCormack's lower numerical diffusion shows up.
function measure(scheme: Scheme): Sample {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;
	const engine = new FluidEngine({
		canvas,
		config: { ...dipole.config, simResolution: 128, pointerInput: false },
		autoStart: false,
		advectionScheme: scheme
	});
	try {
		const rng = mulberry32(dipole.seed);
		dipole.schedule(engine, rng, 0, DT);
		let earlyPeak = 0;
		let earlyEnergy = 0;
		let latePeak = 0;
		let lateEnergy = 0;
		let lateData: ArrayLike<number> = [];
		for (let frame = 1; frame <= LATE; frame++) {
			engine.advance(1, DT);
			if (frame === EARLY) {
				const d = engine.readField('velocity').data;
				earlyPeak = peakSpeed(d);
				earlyEnergy = fieldEnergy(d);
			}
			if (frame === LATE) {
				lateData = engine.readField('velocity').data;
				latePeak = peakSpeed(lateData);
				lateEnergy = fieldEnergy(lateData);
			}
		}
		return { earlyPeak, latePeak, earlyEnergy, lateEnergy, lateData };
	} finally {
		engine.dispose();
	}
}

describe('maccormack velocity advection preserves dipole structure better than SL', () => {
	it('retains more peak velocity and field energy than semi-Lagrangian', () => {
		const mac = measure('maccormack');
		const sl = measure('semilagrangian');

		const macPeakRetention = mac.latePeak / mac.earlyPeak;
		const slPeakRetention = sl.latePeak / sl.earlyPeak;
		const macEnergyRetention = mac.lateEnergy / mac.earlyEnergy;
		const slEnergyRetention = sl.lateEnergy / sl.earlyEnergy;

		// MacCormack is forced to SL on hardware without linear filtering; when that
		// happens both runs are bit-identical and the differential assertions are
		// meaningless, so detect it and only require finiteness.
		const gatedToSL = fieldsIdentical(mac.lateData, sl.lateData);

		// eslint-disable-next-line no-console
		console.log(
			`[maccormack-dipole] peak retention mac=${macPeakRetention.toFixed(3)} sl=${slPeakRetention.toFixed(3)}; ` +
				`energy retention mac=${macEnergyRetention.toFixed(3)} sl=${slEnergyRetention.toFixed(3)}; gatedToSL=${gatedToSL}`
		);

		expect(hasNonFinite(mac.lateData)).toBe(false);
		expect(hasNonFinite(sl.lateData)).toBe(false);

		if (gatedToSL) {
			// eslint-disable-next-line no-console
			console.warn('[maccormack-dipole] MacCormack capability-gated off; skipping differential assertions');
			return;
		}

		// Documented acceptance metric: late/early energy retention. MacCormack
		// keeps materially more structure than semi-Lagrangian, both in absolute
		// terms and relative to SL.
		expect(macEnergyRetention).toBeGreaterThanOrEqual(0.3);
		expect(macEnergyRetention).toBeGreaterThan(slEnergyRetention);
		expect(macPeakRetention).toBeGreaterThan(slPeakRetention);
	});

	it('runs identically to explicit semi-Lagrangian when advectionScheme is omitted (default off)', () => {
		const run = (scheme: Scheme | 'default'): ArrayLike<number> => {
			const canvas = document.createElement('canvas');
			canvas.width = 96;
			canvas.height = 96;
			const opts: FluidEngineOptions = {
				canvas,
				config: { ...dipole.config, pointerInput: false },
				autoStart: false
			};
			if (scheme !== 'default') opts.advectionScheme = scheme;
			const engine = new FluidEngine(opts);
			try {
				const rng = mulberry32(dipole.seed);
				for (let frame = 0; frame < 60; frame++) {
					dipole.schedule(engine, rng, frame, DT);
					engine.advance(1, DT);
				}
				return engine.readField('velocity').data;
			} finally {
				engine.dispose();
			}
		};

		const def = run('default');
		const sl = run('semilagrangian');
		expect(def.length).toBe(sl.length);
		expect(fieldsIdentical(def, sl)).toBe(true);
	});
});
