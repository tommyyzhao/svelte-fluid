import { describe, expect, it } from 'vitest';
import { isTerminalFailure } from './gpu-support.js';
import fluidSrc from '../Fluid.svelte?raw';

describe('asset-failed recovery', () => {
	it('treats asset failure as non-terminal and capability failures as terminal', () => {
		expect(isTerminalFailure(null)).toBe(false);
		expect(isTerminalFailure('asset-failed')).toBe(false);
		for (const r of ['no-webgpu', 'no-adapter', 'software-adapter', 'device-lost', 'runtime-failed'] as const)
			expect(isTerminalFailure(r)).toBe(true);
	});

	it('instantiate() gates on terminal failures only and clears a stale asset error', () => {
		expect(fluidSrc).toContain('isTerminalFailure(failureReason)');
		expect(fluidSrc).not.toContain('initializing || failureReason');
		expect(fluidSrc).toContain("if (lastError?.reason === 'asset-failed') lastError = null;");
	});
});
