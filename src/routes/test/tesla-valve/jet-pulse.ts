import type { FlowConfig, FluidHandle, RGB } from '$lib/engine/types.js';
import { watchReducedMotion } from '$lib/engine/reduced-motion.js';

export const JET_DYES = [
	{ r: 0.06, g: 0.18, b: 0.24 },
	{ r: 0.24, g: 0.06, b: 0.18 },
	{ r: 0.24, g: 0.18, b: 0.06 }
] as const;

export const INITIAL_JET_DYE = JET_DYES[0];

export const SALT_DYES = [
	{ r: 0.002, g: 2.4, b: 1.8 }, // Copper blue-green.
	{ r: 1.8, g: 0.002, b: 2.4 }, // Potassium lilac.
	{ r: 2.4, g: 1.2, b: 0.002 } // Sodium amber.
] as const;

export interface JetPulse {
	base: number;
	peak: number;
	palette?: readonly RGB[];
	clockCap: number;
}

export function jetVelocity(seconds: number, base: number, peak: number): number {
	return base + (peak - base) * Math.max(0, Math.cos((2 * Math.PI * seconds) / 1.2)) ** 12;
}

export function jetFlow(
	flow: FlowConfig,
	seconds: number,
	base: number,
	peak: number,
	palette: readonly RGB[] | boolean = false
): FlowConfig {
	let dye: RGB | undefined;
	if (palette) {
		const colors = palette === true ? JET_DYES : palette;
		const phase = ((((seconds % 6) + 6) % 6) * colors.length) / 6;
		const from = colors[Math.floor(phase)];
		const to = colors[(Math.floor(phase) + 1) % colors.length];
		const mix = phase % 1;
		dye = {
			r: from.r + (to.r - from.r) * mix,
			g: from.g + (to.g - from.g) * mix,
			b: from.b + (to.b - from.b) * mix
		};
	}
	return {
		...flow,
		sources: flow.sources!.map((source) => ({
			...source,
			...(dye ? { dye } : {}),
			velocity: { ...source.velocity!, x: jetVelocity(seconds, base, peak) }
		}))
	};
}

/** Route-only clock: approximate the solver's capped active step, not exact synchronization. */
export function startJetPulse(
	flow: FlowConfig,
	base: number,
	peak: number,
	handle: Pick<FluidHandle, 'isPaused'>,
	emit: (flow: FlowConfig) => void,
	palette: readonly RGB[] | boolean = false,
	clockCap = 1 / 60
): () => void {
	let elapsed = 0;
	let previous: number | undefined;
	let stopped = false;
	let reduced = false;
	const resetClock = () => {
		previous = undefined;
	};
	const unsubscribe = watchReducedMotion((value) => {
		reduced = value;
		resetClock();
	});
	document.addEventListener('visibilitychange', resetClock);
	function tick(now: number) {
		if (stopped) return;
		if (handle.isPaused || document.hidden || reduced) {
			resetClock();
		} else {
			if (previous !== undefined) elapsed += Math.min(Math.max(0, (now - previous) / 1000), clockCap);
			previous = now;
			emit(jetFlow(flow, elapsed, base, peak, palette));
		}
		if (!stopped) frame = requestAnimationFrame(tick);
	}
	let frame = requestAnimationFrame(tick);
	return () => {
		stopped = true;
		cancelAnimationFrame(frame);
		document.removeEventListener('visibilitychange', resetClock);
		unsubscribe();
	};
}
