import { describe,it,expect } from 'vitest';
import { advanceDendriteCpu,createDendriteCpu,dendriteMaxStep,dendriteOptions,dendriteSubsteps,dendriteTotals,dendriteWeightLowerBound,dendriteWeights,DENDRITE_EPSILON,validateDendriteOptions } from './dendritic-growth-model.js';

describe('positive surface-energy melt-growth approximation',()=>{
	it('certifies stiffness, all rotated stencil weights, and the strict explicit bound',()=>{
		expect(1-35*.02).toBeCloseTo(.3,14);expect(dendriteWeightLowerBound()).toBeGreaterThan(.028);
		for(let angle=0;angle<Math.PI/3;angle+=.07)for(let theta=0;theta<Math.PI*2;theta+=.03){
			const [x,y,d]=dendriteWeights(Math.cos(theta),Math.sin(theta),{anisotropy:.02,angle});
			expect(Math.min(x,y)).toBeGreaterThan(dendriteWeightLowerBound());expect(2*(x+y+Math.abs(d))).toBeLessThan(6);
		}
		expect(dendriteSubsteps(1/120)).toBe(4);expect(()=>validateDendriteOptions({anisotropy:.04,angle:0})).toThrow('positive-stiffness');
		expect(()=>dendriteSubsteps(NaN)).toThrow();expect(()=>dendriteMaxStep(385)).toThrow();
		expect(()=>validateDendriteOptions({anisotropy:.02,angle:1e308})).toThrow();
	});
	it('matches the Hessian of the primary gradient-energy flux, not a kinetic multiplier',()=>{
		const options={anisotropy:.02,angle:.17},q=(x:number,y:number)=>{
			const theta=Math.atan2(y,x)-options.angle,a=1+options.anisotropy*Math.cos(6*theta),b=-6*options.anisotropy*Math.sin(6*theta);
			return[a*a*x-a*b*y,a*a*y+a*b*x];
		};
		for(const[x,y]of[[.3,.8],[-.4,.2],[1,-.6]]){
			const h=1e-6,[wx,wy,d]=dendriteWeights(x,y,options),qx1=q(x+h,y),qx0=q(x-h,y),qy1=q(x,y+h),qy0=q(x,y-h);
			expect((qx1[0]-qx0[0])/(2*h)).toBeCloseTo(wx+Math.abs(d),7);
			expect((qy1[1]-qy0[1])/(2*h)).toBeCloseTo(wy+Math.abs(d),7);
			expect((qy1[0]-qy0[0])/(2*h)).toBeCloseTo(d,7);expect((qx1[1]-qx0[1])/(2*h)).toBeCloseTo(d,7);
		}
	});
	it('has the same physical diffuse width at192 and384, independently of output DPR',()=>{
		const width=2*Math.log(9)*Math.SQRT2*DENDRITE_EPSILON;
		expect(width*192).toBeCloseTo(4,6);expect(width*384).toBeCloseTo(8,6);
		const a=dendriteTotals(createDendriteCpu(192).cells),b=dendriteTotals(createDendriteCpu(384).cells);
		expect(Math.abs(a.phase-b.phase)).toBeLessThan(1e-7);
	});
	it('never spontaneously nucleates an empty supercooled sample',()=>{
		const state=createDendriteCpu(32,false);for(let i=0;i<20;i++)advanceDendriteCpu(state,dendriteMaxStep(32));
		const total=dendriteTotals(state.cells);expect(total.phase).toBe(0);expect(total.heat).toBe(-.5);expect(total.finite).toBe(true);
	});
	it('preserves phase bounds for difficult finite fields without clamping',()=>{
		const state=createDendriteCpu(32,false);let seed=173;
		const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
		for(let i=0;i<state.cells.length;i+=2){state.cells[i]=random();state.cells[i+1]=random()*4-2;}
		const before=dendriteTotals(state.cells);for(let i=0;i<30;i++)advanceDendriteCpu(state,dendriteMaxStep(32),{anisotropy:.02,angle:.3});
		const after=dendriteTotals(state.cells);expect(after.min).toBeGreaterThanOrEqual(0);expect(after.max).toBeLessThanOrEqual(1);expect(after.finite).toBe(true);expect(Math.abs(after.enthalpy-before.enthalpy)).toBeLessThan(1e-12);
	});
	it('charges the actual phase increment to heat and converges as dt halves',()=>{
		const coarse=createDendriteCpu(96),fine=createDendriteCpu(96),h=dendriteMaxStep(96),before=dendriteTotals(coarse.cells),options=dendriteOptions();
		for(let i=0;i<24;i++){advanceDendriteCpu(coarse,h,options);advanceDendriteCpu(fine,h/2,options);advanceDendriteCpu(fine,h/2,options);}
		const a=dendriteTotals(coarse.cells),b=dendriteTotals(fine.cells);
		expect(a.phase).toBeGreaterThan(before.phase);expect(a.heat).toBeGreaterThan(before.heat);expect(Math.abs(a.enthalpy-before.enthalpy)).toBeLessThan(1e-12);expect(Math.abs(b.enthalpy-before.enthalpy)).toBeLessThan(1e-12);
		expect(Math.abs(a.phase-b.phase)/b.phase).toBeLessThan(.02);
		expect(()=>advanceDendriteCpu(coarse,h*1.01,options)).toThrow('positivity');
	});
});
