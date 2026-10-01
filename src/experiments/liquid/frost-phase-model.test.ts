import { describe, expect, it } from 'vitest';
import { advanceFrostCpu, createFrostCpu, plantFrostCpu, frostMaxStep, frostMobility, frostOptions, frostTotals,
	type FrostCpuState, type FrostOptions } from './frost-phase-model.js';

function evolve(state:FrostCpuState,seconds:number,options:FrostOptions,scale=1){
	const count=Math.ceil(seconds/(frostMaxStep(state.size)*scale)),h=seconds/count;
	for(let i=0;i<count;i++)advanceFrostCpu(state,h,options);
	return frostTotals(state.cells,options.latent);
}

describe('bounded fixed-substrate freezing law',()=>{
	it('has no spontaneous nucleation, even in a cold empty substrate',()=>{
		const state=createFrostCpu(64,false);evolve(state,0.4,frostOptions());
		for(let i=0;i<state.cells.length;i+=2)expect(state.cells[i]).toBe(0);
	});
	it('plants a visible cold crystal after Warm→Clear→Cold without erasing the plate’s thermal history',()=>{
		const state=createFrostCpu(96,false,0.65),options=frostOptions();evolve(state,0.4*0.18,options);
		const corner=state.cells[1];plantFrostCpu(state);expect(state.cells[1]).toBe(corner);
		const planted=state.cells.slice();plantFrostCpu(state);expect(state.cells).toEqual(planted);
		const fresh=evolve(state,0.4*0.18,options);expect(fresh.max).toBeGreaterThan(0.5);
		expect(evolve(state,0.3,options).phase).toBeGreaterThan(fresh.phase);
	});
	it('grows a cold seed, melts a warm seed, and preserves phase bounds without clamping',()=>{
		const cold=createFrostCpu(96),warm=createFrostCpu(96,true,0.65),before=frostTotals(cold.cells).phase;
		const frozen=evolve(cold,0.35,frostOptions()),melted=evolve(warm,0.35,{...frostOptions(),bath:0.65});
		expect(frozen.phase).toBeGreaterThan(before*7);expect(melted.phase).toBeLessThan(before*0.01);
		for(const result of [frozen,melted]){expect(result.finite).toBe(true);expect(result.min).toBeGreaterThanOrEqual(0);expect(result.max).toBeLessThanOrEqual(1);}
	});
	it('puts latent heat into temperature and conserves sealed enthalpy, not phase fraction',()=>{
		const state=createFrostCpu(96),options={...frostOptions(),bathRate:0},before=frostTotals(state.cells);
		const after=evolve(state,0.25,options);
		expect(after.phase).toBeGreaterThan(before.phase);expect(after.heat).toBeGreaterThan(before.heat);
		expect(after.enthalpy).toBeCloseTo(before.enthalpy,11);
		const noLatent=createFrostCpu(96);const free=evolve(noLatent,0.25,{...options,latent:0});
		expect(free.phase).toBeGreaterThan(after.phase*1.05);
	});
	it('actually melts an already cold grown crystal when the bath changes',()=>{
		const state=createFrostCpu(96),options=frostOptions();const frozen=evolve(state,0.6,options);
		const melted=evolve(state,1.4,{...options,bath:0.65});
		expect(melted.phase).toBeLessThan(frozen.phase*0.25);expect(melted.heat).toBeGreaterThan(0.3);
	});
	it('opens a warm window even inside exactly solid ice, without requiring a nearby liquid edge',()=>{
		const state=createFrostCpu(64),options=frostOptions();
		for(let i=0;i<state.cells.length;i+=2)state.cells[i]=1;
		const count=Math.ceil(0.9/frostMaxStep(64)),h=0.9/count;
		for(let i=0;i<count;i++)advanceFrostCpu(state,h,options,{x:0.5,y:0.5,active:true,temperature:1.1});
		const center=(32*64+32)*2;
		expect(state.cells[center]).toBeLessThan(0.4);
		expect(state.cells[0]).toBeGreaterThan(0.95);
		const total=frostTotals(state.cells);expect(total.min).toBeGreaterThanOrEqual(0);expect(total.max).toBeLessThanOrEqual(1);
	});
	it('pays the latent-heat cost of local melting instead of turning warm ice into free heat',()=>{
		const state=createFrostCpu(64,true,0.65);for(let i=0;i<state.cells.length;i+=2)state.cells[i]=1;
		const before=frostTotals(state.cells),after=evolve(state,0.3,{...frostOptions(),bathRate:0});
		expect(after.enthalpy).toBeCloseTo(before.enthalpy,11);
		expect(after.phase).toBeLessThan(0.8);
		expect(after.heat).toBeLessThan(before.heat-0.1);
		// This illustrative double-well law permits metastable supercooling;
		// enthalpy conservation is not a claim of calibrated coexistence at T=0.
		expect(after.heat-before.heat).toBeCloseTo(0.85*(after.phase-before.phase),11);
	});
	it('uses positive sixfold kinetic mobility, not an anisotropic surface-energy claim',()=>{
		for(let i=0;i<360;i++){
			const a=i*Math.PI/180,value=frostMobility(Math.cos(a),Math.sin(a),0.48);
			expect(value).toBeGreaterThanOrEqual(0.519999);expect(value).toBeLessThanOrEqual(1.480001);
			expect(frostMobility(Math.cos(a+Math.PI/3),Math.sin(a+Math.PI/3),0.48)).toBeCloseTo(value,12);
		}
	});
	it('keeps both pure phases bounded at the largest supported grid and maximum explicit step',()=>{
		const state=createFrostCpu(384,false),options={...frostOptions(),bath:1.2,latent:1};
		for(let i=0;i<state.cells.length;i+=2){state.cells[i]=(i%6)/4;state.cells[i+1]=i%4?1.2:-1.2;}
		for(let i=0;i<6;i++)advanceFrostCpu(state,frostMaxStep(384),options,{x:0.5,y:0.5,active:true,temperature:1.2});
		const total=frostTotals(state.cells);expect(total.finite).toBe(true);expect(total.min).toBeGreaterThanOrEqual(0);expect(total.max).toBeLessThanOrEqual(1);
	});
	it('converges under time refinement and rejects an unbounded explicit step',()=>{
		const a=createFrostCpu(96),b=createFrostCpu(96),c=createFrostCpu(96),options=frostOptions();
		evolve(a,0.25,options);evolve(b,0.25,options,0.5);evolve(c,0.25,options,0.25);
		let coarse=0,fine=0;
		for(let i=0;i<a.cells.length;i++){coarse+=(a.cells[i]-c.cells[i])**2;fine+=(b.cells[i]-c.cells[i])**2;}
		expect(fine).toBeLessThan(coarse*0.25);
		expect(()=>advanceFrostCpu(a,frostMaxStep(96)*1.01,options)).toThrow('positivity');
	});
	it('preserves resolved front area under grid refinement without changing model width',()=>{
		const a=createFrostCpu(128),b=createFrostCpu(192),c=createFrostCpu(256),options=frostOptions();
		const totals=[a,b,c].map(state=>evolve(state,0.22,options));
		const coarse=Math.abs(totals[0].phase-totals[2].phase),fine=Math.abs(totals[1].phase-totals[2].phase);
		expect(fine).toBeLessThan(coarse);expect(fine/totals[2].phase).toBeLessThan(0.05);
		console.info('Frost phase-area refinement (fixed physical epsilon)',totals.map((value,i)=>({grid:[128,192,256][i],phase:value.phase,heat:value.heat})));
	});
});
