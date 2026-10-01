import type { LiquidExperiment, LiquidInput, LiquidMode, LiquidSnapshot } from './types.js';
import { presentationSize } from './presentation-size.js';

export interface LabState {
	mode: LiquidMode;
	ready: boolean;
	paused: boolean;
	busy: boolean;
	error: string;
	frameMs: number;
	seconds: number;
	memoryBytes: number;
	pixels: number;
	adapter: string;
}

export interface LabMeasurement {
	batchFrameMs: number;
	snapshot: LiquidSnapshot;
}

/** One page, one active experiment, no production-library dependencies. */
export class LabSession {
	private engine: LiquidExperiment | null = null;
	private frame = 0;
	private disposed = false;
	private generation = 0;
	private previousTime = 0;
	private accumulator = 0;
	private pendingFrames = 0;
	private reportTime = 0;
	private submittedTime = 0;
	private intervals: number[] = [];
	private drag = { x: 0.5, y: 0.5, dx: 0, dy: 0, down: false };
	private dragSeconds = 0;
	private endPointerPending = false;
	private nudgeTime = 0;
	private nudgePoint: { x: number; y: number } | undefined;
	private contact = 0;
	private contactPeak = 0;
	private width = 1;
	private height = 1;
	private cssWidth = 0;
	private cssHeight = 0;
	private presentationError = '';
	private removePixelRatioListener = () => {};
	private tilt = 0;
	private dirty = true;
	readonly state: LabState;

	private constructor(
		private canvas: HTMLCanvasElement,
		private device: GPUDevice,
		private context: GPUCanvasContext,
		private format: GPUTextureFormat,
		adapter: string,
		private notify: (state: LabState) => void
	) {
		this.state = {
			mode: 'film', ready: false, paused: false, busy: false, error: '',
			frameMs: 0, seconds: 0, memoryBytes: 0, pixels: 0, adapter
		};
		device.addEventListener('uncapturederror', (event) => this.fail(event.error.message));
		void device.lost.then((info) => {
			if (!this.disposed) this.fail(`GPU device lost: ${info.message || info.reason}. Reload to restart.`);
		});
		// A monitor/DPR change need not change CSS dimensions, so the wrappers'
		// content-box observers alone cannot keep presentation resolution current.
		const watchPixelRatio = () => {
			this.removePixelRatioListener();
			const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
			const change = () => {
				if (this.disposed) return;
				this.resize(this.cssWidth, this.cssHeight);
				watchPixelRatio();
			};
			query.addEventListener('change', change);
			this.removePixelRatioListener = () => query.removeEventListener('change', change);
		};
		watchPixelRatio();
		document.addEventListener('visibilitychange', this.visibility);
	}

	static async create(canvas: HTMLCanvasElement, notify: (state: LabState) => void,
		alphaMode: GPUCanvasAlphaMode = 'opaque'): Promise<LabSession> {
		if (!navigator.gpu) throw new Error('This experiment needs a browser with WebGPU enabled.');
		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) throw new Error('No WebGPU adapter is available in this browser.');
		const device = await adapter.requestDevice();
		const context = canvas.getContext('webgpu');
		if (!context) { device.destroy(); throw new Error('Could not create a WebGPU canvas.'); }
		const format = navigator.gpu.getPreferredCanvasFormat();
		context.configure({ device, format, alphaMode });
		const name = [adapter.info.vendor, adapter.info.architecture].filter(Boolean).join(' · ') || 'WebGPU adapter';
		const session = new LabSession(canvas, device, context, format, name, notify);
		const { width, height } = canvas.getBoundingClientRect();
		session.resize(width, height);
		return session;
	}

	private publish(): void {
		if (!this.disposed) this.notify({ ...this.state });
	}

	private stopFrame(): void {
		if (this.frame) cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.previousTime = 0;
	}

	private needsFrame(): boolean {
		return Boolean(this.engine && this.state.ready && !this.disposed && !this.state.error &&
			!this.state.busy && !document.hidden && (!this.state.paused || this.dirty));
	}

	/** One callback owner; a clean, hidden, or GPU-blocked session does not poll. */
	private syncFrame(): void {
		if (!this.needsFrame() || this.pendingFrames >= 2) {
			this.stopFrame();
			return;
		}
		if (!this.frame) this.frame = requestAnimationFrame(this.tick);
	}

	private releaseInput(): void {
		this.engine?.endInput?.();
		this.endPointerPending = false;
		this.cancelContact();
		this.drag.down = false;
		this.drag.dx = this.drag.dy = this.dragSeconds = this.accumulator = 0;
		this.submittedTime = 0;
	}

	private visibility = (): void => {
		if (this.disposed) return;
		if (document.hidden) {
			this.releaseInput();
			// Present any released transient load once on return, without evolving
			// retained material or requiring a perpetual hidden RAF listener.
			this.dirty = true;
		}
		this.syncFrame();
	};

	private fail(message: string): void {
		if (this.disposed) return;
		// An in-flight factory may outlive this failure and a later valid resize.
		// Only a new explicit load may recover, never that stale candidate.
		this.generation++;
		this.stopFrame();
		this.state.error = message;
		this.state.ready = false;
		this.publish();
	}

	async select(mode: LiquidMode): Promise<void> {
		if (this.state.busy || this.disposed) return;
		this.state.mode = mode;
		await this.load(async (device, format) => {
			const factory = mode === 'film'
				? (await import('./film.js')).createFilm
				: (await import('./vessel.js')).createVessel;
			return factory(device, format);
		});
	}

	/** Private R&D integration point: the same clock drives DOM-attached films. */
	async load(factory: (device: GPUDevice, format: GPUTextureFormat) => Promise<LiquidExperiment>): Promise<void> {
		if (this.state.busy || this.disposed) return;
		// A rejected native size must not be erased by startup, allowing the old
		// default canvas size to masquerade as a successfully initialized effect.
		if (this.presentationError) { this.fail(this.presentationError); return; }
		const generation = ++this.generation;
		this.stopFrame();
		this.state.ready = false;
		this.state.error = '';
		this.state.seconds = 0;
		this.state.frameMs = 0;
		this.drag.down = false;
		this.endPointerPending = false;
		this.cancelContact();
		this.drag.dx = this.drag.dy = 0;
		this.dragSeconds = 0;
		this.nudgeTime = 0;
		this.publish();
		try {
			await this.device.queue.onSubmittedWorkDone();
			if (generation !== this.generation || this.disposed || this.presentationError) return;
			this.engine?.dispose();
			this.engine = null;
			const candidate = await factory(this.device, this.format);
			if (generation !== this.generation || this.disposed || this.presentationError) { candidate.dispose(); return; }
			this.engine = candidate;
			candidate.resize(this.width, this.height);
			this.state.memoryBytes = candidate.memoryBytes;
			this.state.ready = true;
			this.dirty = true;
			this.previousTime = 0;
			this.submittedTime = 0;
			this.accumulator = 0;
			this.intervals = [];
			this.syncFrame();
			this.publish();
		} catch (error) {
			if (generation === this.generation) this.fail(error instanceof Error ? error.message : String(error));
		}
	}

	resize(cssWidth: number, cssHeight: number): void {
		if (this.state.busy || this.disposed) return;
		this.cssWidth = cssWidth; this.cssHeight = cssHeight;
		try {
			const { width, height } = presentationSize(cssWidth, cssHeight, window.devicePixelRatio,
				this.device.limits.maxTextureDimension2D);
			if (!this.presentationError && this.width === width && this.height === height && this.canvas.width === width && this.canvas.height === height) return;
			this.canvas.width = this.width = width;
			this.canvas.height = this.height = height;
			this.engine?.resize(width, height);
			this.presentationError = '';
			this.dirty = true;
			this.state.pixels = width * height;
			this.state.memoryBytes = this.engine?.memoryBytes ?? 0;
			this.syncFrame();
			this.publish();
		} catch (error) {
			this.presentationError = error instanceof Error ? error.message : String(error);
			this.fail(this.presentationError);
		}
	}

	pointer(x: number, y: number, down: boolean): void {
		if (down && this.endPointerPending) {
			this.engine?.endInput?.(); this.endPointerPending = false;
			// This bounded clock keeps the latest gesture, not a document event log.
			// A new entry cannot inherit the unconsumed velocity of a departed one.
			this.drag.dx = this.drag.dy = 0; this.dragSeconds = 0;
		}
		// A real gesture takes ownership immediately; a previously paused demo
		// must not resume and overwrite the user's next material stroke.
		if (down) this.cancelNudge();
		if (this.drag.down) {
			this.drag.dx += x - this.drag.x;
			this.drag.dy += y - this.drag.y;
		}
		if (this.drag.down && !down) {
			// The release event may itself carry the final new position. Accumulate
			// it before deciding whether the material's endpoint can be discarded.
			if (this.drag.dx !== 0 || this.drag.dy !== 0) this.endPointerPending = true;
			else this.engine?.endInput?.();
		}
		this.drag.x = x;
		this.drag.y = y;
		this.drag.down = down;
		// Keep a released stroke until the next step, even if down/move/up
		// all arrived between animation frames. Each surface chooses hover vs drag.
	}

	setTilt(value: number): void { this.tilt = Math.max(-1, Math.min(1, value)); }
	setContact(value: number): void {
		this.contact = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
		// A completed tap may arrive between frames. Retain one bounded sample,
		// rather than silently dropping the interaction before it is simulated.
		this.contactPeak = Math.max(this.contactPeak, this.contact);
	}
	cancelContact(): void { this.contact = this.contactPeak = 0; }
	invalidate(): void {
		if (this.disposed) return;
		this.dirty = true;
		this.state.memoryBytes = this.engine?.memoryBytes ?? 0;
		this.syncFrame();
		this.publish();
	}
	pause(): void {
		if (this.disposed) return;
		this.state.paused = !this.state.paused;
		this.engine?.endInput?.();
		this.endPointerPending = false;
		this.cancelContact();
		this.drag.down = false;
		this.drag.dx = this.drag.dy = 0;
		this.dragSeconds = 0;
		this.accumulator = 0;
		this.submittedTime = 0;
		this.previousTime = 0;
		this.syncFrame();
		this.publish();
	}
	reset(): void {
		if (!this.engine || this.state.busy || this.disposed) return;
		this.engine.reset();
		this.endPointerPending = false;
		this.dirty = true;
		this.state.seconds = 0;
		this.accumulator = 0;
		this.nudgeTime = 0;
		this.cancelContact();
		this.drag.dx = this.drag.dy = 0;
		this.dragSeconds = 0;
		this.syncFrame();
		this.publish();
	}
	nudge(point?: { x: number; y: number }): void {
		if (!this.state.busy && !this.disposed) {
			this.nudgePoint = point; this.nudgeTime = point ? 1.4 : 0.7; this.state.paused = false;
			this.syncFrame(); this.publish();
		}
	}
	/** Cancel scripted input without touching persistent material history. */
	cancelNudge(): void { this.nudgeTime = 0; this.nudgePoint = undefined; }

	private tick = (time: number): void => {
		this.frame = 0;
		if (!this.needsFrame() || this.pendingFrames >= 2) { this.syncFrame(); return; }
		const engine = this.engine!;
		const elapsed = this.previousTime ? (time - this.previousTime) / 1000 : 1 / 60;
		this.previousTime = time;
		try {
			// Consume only this redraw request; a reentrant invalidation during
			// model work or notification remains a request for a subsequent frame.
			this.dirty = false;
			if (this.submittedTime) this.intervals.push(time - this.submittedTime);
			this.submittedTime = time;
			const encoder = this.device.createCommandEncoder({ label: 'liquid experiment frame' });
			if (!this.state.paused) {
				this.dragSeconds += elapsed;
				// Bound CPU catch-up after a delayed animation frame.
				this.accumulator = Math.min(this.accumulator + elapsed, 4 / 120);
				const stepCount = Math.floor((this.accumulator + 1e-9) * 120);
				if (stepCount > 0) {
					const input: LiquidInput = {
						x: this.drag.x, y: this.drag.y,
						vx: Math.max(-3, Math.min(3, this.drag.dx / this.dragSeconds)),
						vy: Math.max(-3, Math.min(3, this.drag.dy / this.dragSeconds)),
						active: this.drag.down || this.drag.dx !== 0 || this.drag.dy !== 0, tilt: this.tilt,
						press: Math.max(this.contact, this.contactPeak)
					};
					if (this.nudgeTime > 0) {
						const progress = 1 - this.nudgeTime / (this.nudgePoint ? 1.4 : 0.7);
						input.x = 0.25 + progress * 0.5;
						input.y = 0.52 + Math.sin(progress * Math.PI) * 0.06;
						input.vx = 0.5 / 0.7;
						input.vy = Math.cos(progress * Math.PI) * 0.06 * Math.PI / 0.7;
						input.active = true;
						if (this.nudgePoint) {
							input.x = this.nudgePoint.x; input.y = this.nudgePoint.y;
							input.vx = input.vy = 0;
							input.press = Math.sin(progress * Math.PI) ** 2;
						}
					}
					for (let i = 0; i < stepCount; i++) engine.step(encoder, 1 / 120, input);
					if (this.endPointerPending) { engine.endInput?.(); this.endPointerPending = false; }
					this.contactPeak = 0;
					const advanced = stepCount / 120;
					this.accumulator -= advanced;
					this.state.seconds += advanced;
					this.nudgeTime = Math.max(0, this.nudgeTime - advanced);
					this.drag.dx = this.drag.dy = 0;
					this.dragSeconds = 0;
				}
			}
			engine.render(encoder, this.context.getCurrentTexture().createView());
			this.device.queue.submit([encoder.finish()]);
			this.pendingFrames++;
			void this.device.queue.onSubmittedWorkDone().then(
				() => {
					if (this.pendingFrames >= 2) {
						// Match the bounded clock's discard policy after GPU stalls:
						// never repay delayed simulation or accumulated pointer force.
						this.accumulator = this.drag.dx = this.drag.dy = this.dragSeconds = 0;
						this.previousTime = 0;
					}
					this.pendingFrames--; this.syncFrame();
				},
				(error) => { this.pendingFrames--; this.fail(String(error)); }
			);
			if (time - this.reportTime > 1000) {
				this.intervals.sort((a, b) => a - b);
				this.state.frameMs = this.intervals[Math.floor(this.intervals.length * 0.5)] ?? 0;
				this.intervals = [];
				this.reportTime = time;
				this.publish();
			}
		} catch (error) { this.fail(error instanceof Error ? error.message : String(error)); return; }
		this.syncFrame();
	};

	/** Explicit diagnostic: warm 10 steps, time 60 more, then read state. */
	async measure(): Promise<LabMeasurement> {
		const engine = this.engine;
		if (!engine || !this.state.ready || this.state.busy || this.disposed || this.state.error) throw new Error('Wait for the experiment to be ready.');
		const generation = this.generation;
		const active = () => !this.disposed && generation === this.generation && engine === this.engine;
		this.state.busy = true;
		this.stopFrame();
		this.releaseInput();
		this.publish();
		try {
			await this.device.queue.onSubmittedWorkDone();
			if (!active()) throw new Error('Measurement was interrupted.');
			engine.reset();
			const input: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: this.tilt };
			const warm = this.device.createCommandEncoder();
			for (let i = 0; i < 10; i++) engine.step(warm, 1 / 120, input);
			this.device.queue.submit([warm.finish()]);
			await this.device.queue.onSubmittedWorkDone();
			if (!active()) throw new Error('Measurement was interrupted.');
			const started = performance.now();
			for (let i = 0; i < 30; i++) {
				const encoder = this.device.createCommandEncoder();
				engine.step(encoder, 1 / 120, input);
				engine.step(encoder, 1 / 120, input);
				engine.render(encoder, this.context.getCurrentTexture().createView());
				this.device.queue.submit([encoder.finish()]);
			}
			await this.device.queue.onSubmittedWorkDone();
			if (!active()) throw new Error('Measurement was interrupted.');
			const batchFrameMs = (performance.now() - started) / 30;
			const snapshot = await engine.inspect();
			if (!active()) throw new Error('Measurement was interrupted.');
			this.state.seconds = 70 / 120;
			return { batchFrameMs, snapshot };
		} finally {
			this.state.busy = false;
			if (active()) {
				// The former busy polling branch discarded these forces. Clear
				// them at the boundary instead; diagnostics must not replay a tap.
				this.releaseInput();
				const { width, height } = this.canvas.getBoundingClientRect();
				this.resize(width, height);
				this.dirty = true;
				this.accumulator = 0;
				this.previousTime = 0;
				this.submittedTime = 0;
				this.syncFrame();
			}
			this.publish();
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.removePixelRatioListener();
		document.removeEventListener('visibilitychange', this.visibility);
		this.generation++;
		this.stopFrame();
		this.engine?.dispose();
		this.context.unconfigure();
		this.device.destroy();
	}
}
