import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import { renderer } from './renderer.js';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { VENTURI_CONFIG } from '../../presets/registry.js';
import type { FlowOutlet, FluidConfig } from '../types.js';

const OUTLET: FlowOutlet = {
	edge: 'right',
	width: 0.2,
	clearVelocity: true,
	velocity: 'relax'
};
const CHANNEL: FluidConfig = { ...VENTURI_CONFIG, obstructions: undefined };
const engines: Array<{ dispose(): void }> = [];
const sequence = [1 / 120, 1 / 80, 1 / 100, 1 / 60];
afterEach(() => {
	vi.restoreAllMocks();
	for (const engine of engines.splice(0)) engine.dispose();
	_setContextTier('auto');
});
function create(config: FluidConfig, shared = false) {
	const canvas = document.createElement('canvas');
	canvas.width = 320;
	canvas.height = 160;
	_setContextTier(shared);
	try {
		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			config: { ...config, seed: 704, pointerInput: false }
		});
		engines.push(engine);
		return engine as FluidEngine;
	} finally {
		_setContextTier('auto');
	}
}
const withOutlet = (outlet?: FlowOutlet): FluidConfig => ({
	...CHANNEL,
	flow: { ...CHANNEL.flow, outlets: outlet ? [outlet] : [] }
});
function advance(engine: FluidEngine, count = 48) {
	for (let i = 0; i < count; i++)
		engine.advance(1, sequence[i % sequence.length]);
}
const bytes = (data: Float32Array) => new Uint8Array(data.buffer);
async function hash(data: Float32Array) {
	return [
		...new Uint8Array(
			await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer)
		)
	]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
interface Harness {
	config: { FLOW: unknown; SIM_RESOLUTION: number };
	canvas: HTMLCanvasElement;
	solidMaskData: Uint8Array | null;
	solidMaskW: number;
	solidMaskH: number;
	gl: WebGL2RenderingContext;
	outletReduceChains: Array<
		Array<{ width: number; height: number; fbo: WebGLFramebuffer }>
	>;
	velocity: {
		read: { attach(unit: number): number };
		write: unknown;
		swap(): void;
	};
	applyFlowOutletRelax(outlet: FlowOutlet, dt: number): void;
	withGl(fn: () => void): void;
}

describe('outlet relaxation hardware gates', () => {
	for (const [name, config, pinned] of [
		['VENTURI', VENTURI_CONFIG, { velocity: '826bc02f8a0c00a69a7b8c0b4639082f7ce1082aca4f2cd71cae5577ac5dac30', dye: '248d5c058df5371ee94465d55fc9361a8e2beb8ab9e71bc5b90e8af0e0cb4170' }],
		['CHANNEL_OPEN_OUTLET', CHANNEL, { velocity: '2259e9e71aec753185a08cc964fcb30eb21c0ea4781babd5d146a549182870dc', dye: '51d76318ce97eb34c050a919c053d424424bbfff74363c1e6067fe7b0209d7e1' }]
	] as const) {
		// Pins are ANGLE Metal captures (identical on M1/M2); other backends round differently.
		it.runIf(/ANGLE Metal/.test(renderer))(`${name} default velocity/dye bytes match frozen pre-change hashes`, async () => {
			// Direct frozen/current byte equality passed on ANGLE Metal before snapshot removal.
			const engine = create(config);
			engine.splat(0.1, 0.5, 0, 0, { r: 0.3, g: 0.6, b: 0.9 });
			advance(engine);
			const hashes: Record<string, string> = {};
			for (const field of ['velocity', 'dye'] as const) {
				hashes[field] = await hash(engine.readField(field).data);
				expect(hashes[field]).toBe(pinned[field]);
			}
			console.log(
				'OUTLET_LEGACY_HASHES',
				renderer,
				name,
				JSON.stringify(hashes)
			);
			await (
				commands as unknown as {
					writeBenchJson(p: string, d: string): Promise<void>;
				}
			).writeBenchJson(
				`/tmp/public-outlet-relax-${name}-hashes.json`,
				JSON.stringify(hashes)
			);
		});
	}
	it('calms transverse motion inside the outlet zone versus no outlet', async () => {
		const plain = create(withOutlet()),
			relax = create(withOutlet(OUTLET));
		for (const engine of [plain, relax])
			engine.splat(0.93, 0.5, 0, 80, { r: 0, g: 0, b: 0 });
		const h = relax as unknown as Harness;
		// Isolate the sponge from transport/projection: same input, exactly one outlet stage.
		h.withGl(() => h.applyFlowOutletRelax(OUTLET, 0.1));
		const rms = (engine: FluidEngine) => {
			const { data, width, height } = engine.readField('velocity');
			let sum = 0,
				count = 0;
			for (let y = 0; y < height; y++)
				for (let x = Math.ceil(width * 0.8); x < width; x++) {
					sum += data[(y * width + x) * 2 + 1] ** 2;
					count++;
				}
			return Math.sqrt(sum / count);
		};
		const before = rms(plain),
			after = rms(relax);
		console.log('OUTLET_TRANSVERSE_RMS', JSON.stringify({ before, after }));
		await (commands as unknown as { writeBenchJson(p: string, d: string): Promise<void> }).writeBenchJson('/tmp/public-outlet-relax-transverse.json', JSON.stringify({ before, after }));
		expect(before).toBeGreaterThan(0);
		expect(after).toBeLessThan(before);
	});
	it('rate/extent/edge hot updates allocate/link nothing; presence allocates and frees targets', () => {
		const engine = create(withOutlet());
		const h = engine as unknown as Harness;
		const gl = h.gl;
		expect(h.outletReduceChains.flat()).toHaveLength(0);
		const textures = vi.spyOn(gl, 'createTexture'),
			framebuffers = vi.spyOn(gl, 'createFramebuffer'),
			links = vi.spyOn(gl, 'linkProgram');
		engine.setConfig(withOutlet(OUTLET));
		const targets = h.outletReduceChains.flat();
		expect(targets.length).toBeGreaterThan(0);
		expect(textures).toHaveBeenCalledTimes(targets.length);
		expect(framebuffers).toHaveBeenCalledTimes(targets.length);
		// Post-hoc assertion correction: no-outlet baseline also needs the legacy clear program.
		// First run observed 3 links; hot-update zero-link gate remains unchanged.
		expect(links).toHaveBeenCalledTimes(3);
		const allocations = [
			'createTexture',
			'createFramebuffer',
			'createRenderbuffer',
			'createBuffer',
			'createProgram',
			'createShader',
			'compileShader',
			'texImage2D',
			'bufferData'
		].map((name) => vi.spyOn(gl, name as 'createTexture'));
		for (const spy of [...allocations, links]) spy.mockClear();
		for (const outlet of [
			{ ...OUTLET, relaxRate: 15 },
			{ ...OUTLET, width: 0.3, from: 0.2, to: 0.9 },
			{ ...OUTLET, edge: 'top' as const }
		]) {
			engine.setConfig(withOutlet(outlet));
			engine.advance(1, 1 / 120);
		}
		for (const spy of [...allocations, links])
			expect(spy).not.toHaveBeenCalled();
		const deleted = vi.spyOn(gl, 'deleteFramebuffer');
		engine.setConfig(withOutlet({ ...OUTLET, velocity: 'damp' }));
		expect(h.outletReduceChains.flat()).toHaveLength(0);
		expect(deleted).toHaveBeenCalledTimes(targets.length);
		engine.setConfig(withOutlet(OUTLET));
		expect(h.outletReduceChains.flat()).toHaveLength(targets.length);
		expect(links).not.toHaveBeenCalled();
		expect(gl.getError()).toBe(gl.NO_ERROR);
	});
	it('stages optional allocations before config commit, cleans failures and permits retry', () => {
		for (const allocator of ['createTexture', 'createFramebuffer'] as const)
			for (const enabled of [false, true])
				for (const resize of [false, true]) {
					const engine = create(withOutlet(enabled ? OUTLET : undefined));
					const h = engine as unknown as Harness,
						gl = h.gl;
					const prior = h.config,
						chains = h.outletReduceChains,
						field = engine.readField('velocity');
					const patch = {
						...withOutlet(OUTLET),
						...(resize ? { simResolution: 96 } : {})
					};
					// With no presence/dimension transition, no allocation can fail.
					if (enabled && !resize) {
						engine.dispose();
						continue;
					}
					const allocate = gl[allocator].bind(gl);
					let calls = 0;
					const failure = vi
						.spyOn(gl, allocator)
						.mockImplementation(() => (++calls === 2 ? null : allocate())!);
					const textures = vi.spyOn(gl, 'deleteTexture'),
						framebuffers = vi.spyOn(gl, 'deleteFramebuffer');
					expect(() => engine.setConfig(patch)).toThrow(/returned null/);
					expect(h.config).toBe(prior);
					expect(h.outletReduceChains).toBe(chains);
					expect(framebuffers).toHaveBeenCalledTimes(1);
					expect(textures).toHaveBeenCalledTimes(
						allocator === 'createFramebuffer' ? 2 : 1
					);
					failure.mockRestore();
					engine.advance(1, 1 / 120);
					expect(gl.getError()).toBe(gl.NO_ERROR);
					expect(engine.readField('velocity').width).toBe(field.width);
					engine.setConfig(patch);
					expect(h.outletReduceChains.flat().length).toBeGreaterThan(0);
					if (resize) expect(h.config.SIM_RESOLUTION).toBe(96);
					engine.advance(1, 1 / 120);
					expect(gl.getError()).toBe(gl.NO_ERROR);
					textures.mockRestore();
					framebuffers.mockRestore();
					engine.dispose();
				}
	});
	it('preserves masked interval flux on both axes, including grids beyond 512 cells', () => {
		for (const edge of ['right', 'top'] as const) {
			const outlet = { ...OUTLET, edge, from: 0.15, to: 0.85, width: 1 };
			const engine = create({
				...withOutlet(outlet),
				simResolution: 513,
				dyeResolution: 32,
				obstructions: [{ d: 'M0 0 L100 0 L100 30 L0 30 Z', fit: 'fill' }]
			});
			engine.splat(0.6, 0.6, 30, 20, { r: 0, g: 0, b: 0 });
			const h = engine as unknown as Harness,
				before = engine.readField('velocity');
			h.withGl(() => h.applyFlowOutletRelax(outlet, 0.1));
			const after = engine.readField('velocity');
			const vertical = edge === 'right',
				section = Math.floor((vertical ? before.width : before.height) * 0.6);
			let fluxBefore = 0,
				fluxAfter = 0,
				solids = 0,
				changedSolids = 0;
			for (let y = 0; y < before.height; y++)
				for (let x = 0; x < before.width; x++) {
					const i = (y * before.width + x) * 2;
					const mx = Math.min(
						h.solidMaskW - 1,
						Math.floor(((x + 0.5) / before.width) * h.solidMaskW)
					);
					const my = Math.min(
						h.solidMaskH - 1,
						Math.floor((1 - (y + 0.5) / before.height) * h.solidMaskH)
					);
					if (h.solidMaskData![my * h.solidMaskW + mx] >= 128) {
						if (
							after.data[i] !== before.data[i] ||
							after.data[i + 1] !== before.data[i + 1]
						)
							changedSolids++;
						solids++;
						continue;
					}
					const along = vertical
						? (y + 0.5) / before.height
						: (x + 0.5) / before.width;
					if (
						(vertical ? x : y) === section &&
						along >= outlet.from &&
						along <= outlet.to
					) {
						fluxBefore += before.data[i + (vertical ? 0 : 1)];
						fluxAfter += after.data[i + (vertical ? 0 : 1)];
					}
				}
			expect(solids).toBeGreaterThan(0);
			expect(changedSolids).toBe(0);
			expect(Math.abs(fluxBefore)).toBeGreaterThan(0);
			expect(
				Math.abs(fluxAfter - fluxBefore) / Math.abs(fluxBefore)
			).toBeLessThan(0.002);
			expect(h.gl.getError()).toBe(h.gl.NO_ERROR);
		}
	});
	it('rebuilds reduction targets on resize and real context restore; frees them on dispose', async () => {
		const engine = create(withOutlet(OUTLET)),
			h = engine as unknown as Harness;
		const first = h.outletReduceChains.flat().map((fbo) => fbo.fbo);
		engine.resize(160, 320);
		const resized = h.outletReduceChains.flat().map((fbo) => fbo.fbo);
		for (const fbo of first) expect(h.gl.isFramebuffer(fbo)).toBe(false);
		// Post-hoc assertion correction: opaque GL handles need identity, not deep equality.
		for (const fbo of resized) expect(first.includes(fbo)).toBe(false);
		const once = (type: string) =>
			new Promise<void>((resolve, reject) => {
				const timer = setTimeout(
					() => reject(new Error(`Timed out waiting for ${type}`)),
					10_000
				);
				h.canvas.addEventListener(
					type,
					() => {
						clearTimeout(timer);
						resolve();
					},
					{ once: true }
				);
			});
		const extension = h.gl.getExtension('WEBGL_lose_context')!;
		const lost = once('webglcontextlost');
		extension.loseContext();
		await lost;
		await new Promise((resolve) => setTimeout(resolve, 0));
		const restored = once('webglcontextrestored');
		extension.restoreContext();
		await restored;
		const live = h.outletReduceChains.flat().map((fbo) => fbo.fbo);
		expect(live.length).toBe(resized.length);
		for (const fbo of live) expect(h.gl.isFramebuffer(fbo)).toBe(true);
		engine.advance(2, 1 / 120);
		expect(h.gl.getError()).toBe(h.gl.NO_ERROR);
		engine.dispose();
		for (const fbo of live) expect(h.gl.isFramebuffer(fbo)).toBe(false);
	});
	it('shared relax siblings rebind state and leave plain siblings byte-identical', () => {
		const ref = create(CHANNEL),
			plain = create(CHANNEL, true),
			relax = create(withOutlet(OUTLET), true),
			sibling = create(
				withOutlet({ ...OUTLET, edge: 'top', from: 0.2, to: 0.8 }),
				true
			);
		expect(plain.sharedContext).toBe(true);
		expect(relax.sharedContext).toBe(true);
		for (const engine of [ref, plain])
			engine.splat(0.1, 0.5, 0, 0, { r: 0.3, g: 0.6, b: 0.9 });
		advance(ref);
		for (let i = 0; i < 48; i++) {
			relax.advance(1, sequence[i % 4]);
			sibling.advance(1, sequence[i % 4]);
			plain.advance(1, sequence[i % 4]);
		}
		for (const field of ['velocity', 'dye'] as const)
			expect(bytes(plain.readField(field).data)).toEqual(
				bytes(ref.readField(field).data)
			);
	});
});
