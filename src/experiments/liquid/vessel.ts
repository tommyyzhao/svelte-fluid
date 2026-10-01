import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';
import { VESSEL_CENTER_Y, VESSEL_VIEW_WIDTH, vesselComposite, vesselCompute, vesselParticles, vesselSmooth } from './vessel-shaders.js';
import { presentationSize } from './presentation-size.js';

const NX = 24;
const NY = 10;
const NZ = 16;
const COUNT = NX * NY * NZ;
const SPACING = 0.115;
const H = 0.22;
const CELLS = 17 * 13 * 11;
const CAPACITY = 32;
const PARTICLE_BYTES = COUNT * 16;
const MASS = COUNT * SPACING ** 3;
const RIGHT = [0.8944272, 0, -0.4472136];
const UP = [-0.2581989, 0.8164966, -0.5163978];
const TOWARD = [0.3651484, 0.5773503, 0.7302967];
const ATTACHMENT_BYTES_PER_PIXEL = 18; // r32 + depth32 + r16 + two r32 smoothing targets.
const NOMINAL_RENDER_BYTES_PER_PIXEL = ATTACHMENT_BYTES_PER_PIXEL + 4; // Include the caller's RGBA8/BGRA8 output.
const STEADY_BYTES_LIMIT = 256 * 1024 ** 2;
const TRANSITION_BYTES_LIMIT = 384 * 1024 ** 2;

function kernel(distanceSquared: number): number {
	return 315 / (64 * Math.PI * H ** 9) * Math.max(0, H * H - distanceSquared) ** 3;
}

// Calibrate against this actual lattice rather than guessing a density constant.
let restKernel = 0;
for (let z = -2; z <= 2; z++) {
	for (let y = -2; y <= 2; y++) {
		for (let x = -2; x <= 2; x++) {
			restKernel += kernel(SPACING ** 2 * (x * x + y * y + z * z));
		}
	}
}

/** Fixed-population, fixed-box experiment. Units are metres and seconds, density 1.
 * Three projection iterations are a measurable compression/performance tradeoff,
 * not a claim of converged incompressibility. Box walls clamp particle centres;
 * this first experiment does not model no-slip ghost particles or surface tension.
 */
export async function createVessel(device: GPUDevice, format: GPUTextureFormat): Promise<LiquidExperiment> {
	const ownedBuffers: GPUBuffer[] = [];
	const createBuffer = (label: string, size: number, usage: GPUBufferUsageFlags): GPUBuffer => {
		const buffer = device.createBuffer({ label: `liquid-vessel/${label}`, size, usage });
		ownedBuffers.push(buffer);
		return buffer;
	};
	const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
	const positions = createBuffer('positions', PARTICLE_BYTES, usage);
	const velocities = createBuffer('velocities', PARTICLE_BYTES, usage);
	const predictions = [createBuffer('prediction-a', PARTICLE_BYTES, usage), createBuffer('prediction-b', PARTICLE_BYTES, usage)];
	const lambdas = createBuffer('multipliers', COUNT * 4, usage);
	const counts = createBuffer('cell-counts', CELLS * 4, usage);
	const entries = createBuffer('cell-members', CELLS * CAPACITY * 4, usage);
	const overflow = createBuffer('overflow-high-water', 4, usage);
	const uniform = createBuffer('parameters', 64, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
	const bufferBytes = ownedBuffers.reduce((sum, buffer) => sum + buffer.size, 0);
	const modules = [vesselCompute(COUNT, restKernel), vesselParticles, vesselSmooth, vesselComposite].map((code, i) => device.createShaderModule({ label: `liquid-vessel/module-${i}`, code }));
	try {
		for (const module of modules) {
			const errors = (await module.getCompilationInfo()).messages.filter((message) => message.type === 'error');
			if (errors.length) throw new Error(errors.map((message) => `${message.lineNum}:${message.linePos} ${message.message}`).join('\n'));
		}
	} catch (error) {
		ownedBuffers.forEach((buffer) => buffer.destroy());
		throw error;
	}
	const computeLayout = device.createBindGroupLayout({
		entries: Array.from({ length: 9 }, (_, binding) => ({
			binding, visibility: GPUShaderStage.COMPUTE,
			buffer: { type: binding === 0 ? 'uniform' as const : 'storage' as const }
		}))
	});
	const computePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [computeLayout] });
	const computeEntries = ['predict', 'clearGrid', 'buildGrid', 'density', 'project', 'reconstruct', 'viscosity'] as const;
	const pipelines = Object.fromEntries(await Promise.all(computeEntries.map(async (entryPoint) => [entryPoint,
		await device.createComputePipelineAsync({ label: `liquid-vessel/${entryPoint}`, layout: computePipelineLayout, compute: { module: modules[0], entryPoint } })
	]))) as Record<(typeof computeEntries)[number], GPUComputePipeline>;
	const groups = [0, 1].map((index) => device.createBindGroup({
		layout: computeLayout,
		entries: [uniform, positions, velocities, predictions[index], predictions[1 - index], lambdas, counts, entries, overflow]
			.map((buffer, binding) => ({ binding, resource: { buffer } }))
	}));
	const particleLayout = device.createBindGroupLayout({ entries: [
		{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
		{ binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }
	] });
	const particlePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [particleLayout] });
	const particleGroup = device.createBindGroup({ layout: particleLayout, entries: [
		{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: positions } }
	] });
	const depthPipeline = await device.createRenderPipelineAsync({
		label: 'liquid-vessel/particle-depth', layout: particlePipelineLayout,
		vertex: { module: modules[1], entryPoint: 'vertex' },
		fragment: { module: modules[1], entryPoint: 'depthFragment', targets: [{ format: 'r32float' }] },
		depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
	});
	const thicknessPipeline = await device.createRenderPipelineAsync({
		label: 'liquid-vessel/particle-thickness', layout: particlePipelineLayout,
		vertex: { module: modules[1], entryPoint: 'vertex' },
		fragment: { module: modules[1], entryPoint: 'thicknessFragment', targets: [{ format: 'r16float', blend: {
			color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
			alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' }
		} }] }
	});
	const smoothLayout = device.createBindGroupLayout({ entries: [
		{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
		{ binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
		{ binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'r32float' } }
	] });
	const smoothPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [smoothLayout] });
	const smoothPipelines = await Promise.all([true, false].map((horizontal) => device.createComputePipelineAsync({
		label: 'liquid-vessel/surface-smoothing', layout: smoothPipelineLayout,
		compute: { module: modules[2], entryPoint: 'filterDepth', constants: { HORIZONTAL: horizontal ? 1 : 0 } }
	})));
	const compositeLayout = device.createBindGroupLayout({ entries: [
		{ binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
		{ binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
		{ binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } }
	] });
	const compositePipeline = await device.createRenderPipelineAsync({
		label: 'liquid-vessel/surface-lighting', layout: device.createPipelineLayout({ bindGroupLayouts: [compositeLayout] }),
		vertex: { module: modules[3], entryPoint: 'vertex' },
		fragment: { module: modules[3], entryPoint: 'fragment', targets: [{ format }] }
	});
	let textures: GPUTexture[] = [];
	let views: GPUTextureView[] = [];
	let smoothGroups: GPUBindGroup[] = [];
	let compositeGroup: GPUBindGroup;
	let width = 0;
	let height = 0;
	let aspect = 10 / 7;
	let disposed = false;
	let inspectionPending = false;
	const parameters = new Float32Array(16);
	parameters[0] = 1 / 120;
	parameters[10] = aspect;
	const zeroVelocities = new Float32Array(COUNT * 4);
	const initial = new Float32Array(COUNT * 4);
	for (let z = 0; z < NZ; z++) {
		for (let y = 0; y < NY; y++) {
			for (let x = 0; x < NX; x++) {
				const index = (x + NX * (y + NY * z)) * 4;
				initial.set([-1.6 + x * SPACING, 0.058 + y * SPACING, (z - (NZ - 1) / 2) * SPACING, 1], index);
			}
		}
	}
	const reset = (): void => {
		if (disposed) return;
		device.queue.writeBuffer(positions, 0, initial);
		device.queue.writeBuffer(velocities, 0, zeroVelocities);
		device.queue.writeBuffer(overflow, 0, new Uint32Array([0]));
	};
	const resize = (targetWidth: number, targetHeight: number): void => {
		if (disposed) return;
		const { width: nextWidth, height: nextHeight } = presentationSize(targetWidth, targetHeight, 1, device.limits.maxTextureDimension2D);
		if (nextWidth === width && nextHeight === height) return;
		const nextPixels = nextWidth * nextHeight;
		const steadyBytes = bufferBytes + nextPixels * NOMINAL_RENDER_BYTES_PER_PIXEL;
		const transitionBytes = bufferBytes + (width * height + nextPixels) * NOMINAL_RENDER_BYTES_PER_PIXEL;
		// Nominal resource sizes, not a driver-memory guarantee. Reserve both old
		// and new targets (including their caller-owned outputs) during replacement.
		if (steadyBytes > STEADY_BYTES_LIMIT || transitionBytes > TRANSITION_BYTES_LIMIT) {
			throw new RangeError(`Native vessel ${nextWidth}×${nextHeight} exceeds its ${steadyBytes > STEADY_BYTES_LIMIT ? '256 MiB steady' : '384 MiB transition'} render budget; no downsampled substitute is used.`);
		}
		const candidateTextures: GPUTexture[] = [];
		try {
			const texture = (label: string, textureFormat: GPUTextureFormat, textureUsage: GPUTextureUsageFlags): void => {
				candidateTextures.push(device.createTexture({ label: `liquid-vessel/${label}`,
					size: [nextWidth, nextHeight], format: textureFormat, usage: textureUsage }));
			};
			const opticalUsage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT;
			texture('linear-depth', 'r32float', opticalUsage);
			texture('depth-test', 'depth32float', GPUTextureUsage.RENDER_ATTACHMENT);
			texture('thickness', 'r16float', opticalUsage);
			texture('smooth-a', 'r32float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING);
			texture('smooth-b', 'r32float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING);
			const candidateViews = candidateTextures.map((texture) => texture.createView());
			const candidateSmoothGroups = [[0, 3], [3, 4], [4, 3]].map(([input, output]) => device.createBindGroup({
				layout: smoothLayout, entries: [
					{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: candidateViews[input] }, { binding: 2, resource: candidateViews[output] }
				]
			}));
			const candidateComposite = device.createBindGroup({ layout: compositeLayout, entries: [
				{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: candidateViews[4] }, { binding: 2, resource: candidateViews[2] }
			] });
			const nextParameters = parameters.slice();
			nextParameters[8] = nextWidth; nextParameters[9] = nextHeight; nextParameters[10] = nextWidth / nextHeight;
			device.queue.writeBuffer(uniform, 0, nextParameters);
			const previousTextures = textures;
			textures = candidateTextures; views = candidateViews; smoothGroups = candidateSmoothGroups; compositeGroup = candidateComposite;
			width = nextWidth; height = nextHeight; aspect = nextWidth / nextHeight;
			parameters.set(nextParameters);
			previousTextures.forEach((texture) => texture.destroy());
		} catch (error) {
			candidateTextures.forEach((texture) => texture.destroy());
			throw error;
		}
	};
	reset();
	return {
		get memoryBytes(): number { return bufferBytes + width * height * ATTACHMENT_BYTES_PER_PIXEL; },
		reset,
		resize,
		step(encoder: GPUCommandEncoder, dt: number, input: LiquidInput): void {
			if (disposed || dt <= 0) return;
			parameters[0] = Math.min(dt, 1 / 60);
			parameters[1] = input.active ? 1 : 0;
			parameters[2] = Math.max(-1, Math.min(1, input.tilt));
			// Intersect the view ray with the submerged paddle plane at y = 0.6.
			const sx = (input.x - 0.5) * VESSEL_VIEW_WIDTH;
			const sy = (0.5 - input.y) * VESSEL_VIEW_WIDTH / aspect;
			const rayY = VESSEL_CENTER_Y + sy * UP[1];
			const distance = (rayY - 0.6) / TOWARD[1];
			parameters[4] = sx * RIGHT[0] + sy * UP[0] - distance * TOWARD[0];
			parameters[5] = sx * RIGHT[2] + sy * UP[2] - distance * TOWARD[2];
			const dxView = input.vx * VESSEL_VIEW_WIDTH;
			const dyView = -input.vy * VESSEL_VIEW_WIDTH / aspect;
			const vx = dxView * RIGHT[0] + dyView * (UP[0] - TOWARD[0] * UP[1] / TOWARD[1]);
			const vz = dxView * RIGHT[2] + dyView * (UP[2] - TOWARD[2] * UP[1] / TOWARD[1]);
			const speedScale = Math.min(1, 5 / Math.max(0.00001, Math.hypot(vx, vz)));
			parameters[6] = vx * speedScale; parameters[7] = vz * speedScale;
			device.queue.writeBuffer(uniform, 0, parameters);
			const pass = encoder.beginComputePass({ label: 'liquid-vessel/PBF-step' });
			const dispatch = (name: (typeof computeEntries)[number], group: number, work = COUNT): void => {
				pass.setPipeline(pipelines[name]); pass.setBindGroup(0, groups[group]); pass.dispatchWorkgroups(Math.ceil(work / 64));
			};
			dispatch('predict', 0);
			let current = 0;
			for (let iteration = 0; iteration < 3; iteration++) {
				dispatch('clearGrid', current, CELLS); dispatch('buildGrid', current);
				dispatch('density', current); dispatch('project', current);
				current = 1 - current;
			}
			dispatch('clearGrid', current, CELLS); dispatch('buildGrid', current);
			dispatch('reconstruct', current); dispatch('viscosity', current);
			pass.end();
			encoder.copyBufferToBuffer(predictions[1 - current], 0, velocities, 0, PARTICLE_BYTES);
		},
		render(encoder: GPUCommandEncoder, target: GPUTextureView): void {
			if (disposed) return;
			if (!textures.length) throw new Error('Resize vessel to its native presentation dimensions before rendering.');
			const depth = encoder.beginRenderPass({
				label: 'liquid-vessel/depth',
				colorAttachments: [{ view: views[0], clearValue: [12, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }],
				depthStencilAttachment: { view: views[1], depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' }
			});
			depth.setPipeline(depthPipeline); depth.setBindGroup(0, particleGroup); depth.draw(6, COUNT); depth.end();
			const thickness = encoder.beginRenderPass({
				label: 'liquid-vessel/thickness',
				colorAttachments: [{ view: views[2], clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }]
			});
			thickness.setPipeline(thicknessPipeline); thickness.setBindGroup(0, particleGroup); thickness.draw(6, COUNT); thickness.end();
			const smoothing = encoder.beginComputePass({ label: 'liquid-vessel/surface' });
			for (let i = 0; i < 6; i++) {
				smoothing.setPipeline(smoothPipelines[i % 2]);
				smoothing.setBindGroup(0, smoothGroups[i === 0 ? 0 : i % 2 === 1 ? 1 : 2]);
				smoothing.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
			}
			smoothing.end();
			const composite = encoder.beginRenderPass({ label: 'liquid-vessel/composite', colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
			composite.setPipeline(compositePipeline); composite.setBindGroup(0, compositeGroup); composite.draw(3); composite.end();
		},
		async inspect(): Promise<LiquidSnapshot> {
			if (disposed) throw new Error('Vessel is disposed.');
			if (inspectionPending) throw new Error('Vessel inspection is already pending.');
			inspectionPending = true;
			const staging = device.createBuffer({ size: PARTICLE_BYTES * 2 + 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
			try {
				const encoder = device.createCommandEncoder();
				encoder.copyBufferToBuffer(positions, 0, staging, 0, PARTICLE_BYTES);
				encoder.copyBufferToBuffer(velocities, 0, staging, PARTICLE_BYTES, PARTICLE_BYTES);
				encoder.copyBufferToBuffer(overflow, 0, staging, PARTICLE_BYTES * 2, 4);
				device.queue.submit([encoder.finish()]);
				await staging.mapAsync(GPUMapMode.READ);
				const data = staging.getMappedRange();
				const p = new Float32Array(data, 0, COUNT * 4);
				const v = new Float32Array(data, PARTICLE_BYTES, COUNT * 4);
				const neighborOverflow = new Uint32Array(data, PARTICLE_BYTES * 2, 1)[0];
				let finite = true; let outOfBounds = 0; let kinetic = 0; let maxHeight = 0; let centroidX = 0; let centroidZ = 0;
				const cells = new Map<string, number[]>();
				for (let i = 0; i < COUNT; i++) {
					const j = i * 4; const x = p[j]; const y = p[j + 1]; const z = p[j + 2];
					if (![x, y, z, v[j], v[j + 1], v[j + 2]].every(Number.isFinite)) { finite = false; continue; }
					if (x < -1.801 || x > 1.801 || y < 0.054 || y > 2.701 || z < -1.201 || z > 1.201) outOfBounds++;
					kinetic += v[j] ** 2 + v[j + 1] ** 2 + v[j + 2] ** 2;
					maxHeight = Math.max(maxHeight, y);
					centroidX += x; centroidZ += z;
					const key = `${Math.floor(x / H)},${Math.floor(y / H)},${Math.floor(z / H)}`;
					const bucket = cells.get(key);
					if (bucket) bucket.push(i); else cells.set(key, [i]);
				}
				let min = Infinity; let max = 0; let compression = 0; let occupiedVolume = 0;
				for (let i = 0; i < COUNT; i++) {
					const j = i * 4; const cx = Math.floor(p[j] / H); const cy = Math.floor(p[j + 1] / H); const cz = Math.floor(p[j + 2] / H);
					let density = 0;
					for (let z = cz - 1; z <= cz + 1; z++) for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
						for (const n of cells.get(`${x},${y},${z}`) ?? []) {
							const k = n * 4;
							density += kernel((p[j] - p[k]) ** 2 + (p[j + 1] - p[k + 1]) ** 2 + (p[j + 2] - p[k + 2]) ** 2);
						}
					}
					const ratio = density / restKernel;
					min = Math.min(min, ratio); max = Math.max(max, ratio);
					compression += Math.max(0, ratio - 1);
					occupiedVolume += SPACING ** 3 / Math.max(ratio, 0.01);
				}
				return {
					finite, mass: MASS, initialMass: MASS, min, max, kinetic: 0.5 * kinetic * SPACING ** 3,
					details: {
						particleCount: COUNT, outOfBounds, neighborOverflow, maxHeight, centroidX: centroidX / COUNT, centroidZ: centroidZ / COUNT,
						meanDensityError: compression / COUNT, maxCompression: Math.max(0, max - 1),
						occupiedVolume, rmsVelocity: Math.sqrt(kinetic / COUNT), restKernel,
						// Free-surface kernel deficiency makes occupiedVolume an estimate, not conserved volume.
						volumeEstimateRatio: occupiedVolume / MASS
					}
				};
			} finally {
				staging.destroy(); inspectionPending = false;
			}
		},
		dispose(): void {
			if (disposed) return;
			disposed = true;
			ownedBuffers.forEach((buffer) => buffer.destroy()); textures.forEach((texture) => texture.destroy());
		}
	};
}
