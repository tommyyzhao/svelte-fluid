import { mulberry32 } from './rng.js';
import type { PresetSplat } from './types.js';

/**
 * Opening impulses for FluidDistortion. Seeded so the same `seed` reproduces
 * the same scene, and bounded to 0-64 so a hostile `initialSplats` cannot
 * allocate unbounded arrays.
 */
export function createDistortionPresetSplats(seed: number, count: number): PresetSplat[] | undefined {
	const total = Number.isFinite(count) ? Math.max(0, Math.min(64, Math.floor(count))) : 0;
	if (total === 0) return undefined;
	const random = mulberry32(seed);
	const splats: PresetSplat[] = [];
	for (let index = 0; index < total; index += 1) {
		const angle = random() * Math.PI * 2;
		const speed = 4000 + random() * 4000;
		splats.push({
			x: random(),
			y: random(),
			dx: Math.cos(angle) * speed,
			dy: Math.sin(angle) * speed,
			color: { r: 0.15, g: 0, b: 0 }
		});
	}
	return splats;
}
