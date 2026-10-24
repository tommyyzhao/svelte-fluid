import { expect, it } from 'vitest';
import { TUNINGS } from '../tunings.js';

it.each([
	['paper-forward', 'paper-forward-re200-tracers'],
	['paper-reverse', 'paper-reverse-re200-tracers'],
	['paper-reverse-re400', 'paper-reverse-re400-tracers']
])('%s tracer sibling changes only passive rendering', (parentId, tracerId) => {
	const parent = TUNINGS.find((t) => t.id === parentId)!;
	const tracer = TUNINGS.find((t) => t.id === tracerId)!;
	expect(tracer.mac).toEqual({ ...parent.mac, dye: 'tracers' });
	for (const key of [
		'config',
		'prerollSeconds',
		'dyePrerollSeconds',
		'stepsPerFrame'
	] as const)
		expect(tracer[key]).toEqual(parent[key]);
	expect(tracer.description).toContain('not a concentration measurement');
	expect(parent.mac?.dye).toBeUndefined();
});

it('preserves every non-paper variant byte for byte', async () => {
	const data = JSON.stringify(
		TUNINGS.filter(({ id }) => !id.startsWith('paper-'))
	);
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(data)
	);
	expect(
		[...new Uint8Array(digest)]
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join('')
	).toBe('990783045bd65cb22ed1a6951ec931c0344de0c8a25d387641f46ec93047505e');
});
