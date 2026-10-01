import { sharedWebGpuDevicePool, type WebGpuDeviceLease } from '../device-pool.js';
import { subscribeFrame } from '../../frame-scheduler.js';
import { presentationSize } from './presentation-size.js';
import { materialResources } from './cache.js';
import type { LiquidInput } from './types.js';
import type { MaterialStatus } from '../../types.js';

export interface MaterialSize { cssWidth: number; cssHeight: number; dpr: number; width: number; height: number }
export interface MaterialDriver {
	readonly active: boolean;
	layout(size: MaterialSize): Promise<void>;
	step(encoder: GPUCommandEncoder, dt: number, input: LiquidInput): void;
	render(encoder: GPUCommandEncoder, target: GPUTextureView): void;
	quiet(): void;
	select?(selected: boolean, immediate: boolean): void;
	hover?(x: number, y: number, active: boolean): void;
	prime?(x: number, y: number): void;
	end?(): void;
	dispose(): void;
}
type Factory = (lease: WebGpuDeviceLease, size: MaterialSize, reserve: (bytes: number) => void, signal: AbortSignal) => Promise<MaterialDriver>;
const reservations = new Map<object, number>();
const LIMIT = 256 * 1024 * 1024;
const instances = new WeakMap<HTMLCanvasElement, MaterialRuntime>();
export function inspectMaterial(canvas: HTMLCanvasElement) { return instances.get(canvas)?.snapshot(); }
export function materialReservedBytes() { return [...reservations.values()].reduce((a, b) => a + b, 0); }

/** Native UI remains the input owner. This host observes; it never captures or cancels input. */
export class MaterialRuntime {
	private lease?: WebGpuDeviceLease;
	private driver?: MaterialDriver;
	private context?: GPUCanvasContext;
	private unsubscribe?: () => void;
	private removeError?: () => void;
	private removeDpr = () => {};
	private abort?: AbortController;
	private generation = 0;
	private disposed = false;
	private enabled = true;
	private visible = true;
	private busy = false;
	private refreshPending = false;
	private forcePending = false;
	private dirty = false;
	private last = 0;
	private frames = 0;
	private submissions = 0;
	private inFlight = 0;
	private selected = false;
	private size?: MaterialSize;
	private status: MaterialStatus = { state: 'loading' };
	private pending = { x: 0.5, y: 0.5, dx: 0, dy: 0, moved: false, pressed: false, down: false, continuous: false };
	private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
	private readonly contrast = matchMedia('(forced-colors: active)');
	private readonly resize: ResizeObserver;
	private readonly intersection: IntersectionObserver;
	private readonly listeners = new AbortController();

	constructor(private canvas: HTMLCanvasElement, private target: HTMLElement, private factory: Factory,
		private notify: (status: MaterialStatus) => void, enabled = true, selected = false) {
		this.enabled = enabled; this.selected = selected; instances.set(canvas, this);
		const signal = this.listeners.signal;
		this.resize = new ResizeObserver(() => this.refresh()); this.resize.observe(canvas);
		this.intersection = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.visibility(); }); this.intersection.observe(canvas);
		target.addEventListener('pointermove', this.move, { passive: true, signal });
		target.addEventListener('pointerdown', this.move, { passive: true, signal });
		target.addEventListener('pointerleave', this.release, { passive: true, signal });
		target.addEventListener('pointercancel', this.interrupt, { signal });
		window.addEventListener('pointerup', this.release, { passive: true, signal });
		window.addEventListener('blur', this.interrupt, { signal });
		document.addEventListener('visibilitychange', this.visibility, { signal });
		this.motion.addEventListener('change', this.preferences, { signal });
		this.contrast.addEventListener('change', this.preferences, { signal });
		this.watchDpr(); void this.start();
	}
	private publish(status: MaterialStatus) {
		if (this.disposed) return;
		this.status = status;
		try { this.notify(status); } catch (error) { console.warn('Material status callback failed:', error); }
	}
	private watchDpr() {
		this.removeDpr();
		const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
		const change = () => { this.watchDpr(); this.refresh(); };
		query.addEventListener('change', change); this.removeDpr = () => query.removeEventListener('change', change);
	}
	private measure(): MaterialSize {
		const rect = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
		return { cssWidth: rect.width, cssHeight: rect.height, dpr,
			...presentationSize(rect.width, rect.height, dpr, this.lease?.device.limits.maxTextureDimension2D) };
	}
	private reserve = (bytes: number) => {
		if (this.disposed || this.abort?.signal.aborted) throw new Error('Material preparation was cancelled.');
		const output = (this.size?.width ?? 1) * (this.size?.height ?? 1) * 4;
		const proposed = bytes + output;
		if (!Number.isFinite(proposed) || proposed < 0 || materialReservedBytes() - (reservations.get(this) ?? 0) + proposed > LIMIT) {
			throw new Error('Native material memory limit reached. The ordinary content remains available.');
		}
		reservations.set(this, proposed);
	};
	private async start() {
		if (this.disposed || this.busy || this.driver) return;
		if (!this.enabled || this.contrast.matches) { this.publish({ state: 'static' }); return; }
		this.busy = true; const generation = ++this.generation;
		const abort = new AbortController(); this.abort = abort; this.publish({ state: 'loading' });
		let lease: WebGpuDeviceLease | undefined, candidate: MaterialDriver | undefined;
		try {
			lease = await sharedWebGpuDevicePool.acquire();
			if (this.disposed || generation !== this.generation) { lease.release(); return; }
			this.lease = lease; this.size = this.measure(); this.reserve(0);
			const context = this.canvas.getContext('webgpu');
			if (!context) throw new Error('A WebGPU canvas could not be created.');
			this.context = context;
			this.removeError = lease.onUncapturedError((error) => this.fail(error));
			void lease.lost.then((info) => { if (generation === this.generation && !this.disposed) this.fail(new Error(`GPU device lost: ${info.message || info.reason}`)); });
			candidate = await this.factory(lease, this.size, (bytes) => {
				if (generation !== this.generation || abort.signal.aborted) throw new Error('Material preparation was cancelled.');
				this.reserve(bytes);
			}, abort.signal);
			if (this.disposed || generation !== this.generation) { candidate.dispose(); return; }
			this.driver = candidate; candidate = undefined;
			this.driver.select?.(this.selected, true);
			if (this.motion.matches) this.driver.quiet();
			await this.configure();
			if (generation === this.generation) this.dirty = true;
		} catch (error) { candidate?.dispose(); if (generation === this.generation && !this.disposed) this.fail(error); }
		finally {
			if (generation === this.generation && !this.disposed) { this.busy = false; if (this.refreshPending) this.refresh(this.forcePending); else this.schedule(); }
		}
	}
	private async configure() {
		if (!this.size || !this.lease || !this.context) return;
		const { size, lease, context } = this;
		await materialResources(lease.device, () => {
			this.canvas.width = size.width; this.canvas.height = size.height;
			context.configure({ device: lease.device, format: lease.format, alphaMode: 'premultiplied' });
		});
	}
	refresh = (force = false) => {
		if (this.disposed) return;
		if (this.busy) { this.refreshPending = true; this.forcePending ||= force; return; }
		if (!this.driver || !this.lease) return;
		this.refreshPending = this.forcePending = false;
		let size: MaterialSize;
		try { size = this.measure(); } catch (error) { this.fail(error); return; }
		if (!force && this.size && size.cssWidth === this.size.cssWidth && size.cssHeight === this.size.cssHeight && size.dpr === this.size.dpr) { this.schedule(); return; }
		this.busy = true; this.stop(); this.clearInput();
		this.publish({ state: 'loading' });
		const generation = this.generation;
		this.size = size;
		void this.driver.layout(size).then(async () => {
			if (this.disposed || generation !== this.generation) return;
			await this.configure();
			if (generation === this.generation) this.dirty = true;
		}).catch((error) => { if (generation === this.generation) this.fail(error); }).finally(() => {
			if (this.disposed || generation !== this.generation) return;
			this.busy = false;
			if (this.refreshPending) this.refresh(this.forcePending); else this.schedule();
		});
	};
	setSelected(selected: boolean) {
		this.selected = selected;
		this.driver?.select?.(selected, this.motion.matches || !this.visible || document.hidden);
		this.dirty = true; this.schedule();
	}
	setEnabled(enabled: boolean) {
		if (enabled === this.enabled) return;
		this.enabled = enabled;
		if (!enabled) { this.teardown(); this.publish({ state: 'static' }); }
		else void this.start();
	}
	retry() { this.teardown(); void this.start(); }
	private move = (event: PointerEvent) => {
		if (!event.isPrimary || !this.driver || this.motion.matches || this.contrast.matches || !this.visible || document.hidden || this.target.matches(':disabled,[aria-disabled="true"]')) return;
		const rect = this.canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
		const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
		if (this.pending.continuous) { this.driver.prime?.(this.pending.x, this.pending.y); this.pending.dx += x - this.pending.x; this.pending.dy += y - this.pending.y; }
		Object.assign(this.pending, { x, y, moved: true, continuous: true, down: event.buttons === 1 });
		this.pending.pressed ||= event.type === 'pointerdown';
		this.driver.hover?.(x, y, true); this.dirty = true; this.schedule();
	};
	private release = (event?: Event) => {
		if (event instanceof PointerEvent && !event.isPrimary) return;
		if (!this.pending.continuous && !this.pending.down && !this.pending.pressed) return;
		this.pending.down = false; this.pending.continuous = false;
		this.driver?.end?.();
		this.driver?.hover?.(this.pending.x, this.pending.y, false); this.dirty = true; this.schedule();
	};
	private clearInput() { this.pending.dx = this.pending.dy = 0; this.pending.moved = this.pending.pressed = this.pending.down = this.pending.continuous = false; this.driver?.hover?.(0.5, 0.5, false); this.driver?.end?.(); }
	private interrupt = () => { this.clearInput(); this.dirty = true; this.schedule(); };
	private visibility = () => { this.clearInput(); if (document.hidden || !this.visible) this.stop(); else { this.dirty = true; this.schedule(); } };
	private preferences = () => {
		this.clearInput();
		if (this.contrast.matches) { this.teardown(); this.publish({ state: 'static' }); return; }
		if (!this.driver) { void this.start(); return; }
		if (this.motion.matches) { this.driver.quiet(); this.driver.select?.(this.selected, true); }
		this.dirty = true; this.schedule();
	};
	private schedule() {
		if (this.disposed || this.busy || !this.driver || !this.lease || !this.enabled || !this.visible || document.hidden || this.contrast.matches) return;
		if (this.inFlight >= 2) { this.stop(); return; }
		if (!this.dirty && (this.motion.matches || !this.driver.active) && !this.pending.down) { this.stop(); return; }
		if (!this.unsubscribe) this.unsubscribe = subscribeFrame(this.frame, (error) => this.fail(error));
	}
	private stop() { this.unsubscribe?.(); this.unsubscribe = undefined; this.last = 0; }
	private frame = (now: number) => {
		const driver = this.driver, lease = this.lease;
		const generation = this.generation;
		if (!driver || !lease || !this.context || this.busy || !this.visible || document.hidden) { this.stop(); return; }
		const dt = this.last ? Math.max(1 / 240, Math.min((now - this.last) / 1000, 1 / 30)) : 1 / 60; this.last = now;
		const input: LiquidInput = { x: this.pending.x, y: this.pending.y,
			vx: this.pending.dx / dt, vy: this.pending.dy / dt, active: this.pending.moved,
			press: Number(this.pending.pressed || this.pending.down), tilt: 0 };
		this.pending.dx = this.pending.dy = 0; this.pending.moved = this.pending.pressed = false;
		lease.device.pushErrorScope('validation'); lease.device.pushErrorScope('out-of-memory');
		try {
			const encoder = lease.device.createCommandEncoder({ label: 'Native material frame' });
			if (!this.motion.matches) {
				const steps = Math.ceil(dt * 120); for (let i = 0; i < steps; i++) driver.step(encoder, dt / steps, input);
			}
			driver.render(encoder, this.context.getCurrentTexture().createView()); lease.device.queue.submit([encoder.finish()]);
			this.frames++; this.submissions++; this.dirty = false;
			this.inFlight++;
			void lease.device.queue.onSubmittedWorkDone().then(() => {
				if (generation !== this.generation) return;
				this.inFlight--; this.schedule();
			}).catch((error) => { if (generation === this.generation) this.fail(error); });
			if (this.status.state !== 'ready') this.publish({ state: 'ready' });
		} catch (error) { this.fail(error); }
		void Promise.all([lease.device.popErrorScope(), lease.device.popErrorScope()]).then((errors) => {
			const error = errors.find(Boolean); if (error && generation === this.generation) this.fail(error);
		}).catch((error) => { if (generation === this.generation) this.fail(error); });
		this.schedule();
	};
	private fail(error: unknown) {
		this.teardown();
		// GPUError is not an Error subclass; preserve its actionable driver message.
		const reason = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
		this.publish({ state: 'unavailable', reason });
	}
	private teardown() {
		this.generation++; this.abort?.abort(); this.stop(); this.busy = false; this.refreshPending = this.forcePending = false; this.inFlight = 0; this.clearInput();
		this.driver?.dispose(); this.driver = undefined; this.context?.unconfigure(); this.context = undefined;
		this.removeError?.(); this.removeError = undefined; this.lease?.release(); this.lease = undefined; reservations.delete(this);
	}
	snapshot() { return { state: this.status.state, frames: this.frames, submissions: this.submissions, inFlight: this.inFlight, active: Boolean(this.unsubscribe), bytes: reservations.get(this) ?? 0, width: this.canvas.width, height: this.canvas.height, device: this.lease?.device }; }
	dispose() {
		if (this.disposed) return; this.teardown(); this.disposed = true;
		this.listeners.abort(); this.resize.disconnect(); this.intersection.disconnect(); this.removeDpr(); instances.delete(this.canvas);
	}
}
