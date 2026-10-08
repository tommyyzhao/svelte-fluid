// @ts-nocheck -- measurement-only private prototype probes; never published.
// Measurement-only entry: Vite compiles the real component and resolves Svelte's browser export.
import { mount, unmount } from 'svelte';
import Fluid from './lib/Fluid.svelte';
import { FluidEngine } from './lib/engine/FluidEngine.js';
import { PRESETS } from './lib/presets/registry.js';

let component, engine, mountedAt, firstQuietAt = null, settledAt = null, diagnosticMount = false;
const motion = { samples: [], probes: [], errors: [] };
let motionPair = null;
function sampleMotion(e) {
	if (!diagnosticMount || !mountedAt || motion.samples.length >= 5) return;
	const at = epoch(), targetSeconds = 30 + motion.samples.length * 2;
	if (!motionPair && at < mountedAt + targetSeconds * 1000) return;
	try {
		const gl = e.gl;
		if (gl.getError() !== gl.NO_ERROR) throw new Error('GL error before motion readback');
		const dye = e.readField('dye');
		if (!motionPair) {
			const velocity = e.readField('velocity');
			let maxVelocityTexelsPerSecond = 0;
			for (let i = 0; i < velocity.data.length; i += 2) {
				const speed = Math.hypot(velocity.data[i], velocity.data[i + 1]);
				if (!Number.isFinite(speed)) throw new Error('Nonfinite velocity readback');
				maxVelocityTexelsPerSecond = Math.max(maxVelocityTexelsPerSecond, speed);
			}
			if (gl.getError() !== gl.NO_ERROR) throw new Error('GL error during motion readback');
			motionPair = { at, targetSeconds, dye, maxVelocityTexelsPerSecond };
		} else {
			if (dye.width !== motionPair.dye.width || dye.height !== motionPair.dye.height) throw new Error('Dye dimensions changed');
			let maxPerFrameDyeChange = 0;
			for (let i = 0; i < dye.data.length; i++) if (i % 4 !== 3) {
				const delta = Math.abs(dye.data[i] - motionPair.dye.data[i]);
				if (!Number.isFinite(delta)) throw new Error('Nonfinite dye readback');
				maxPerFrameDyeChange = Math.max(maxPerFrameDyeChange, delta);
			}
			if (gl.getError() !== gl.NO_ERROR) throw new Error('GL error during motion readback');
			motion.samples.push({ targetSeconds, firstSeconds: (motionPair.at - mountedAt) / 1000, secondSeconds: (at - mountedAt) / 1000, frameIntervalMs: at - motionPair.at, maxVelocityTexelsPerSecond: motionPair.maxVelocityTexelsPerSecond, maxPerFrameDyeChange });
			motionPair = null;
		}
		if (gl.getError() !== gl.NO_ERROR) throw new Error('GL error during motion readback');
	} catch (error) { motion.errors.push(String(error)); diagnosticMount = false; motionPair = null; }
}
const ticks = [], raf = [], transitions = [], errors = [];
function refresh() { raf.push(performance.timeOrigin + performance.now()); requestAnimationFrame(refresh); }
requestAnimationFrame(refresh);
const epoch = () => performance.timeOrigin + performance.now();
const start = FluidEngine.prototype.startRaf;
FluidEngine.prototype.startRaf = function (...args) {
	engine = this;
	return start.apply(this, args);
};
const update = FluidEngine.prototype.update;
FluidEngine.prototype.update = function (...args) {
	ticks.push(epoch());
	const result = update.apply(this, args);
	sampleMotion(this);
	return result;
};
const stop = FluidEngine.prototype.stopRaf;
FluidEngine.prototype.stopRaf = function (...args) {
	if (this.isSettled && settledAt === null) settledAt = epoch();
	transitions.push({ at: epoch(), settled: this.isSettled });
	return stop.apply(this, args);
};
const visibility = [];
document.addEventListener('visibilitychange', () => visibility.push({ at: epoch(), state: document.visibilityState }));

window.__energy = {
	async mount({ preset, w, h, seed, override, diagnostic = false }) {
		const entry = PRESETS.find((p) => p.id === preset);
		if (preset !== '(default)' && !entry) throw new Error(`Unknown preset ${preset}`);
		diagnosticMount = diagnostic;
		if (diagnostic) {
			// Separate mount keeps field readbacks outside every energy trace.
			const issue = FluidEngine.prototype.issueSettleProbe;
			FluidEngine.prototype.issueSettleProbe = function (...args) {
				const result = issue.apply(this, args);
				if (this.settleProbe) this.settleProbe.energyIssueAt = epoch();
				return result;
			};
			const poll = FluidEngine.prototype.pollSettleProbe;
			FluidEngine.prototype.pollSettleProbe = function (...args) {
				const issueAt = this.settleProbe?.energyIssueAt;
				const result = poll.apply(this, args);
				if (result === true && firstQuietAt === null) firstQuietAt = issueAt ?? epoch();
				if (result !== null) motion.probes.push({ issueSeconds: ((issueAt ?? epoch()) - mountedAt) / 1000, pollSeconds: (epoch() - mountedAt) / 1000, quiet: result, maxVelocityComponent: this.settlePixels?.[0] ?? null, maxDyeVisibility: this.settlePixels?.[4] ?? null });
				return result;
			};
		}
		await new Promise((resolve, reject) => {
			component = mount(Fluid, {
				target: document.getElementById('target'),
				props: {
					...entry?.config, ...override, width: w, height: h, seed,
					onReady: () => { mountedAt = epoch(); resolve(); },
					onError: (error) => { errors.push(String(error)); reject(error); }
				}
			});
		});
		// Move scrollbars outside the scene: never shrink its CSS or native backing.
		document.body.style.minHeight = `${h + innerHeight + 300}px`;
		const gl = engine.gl, debug = gl.getExtension('WEBGL_debug_renderer_info');
		const canvas = document.querySelector('canvas'), rect = canvas.getBoundingClientRect();
		return {
			mountedAt, dprActual: devicePixelRatio, cssActual: [rect.width, rect.height],
			backing: [canvas.width, canvas.height], ua: navigator.userAgent,
			adapter: String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
			config: engine.config
		};
	},
	state() {
		return {
			at: epoch(), visibility: document.visibilityState, focus: document.hasFocus(),
			paused: engine?.isPaused ?? null, settled: engine?.isSettled ?? null,
			rafSubscribed: engine ? !!engine.stopFrames : null,
			firstQuietAt, settledAt, errors: [...errors],
			motion: diagnosticMount || motion.samples.length || motion.errors.length ? { ...motion, maxVelocityTexelsPerSecond: motion.samples.length ? Math.max(...motion.samples.map((s) => s.maxVelocityTexelsPerSecond)) : null, maxPerFrameDyeChange: motion.samples.length ? Math.max(...motion.samples.map((s) => s.maxPerFrameDyeChange)) : null } : null
		};
	},
	snapshot() { return { ...this.state(), mountedAt, ticks, raf, transitions, visibility }; },
	async dispose() { if (component) await unmount(component); component = null; }
};
