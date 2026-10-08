import { describe, it, expect } from "vitest";
import { fidelity, lab, median, noise } from "./metrics.js";
import {
  relaxationKeep,
  targetRelaxation,
} from "$lib/engine/image-convergence.js";
describe("E5 frozen math", () => {
  it("identity fidelity, D65 Lab and degradation", () => {
    const a = new Uint8Array(8 * 8 * 4).fill(255),
      b = new Uint8Array(a.length);
    expect(fidelity(a, a, 8, 8)).toEqual({ ssim: 1, deltaE76: 0, exact: true });
    expect(lab(255, 255, 255)[0]).toBeCloseTo(100, 3);
    expect(lab(0, 0, 0)).toEqual([0, 0, 0]);
    expect(fidelity(a, b, 8, 8).deltaE76).toBeCloseTo(100, 3);
    expect(fidelity(a, b, 8, 8).ssim).toBeLessThan(0.001);
    expect(() => fidelity(a, b, 9, 8)).toThrow(RangeError);
  });
  it("exponential composition, scramble ceiling and ramp", () => {
    expect(targetRelaxation(0.5)).toBe(0);
    expect(targetRelaxation(0.75)).toBe(0.35);
    expect(targetRelaxation(3.75)).toBe(3);
    expect(targetRelaxation(20)).toBe(3);
    expect(relaxationKeep(2, 0.1) * relaxationKeep(2, 0.2)).toBeCloseTo(
      relaxationKeep(2, 0.3),
      14
    );
    expect(() => relaxationKeep(NaN, 1)).toThrow(RangeError);
    expect(() => relaxationKeep(1, -1)).toThrow(RangeError);
  });
  it("median and pre-registered relative noise", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(noise([9, 10, 11])).toBe(0.2);
    expect(noise([0, 0, 0])).toBe(0);
    expect(noise([0.5, 1, 1], 0.5)).toBe(0.5);
  });
});
