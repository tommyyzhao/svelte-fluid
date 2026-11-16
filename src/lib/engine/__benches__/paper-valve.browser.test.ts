import { expect, it } from 'vitest';
import { PaperMacEngine } from '../../../routes/test/tesla-valve/mac/engine.js';
import {
	PAPER_THRESHOLDS,
	paperDyeMetrics
} from '../../../routes/test/tesla-valve/mac/metrics.js';
import { getTuning } from '../../../routes/test/tesla-valve/tunings.js';

// Long calibration/G1 measurements live beside the route-only engine in
// mac/mac.browser.test.ts. This former collocated bench now guards its replacement.
it('paper valve uses compatible staggered faces and the frozen optical metrics', () => {
	const tuning = getTuning('paper-reverse');
	expect(tuning.mac).toBeDefined();
	const engine = new PaperMacEngine(document.createElement('canvas'), {
		...tuning.mac!,
		width: 240,
		dyeScale: 3,
		pressureSweeps: 16,
		dt: 1 / 120
	});
	try {
		engine.advance(10);
		const metrics = paperDyeMetrics(engine);
		expect(metrics.retention.every(Number.isFinite)).toBe(true);
		expect(metrics.mixed).toHaveLength(11);
		expect(PAPER_THRESHOLDS).toEqual({
			mixed: 0.05,
			bearing: 0.1,
			mixedArea: 0.1,
			retention: 0.9,
			correlation: 0.2
		});
		const columns = engine.readColumns();
		expect([...columns].every(Number.isFinite)).toBe(true);
		expect(engine.geometry.plenum).toBeGreaterThanOrEqual(
			4 * engine.geometry.meanWidth
		);
		expect(engine.gl.getError()).toBe(engine.gl.NO_ERROR);
	} finally {
		engine.dispose();
	}
});
