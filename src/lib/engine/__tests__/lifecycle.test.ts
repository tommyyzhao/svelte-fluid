/**
 * Tests for FluidEngine lifecycle state machine contracts.
 *
 * FluidEngine requires a real WebGL context, so we test the state
 * transition logic by building a minimal mock that mirrors the
 * engine's dispose(), setConfig(), and context loss/restore behavior.
 * This validates the invariants that the component layer relies on.
 *
 * The mock tracks which "expensive operations" (FBO rebuilds, shader
 * recompiles, etc.) are triggered by setConfig() field changes, letting
 * us verify the 4-bucket classification without real GL calls.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveConfig, DEFAULTS } from '../FluidEngine.js';
import { containerShapeEqual, stickyMaskEqual } from '../container-shapes.js';
import type { FluidConfig, ResolvedConfig } from '../types.js';

/* ------------------------------------------------------------------ */
/*              setConfig bucket classification tests                  */
/* ------------------------------------------------------------------ */

describe('setConfig bucket classification', () => {
	/**
	 * Mirrors the change detection logic from FluidEngine.setConfig()
	 * without requiring GL context. Returns which expensive operations
	 * would be triggered by a given config patch.
	 */
	function classifyChanges(patch: FluidConfig, base: ResolvedConfig = DEFAULTS) {
		const next = resolveConfig(patch, base);
		const a = base;
		const b = next;

		return {
			fbChanged: a.SIM_RESOLUTION !== b.SIM_RESOLUTION || a.DYE_RESOLUTION !== b.DYE_RESOLUTION,
			bloomChanged: a.BLOOM_RESOLUTION !== b.BLOOM_RESOLUTION || a.BLOOM_ITERATIONS !== b.BLOOM_ITERATIONS,
			sunraysChanged: a.SUNRAYS_RESOLUTION !== b.SUNRAYS_RESOLUTION,
			kwChanged: a.SHADING !== b.SHADING || a.BLOOM !== b.BLOOM || a.SUNRAYS !== b.SUNRAYS,
			shapeChanged: !containerShapeEqual(a.CONTAINER_SHAPE, b.CONTAINER_SHAPE),
			glassChanged: a.GLASS !== b.GLASS || !containerShapeEqual(a.CONTAINER_SHAPE, b.CONTAINER_SHAPE),
			revealChanged: a.REVEAL !== b.REVEAL,
			distortionChanged: a.DISTORTION !== b.DISTORTION,
			distortionImageChanged: a.DISTORTION_IMAGE_URL !== b.DISTORTION_IMAGE_URL,
			stickyChanged: a.STICKY !== b.STICKY,
			stickyMaskChanged: !stickyMaskEqual(a.STICKY_MASK, b.STICKY_MASK),
			pointerInputChanged: a.POINTER_INPUT !== b.POINTER_INPUT,
			backColorChanged: a.BACK_COLOR !== b.BACK_COLOR,
			config: next
		};
	}

	describe('Bucket A — hot scalars (no expensive ops)', () => {
		const bucketAFields: FluidConfig = {
			curl: 50,
			splatRadius: 0.5,
			densityDissipation: 0.5,
			velocityDissipation: 0.3,
			pressure: 0.6,
			splatForce: 8000,
			colorful: false,
			colorUpdateSpeed: 5,
			paused: true,
			splatOnHover: true,
			randomSplatRate: 5,
			randomSplatCount: 3,
			randomSplatSwirl: 100,
			randomSplatSpread: 0.5,
			glassThickness: 0.08,
			glassRefraction: 0.6,
			glassReflectivity: 0.2,
			glassChromatic: 0.3,
			revealSensitivity: 0.2,
			revealCurve: 0.5
		};

		it('changing only Bucket A fields triggers no rebuilds', () => {
			const c = classifyChanges(bucketAFields);
			expect(c.fbChanged).toBe(false);
			expect(c.bloomChanged).toBe(false);
			expect(c.sunraysChanged).toBe(false);
			expect(c.kwChanged).toBe(false);
			expect(c.shapeChanged).toBe(false);
			expect(c.glassChanged).toBe(false);
			expect(c.revealChanged).toBe(false);
			expect(c.distortionChanged).toBe(false);
			expect(c.stickyChanged).toBe(false);
			expect(c.stickyMaskChanged).toBe(false);
		});

		it('backColor change is detected for normalizeColor', () => {
			const c = classifyChanges({ backColor: { r: 255, g: 0, b: 0 } });
			// backColor is Bucket A but triggers normalizeColor
			expect(c.backColorChanged).toBe(true);
			expect(c.fbChanged).toBe(false);
		});
	});

	describe('Bucket B — keyword recompile', () => {
		it('toggling shading triggers keyword change', () => {
			const c = classifyChanges({ shading: false });
			expect(c.kwChanged).toBe(true);
			expect(c.fbChanged).toBe(false);
		});

		it('toggling bloom triggers keyword change', () => {
			const c = classifyChanges({ bloom: false });
			expect(c.kwChanged).toBe(true);
		});

		it('toggling sunrays triggers keyword change', () => {
			const c = classifyChanges({ sunrays: false });
			expect(c.kwChanged).toBe(true);
		});

		it('toggling reveal triggers keyword + reveal change', () => {
			const c = classifyChanges({ reveal: true });
			expect(c.revealChanged).toBe(true);
			// reveal is in the updateKeywords condition alongside kwChanged
		});

		it('toggling distortion triggers distortion change', () => {
			const c = classifyChanges({ distortion: true });
			expect(c.distortionChanged).toBe(true);
		});
	});

	describe('Bucket C — FBO rebuild', () => {
		it('changing simResolution triggers framebuffer rebuild', () => {
			const c = classifyChanges({ simResolution: 64 });
			expect(c.fbChanged).toBe(true);
		});

		it('changing dyeResolution triggers framebuffer rebuild', () => {
			const c = classifyChanges({ dyeResolution: 512 });
			expect(c.fbChanged).toBe(true);
		});

		it('changing bloomResolution triggers bloom rebuild', () => {
			const c = classifyChanges({ bloomResolution: 128 });
			expect(c.bloomChanged).toBe(true);
			expect(c.fbChanged).toBe(false);
		});

		it('changing bloomIterations triggers bloom rebuild', () => {
			const c = classifyChanges({ bloomIterations: 4 });
			expect(c.bloomChanged).toBe(true);
		});

		it('changing sunraysResolution triggers sunrays rebuild', () => {
			const c = classifyChanges({ sunraysResolution: 128 });
			expect(c.sunraysChanged).toBe(true);
			expect(c.fbChanged).toBe(false);
		});

		it('changing containerShape triggers shape + glass change', () => {
			const c = classifyChanges({
				containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 }
			});
			expect(c.shapeChanged).toBe(true);
			expect(c.glassChanged).toBe(true);
		});

		it('same containerShape triggers no change', () => {
			const base = resolveConfig(
				{ containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 } },
				DEFAULTS
			);
			const c = classifyChanges(
				{ containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 } },
				base
			);
			expect(c.shapeChanged).toBe(false);
		});

		it('toggling glass triggers glass change', () => {
			const c = classifyChanges({ glass: true });
			expect(c.glassChanged).toBe(true);
		});

		it('changing distortionImageUrl triggers image reload', () => {
			const c = classifyChanges({ distortionImageUrl: 'new.jpg' });
			expect(c.distortionImageChanged).toBe(true);
		});
	});

	describe('Bucket D — construct-only (ignored in setConfig)', () => {
		it('seed is resolved but ignored by setConfig guard', () => {
			// resolveConfig still maps it — the engine's setConfig() method
			// just writes this.config = b, so the seed is updated in the
			// config object but has no effect (the RNG is already seeded).
			const c = classifyChanges({ seed: 999 });
			expect(c.config.SEED).toBe(999);
			expect(c.fbChanged).toBe(false);
			expect(c.kwChanged).toBe(false);
		});
	});

	describe('sticky mask changes', () => {
		it('toggling sticky triggers sticky change', () => {
			const c = classifyChanges({ sticky: true });
			expect(c.stickyChanged).toBe(true);
		});

		it('changing stickyMask text triggers mask change', () => {
			const base = resolveConfig({ sticky: true, stickyMask: { text: 'A' } }, DEFAULTS);
			const c = classifyChanges({ stickyMask: { text: 'B' } }, base);
			expect(c.stickyMaskChanged).toBe(true);
		});

		it('same stickyMask triggers no change', () => {
			const base = resolveConfig({ sticky: true, stickyMask: { text: 'A' } }, DEFAULTS);
			const c = classifyChanges({ stickyMask: { text: 'A' } }, base);
			expect(c.stickyMaskChanged).toBe(false);
		});
	});

	describe('pointer input changes', () => {
		it('toggling pointerInput triggers listener management', () => {
			const c = classifyChanges({ pointerInput: false });
			expect(c.pointerInputChanged).toBe(true);
		});

		it('same pointerInput triggers no change', () => {
			const c = classifyChanges({ pointerInput: true });
			expect(c.pointerInputChanged).toBe(false);
		});
	});

	describe('combined changes trigger multiple operations', () => {
		it('resolution + shading change triggers both FBO + keyword', () => {
			const c = classifyChanges({ simResolution: 64, shading: false });
			expect(c.fbChanged).toBe(true);
			expect(c.kwChanged).toBe(true);
		});

		it('shape + bloom toggle triggers shape + glass + keyword', () => {
			const c = classifyChanges({
				containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.3 },
				bloom: false
			});
			expect(c.shapeChanged).toBe(true);
			expect(c.glassChanged).toBe(true);
			expect(c.kwChanged).toBe(true);
		});
	});
});

/* ------------------------------------------------------------------ */
/*         velocity dissipation in multiplicative mode                 */
/* ------------------------------------------------------------------ */

describe('velocity dissipation in multiplicative mode (REVEAL/STICKY)', () => {
	/**
	 * Mirrors the engine logic at FluidEngine.ts step():
	 *   (REVEAL || STICKY)
	 *     ? (VELOCITY_DISSIPATION > 0.5 ? VELOCITY_DISSIPATION : 0.98)
	 *     : VELOCITY_DISSIPATION
	 */
	function effectiveVelocityDissipation(config: {
		reveal: boolean;
		sticky: boolean;
		velocityDissipation: number;
	}): number {
		if (config.reveal || config.sticky) {
			return config.velocityDissipation > 0.5
				? config.velocityDissipation
				: 0.98;
		}
		return config.velocityDissipation;
	}

	it('standard mode uses prop directly', () => {
		expect(effectiveVelocityDissipation({ reveal: false, sticky: false, velocityDissipation: 0.2 })).toBe(0.2);
	});

	it('reveal mode falls back to 0.98 for additive-range values', () => {
		// Default engine VELOCITY_DISSIPATION=0.2 would kill velocity instantly
		expect(effectiveVelocityDissipation({ reveal: true, sticky: false, velocityDissipation: 0.2 })).toBe(0.98);
	});

	it('reveal mode honors multiplicative-range values (> 0.5)', () => {
		// FluidReveal sets velocityDissipation=0.9 — should be respected
		expect(effectiveVelocityDissipation({ reveal: true, sticky: false, velocityDissipation: 0.9 })).toBe(0.9);
		expect(effectiveVelocityDissipation({ reveal: true, sticky: false, velocityDissipation: 0.95 })).toBe(0.95);
	});

	it('sticky mode also honors multiplicative-range values', () => {
		expect(effectiveVelocityDissipation({ reveal: false, sticky: true, velocityDissipation: 0.85 })).toBe(0.85);
	});

	it('sticky mode falls back for additive-range values', () => {
		expect(effectiveVelocityDissipation({ reveal: false, sticky: true, velocityDissipation: 0.2 })).toBe(0.98);
	});

	it('boundary: 0.5 is treated as additive (falls back)', () => {
		expect(effectiveVelocityDissipation({ reveal: true, sticky: false, velocityDissipation: 0.5 })).toBe(0.98);
	});

	it('boundary: 0.51 is treated as multiplicative (honored)', () => {
		expect(effectiveVelocityDissipation({ reveal: true, sticky: false, velocityDissipation: 0.51 })).toBeCloseTo(0.51);
	});
});

/* ------------------------------------------------------------------ */
/*                     dispose() contract tests                        */
/* ------------------------------------------------------------------ */

describe('dispose() contract', () => {
	/**
	 * Minimal mock of FluidEngine's dispose state machine.
	 * Mirrors the guard checks and state transitions in dispose().
	 */
	function createMockEngine() {
		let disposed = false;
		let rafRunning = true;
		let contextLost = false;
		let pointerListenersInstalled = true;
		const deletedResources: string[] = [];

		return {
			get disposed() { return disposed; },
			get rafRunning() { return rafRunning; },
			get contextLost() { return contextLost; },
			get pointerListenersInstalled() { return pointerListenersInstalled; },
			get deletedResources() { return deletedResources; },

			dispose() {
				if (disposed) return;
				disposed = true;
				rafRunning = false;

				deletedResources.push('contextListeners');

				if (pointerListenersInstalled) {
					pointerListenersInstalled = false;
					deletedResources.push('pointerListeners');
				}

				deletedResources.push('dye', 'velocity', 'divergence', 'curl',
					'pressure', 'bloom', 'bloomFramebuffers', 'sunrays', 'sunraysTemp');
				deletedResources.push('ditheringTexture');
				deletedResources.push('programs', 'displayMaterial');
				deletedResources.push('shaders', 'buffers');
			},

			setConfig(_patch: FluidConfig) {
				if (disposed || contextLost) return;
				// would process the patch...
			},

			pause() {
				if (!rafRunning || disposed) return;
				rafRunning = false;
			},

			resume() {
				if (rafRunning || disposed || contextLost) return;
				rafRunning = true;
			},

			simulateContextLoss() {
				contextLost = true;
				rafRunning = false;
			},

			simulateContextRestore() {
				contextLost = false;
				rafRunning = true;
			}
		};
	}

	it('sets disposed flag', () => {
		const e = createMockEngine();
		e.dispose();
		expect(e.disposed).toBe(true);
	});

	it('stops RAF loop', () => {
		const e = createMockEngine();
		e.dispose();
		expect(e.rafRunning).toBe(false);
	});

	it('is idempotent — second call is a no-op', () => {
		const e = createMockEngine();
		e.dispose();
		const countAfterFirst = e.deletedResources.length;
		e.dispose();
		expect(e.deletedResources.length).toBe(countAfterFirst);
	});

	it('removes pointer listeners when installed', () => {
		const e = createMockEngine();
		e.dispose();
		expect(e.pointerListenersInstalled).toBe(false);
		expect(e.deletedResources).toContain('pointerListeners');
	});

	it('cleans up all resource categories', () => {
		const e = createMockEngine();
		e.dispose();
		expect(e.deletedResources).toContain('dye');
		expect(e.deletedResources).toContain('velocity');
		expect(e.deletedResources).toContain('programs');
		expect(e.deletedResources).toContain('shaders');
		expect(e.deletedResources).toContain('buffers');
		expect(e.deletedResources).toContain('ditheringTexture');
	});

	it('setConfig is a no-op after dispose', () => {
		const e = createMockEngine();
		e.dispose();
		// Should not throw
		expect(() => e.setConfig({ curl: 99 })).not.toThrow();
	});

	it('pause/resume are no-ops after dispose', () => {
		const e = createMockEngine();
		e.dispose();
		e.pause();
		e.resume();
		expect(e.rafRunning).toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/*                   context loss/restore contracts                    */
/* ------------------------------------------------------------------ */

describe('context loss/restore contract', () => {
	function createMockEngine() {
		let disposed = false;
		let rafRunning = true;
		let contextLost = false;
		let pointerListenersInstalled = true;
		const operations: string[] = [];

		return {
			get disposed() { return disposed; },
			get rafRunning() { return rafRunning; },
			get contextLost() { return contextLost; },
			get operations() { return operations; },

			handleContextLost(e: { preventDefault: () => void }) {
				e.preventDefault();
				contextLost = true;
				rafRunning = false;
				operations.push('contextLost');
			},

			handleContextRestored() {
				contextLost = false;
				operations.push('initContext');
				operations.push('compileShaders');
				operations.push('initBuffersAndPrograms');
				operations.push('recreateDithering');
				operations.push('updateKeywords');
				operations.push('initFramebuffers');
				operations.push('initMaskTexture');
				operations.push('initStickyMaskTexture');
				operations.push('initGlassFramebuffer');
				if (pointerListenersInstalled) {
					operations.push('installPointerListeners');
				}
				rafRunning = true;
				operations.push('startRaf');
			},

			setConfig(_patch: FluidConfig) {
				if (disposed || contextLost) return 'blocked';
				return 'applied';
			},

			pause() {
				if (!rafRunning || disposed) return;
				rafRunning = false;
			},

			resume() {
				if (rafRunning || disposed || contextLost) return;
				rafRunning = true;
			},

			dispose() {
				if (disposed) return;
				disposed = true;
				rafRunning = false;
			}
		};
	}

	it('context loss stops RAF', () => {
		const e = createMockEngine();
		e.handleContextLost({ preventDefault: vi.fn() });
		expect(e.rafRunning).toBe(false);
		expect(e.contextLost).toBe(true);
	});

	it('context loss calls preventDefault', () => {
		const e = createMockEngine();
		const pd = vi.fn();
		e.handleContextLost({ preventDefault: pd });
		expect(pd).toHaveBeenCalledOnce();
	});

	it('setConfig is blocked during context loss', () => {
		const e = createMockEngine();
		e.handleContextLost({ preventDefault: vi.fn() });
		expect(e.setConfig({ curl: 99 })).toBe('blocked');
	});

	it('resume is blocked during context loss', () => {
		const e = createMockEngine();
		e.handleContextLost({ preventDefault: vi.fn() });
		e.resume();
		expect(e.rafRunning).toBe(false);
	});

	it('context restore performs full reinit', () => {
		const e = createMockEngine();
		e.handleContextLost({ preventDefault: vi.fn() });
		e.handleContextRestored();

		expect(e.contextLost).toBe(false);
		expect(e.rafRunning).toBe(true);
		expect(e.operations).toContain('initContext');
		expect(e.operations).toContain('compileShaders');
		expect(e.operations).toContain('initBuffersAndPrograms');
		expect(e.operations).toContain('updateKeywords');
		expect(e.operations).toContain('initFramebuffers');
		expect(e.operations).toContain('startRaf');
	});

	it('context restore recreates dithering texture', () => {
		const e = createMockEngine();
		e.handleContextLost({ preventDefault: vi.fn() });
		e.handleContextRestored();
		expect(e.operations).toContain('recreateDithering');
	});

	it('context restore rebuilds mask textures', () => {
		const e = createMockEngine();
		e.handleContextLost({ preventDefault: vi.fn() });
		e.handleContextRestored();
		expect(e.operations).toContain('initMaskTexture');
		expect(e.operations).toContain('initStickyMaskTexture');
		expect(e.operations).toContain('initGlassFramebuffer');
	});

	it('setConfig works again after context restore', () => {
		const e = createMockEngine();
		e.handleContextLost({ preventDefault: vi.fn() });
		expect(e.setConfig({ curl: 99 })).toBe('blocked');
		e.handleContextRestored();
		expect(e.setConfig({ curl: 99 })).toBe('applied');
	});

	it('full lifecycle: run → lose → restore → dispose', () => {
		const e = createMockEngine();
		expect(e.rafRunning).toBe(true);

		e.handleContextLost({ preventDefault: vi.fn() });
		expect(e.rafRunning).toBe(false);
		expect(e.contextLost).toBe(true);

		e.handleContextRestored();
		expect(e.rafRunning).toBe(true);
		expect(e.contextLost).toBe(false);

		e.dispose();
		expect(e.disposed).toBe(true);
		expect(e.rafRunning).toBe(false);
	});
});
