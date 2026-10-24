# ADR 0119: Route-local paper MAC flow with reservoir plenums

**Status:** Experimental — Re50/200 flow accepted; paper reproduction fails; Re400 ships under exceptions with limits
**Date:** 2026-10-22

## Context

ADR 0118 verifies the staggered operators and Poiseuille test. Its runaway diagnosis identifies a growing velocity hotspot at the open inlet, reproduced even by exact pressure projection. Reservoirs suppress that hotspot at measured Re≈146; remaining outer-face backflow requires a longer test. ADR 0117's absorption optics remain accepted; the old collocated paper variants remain failed calibration experiments until a replacement passes G1.

## Lead design constraints

- Inflow fix is full-height plenums ≥4 measured mean widths long, matching the paper rig's chambers. No new inflow boundary condition. The outer ≈1-width band damps transverse velocity toward zero and streamwise velocity toward its own column mean. Column flux is unchanged in exact arithmetic. **Apply this forcing before projection**, because it changes local divergence; projection removes that divergence before rendering/measurement. Total-pressure inflow is skipped unless plenums fail.
- Patent trace as-is, never tune geometry to pass a metric. Copy from `memory/research/tesla-paper/derived/paper-valve.svg`; Tesla US1329559 p1, source SHA256 `c169635802df6b7320db350eaf8cc32b89a5ab0897babdff9182eb098299d93b`. Eleven islands/units. Crop the empty SVG tail to wet extent x=[0,29.973013], mapping this cell width to L=30cm (0.09% scale change); unchanged path. Assert both mouth columns wet, no solid seam with reservoirs. Traced mean width 0.837cm versus paper0.9cm; trace/photo IoU0.707; traced hydraulic estimate0.660cm versus reported0.8cm. Do not hide these mismatches.
- Route-only own-WebGL2 engine, float render targets required, explicit resource deletion without `loseContext()`. Engine imports no Svelte; GLSL strings are GL-free; component hands over canvas/calls methods. Pause offscreen/hidden. No public API/default/preset changes; FluidEngine and every non-paper variant unchanged.
- Replace only G1-passing `paper-*` variants, same IDs. Crop display to valve; compute plenums offscreen. Blue/green/carrier concentration species use ADR0117 Beer–Lambert optical depths with linear white backlight, single sRGB encode. No dye stirring/diffusion; ≈3× bounded MacCormack dye. White plate, pale acrylic islands, thin grey outline.

## Numerics and units

Verified MAC pipeline: force, bounded MacCormack momentum advection, explicit no-slip viscosity, tentative sponge/disturbance, warm paired-Jacobi projection. Velocity RG32F, pressure/divergence R32F, dye RGBA32F. Explicit α=ν_solver·dt≤0.2; fixed dt and fixed steps/display frame. Binary faces use identical divergence/gradient/Laplacian operators; open-face pressure zero with half-cell gradient.

L=30cm maps to valve width cells. Measure mean width `wbar_cells=wet valve cell count/L_cells`. Use paper hydraulic diameter `D_cells=.8cm*cells/cm`, not the trace's hydraulic estimate. `Re=(Q/wbar_cells)*D_cells/ν_solver`; Q is time-averaged exact MAC section flux, cells²/solver-second. Water νphysical=.0089cm²/s. Clock factor `c=νphysical*(cells/cm)²/ν_solver`; one solver second is1/c physical seconds. Report playback in physical seconds/wall second.

1080×126 valve has wet mean width30.0898148 cells,121-cell reservoirs, full1322×126 domain, D28.8 cells. ν_solver1.8 gives clock factor6.408. Initial dt1/120 (α.015),64 sweeps; frontier dt1/80 (α.0225),32 sweeps is under measurement. No CFL>.5 setting accepted without an explicit check.

Frozen injection: Fig3a at x25 has blue centre y55, green y44, approximately2px FWHM across wet mouth y30..66. Thus width=.755622·2/36=.041979cm, spacing=.755622·11/36=.2308845cm; set before measurements. Blue below green in the image. Source is3.5 velocity cells upstream of mouth inside inlet reservoir (fine-grid strip centred, see end-plane correction below); fixed composition, carrier across whole outer incoming face. Island median Fig3a x215..239,y33..39 gives RGB(170,202,208); grey outline sample x230,y45 gives RGB(135,145,147). White plate retained per brief.

## Pre-registered gates and amendments

- **G1:** no NaN, maximum CFL≤1 tracked every step, no sustained pressure-impulse magnitude growth after spin-up, five time-averaged valve-section fluxes agree within1%, integrated outer-face backflow every step.
- **Lead amendment G1-a**, declared2026-10-22 before any G1 data: duration≥22 measured flow-through times `T=L/U`, replacing300 dimensional seconds. At Re200,22T≈300 physical seconds; preserves original intent across dynamically similar solver clocks. G2 averaging last10T. Segment with explicit face/pressure/dye checkpoints under separate≤25min GPU locks if necessary.
- **G2:** log-force secant, measured Re within±10%; state post-spin-up averaging window inT, flux SD and frequency if unsteady.
- **G3:** equal-force forward/reverse Q nearRe200; matched-Re resistance ratio from two forces/direction. Patent forward+x unchanged. Paper Di≈1.5; failures are findings.
- **G4:** frozen ADR0117 mixed threshold min(blue,green)>.05, bearing sum>.1, onset when mixed/bearing area>.1. Eleven bins separated halfway between traced island centres. Corridor is connected vertical wet interval containing interpolated mouth centreline. Forward retention≥.9 each and correlation<.2; reverseRe200 onset>unit2 and unsteady; onsetRe50 later than200 later than400.
- **G5:** real-page headless Chrome1280×900,DPR2 scroll, target≥50fps; report GPUms, resolution/sweeps/steps frontier. Playback target≥.3 physical seconds/wall second or≤45 wall seconds/T atRe200. Fixed deterministic velocity pre-roll without presentation/passive dye, stop at fixed budget or within5% calibratedRe; report wall time.
- **G6:** node/typecheck/prepack, touched hardware, unchanged non-paper configs and public surface.
- **Lead amendment D-1**, declared2026-10-22 **after ε0 steady equal-force data, before onset/G4 data**: deterministic seeded ambient tentative forcing upstream, spatial scale wbar/3, correlation.05T, support at least1wbar from mouth and sponge. Shipped measured inlet fluctuation ε=.01U, sensitivity0/.03 at reverseRe200. ε is response, not input acceleration: calibrate temporal rms of u/v in disturbance-free centreline probe1wbar upstream, baselineε0 subtracted in quadrature, tolerance±20%. FreezeU to calibrated target. G3 rerun atε1%; reverse ladder50/200/400/800; ship800 only ifG1 passes. HighestRe1.5× resolution comparison, label under-resolved if onset/Q differ.

GPU metrics reduce every column's maximum absolute MAC component and maximum|q|, read one Float32 row every step. Every-step outer-face reduction integrates incoming/outgoing KE and prescribed downstream backflow volume/KE by right-endpoint dt quadrature. Section fluxes measured directly at five valve faces, not interpolated velocity. q is projection impulse dt·p/ρ, not physical pressure.

## Measurements

Machine-local raw JSON/checkpoints/PID manifests: `.svelte-kit/paper-flow/`. Hardware Chrome/ANGLE Metal, no unsafe flags. Each acquisition atomic mkdir `/tmp/svelte-fluid-gpu.lock`, exact owned processes only,≤25min; flush incrementally and deadline checkpoint at23min.

### ε0 force brackets, not G1 passes

| Direction | force | duration solver s | final Re | Q | max every-step CFL | final spread | wall s |
|---|---:|---:|---:|---:|---:|---:|---:|
|forward+x|.075|60|10.6788|20.0827|.017385|.002146%|35.09|
|forward+x|2|180|197.5855|371.5820|.308545|.000279%|104.97|
|reverse−x|2|180|187.8109|353.1996|.282704|<.001%|pending|
|reverse−x|3|150|243.4287|457.7952|.367128|.000133%|pending|

At equal force2, Qforward/Qreverse=1.0520454 nearRe190, steady. This is **an equal-force flux ratio, not Di**. PaperDi=Δp_reverse/Δp_forward atmatchedQ/Re;forΔp∝Q^n,equalforceratio≈Di^(1/n),soDi1.5means≈1.22forn2to1.5forn1. Matched-ReDi/localnrequireseparateε1%brackets;don'tdirectlycompare1.052to1.5. No geometry tuning. Log-force secant proposes forward2.0275219 and reverse2.2065748 atRe200; recalibrate afterD-1.

First D-1 amplitude probe A=.2 cells/s², reverseforce2.2,64sweeps,dt1/120,220solver s: temporal rms .40359cells/s overlast150s,3.2287% ofU12.5. This is not baseline-subtracted or acceptedε1% calibration. FinalRe200.0879,CFLmax.301368. No onset/G4 conclusion.

### Reverse Re200 accepted flow gate

Force2.2, ν1.8, dt1/80,32sweeps,1080×126 valve,1% ambient response calibration A=.062cells/s². A no-noise baseline at identical force/grid/dt gives negligible post-spin-up probe variance. Last10T baseline-subtracted temporal3×3 inlet-probe rms=.109325cells/s=.87460% frozenU12.5 (within .8–1.2%); response/A=1.7633s. Short220s calibration gave≈1.02%; long-window response is reported rather than assuming input scale.

G1 duration2000solver s=23.1162T≈312.11physical s. Every-step maxCFL=.4511148; no NaN, max|q|8.617304. Last10T1135..2000solver s: Q375.606383cells²/s, measuredRe199.725461, fluxSD.0212327cells²/s=.0056529%. Five mean fluxes375.606034,375.606332,375.606511,375.606564,375.606474; spread.000141013%. Four last-window q maxima8.60382,8.60404,8.60404,8.60444, no sustained growth. Every-step integrated downstream outer-face backflow volume=0, KE=0. Incoming KE integral3328611.51, outgoing3568536.37 (density-normalized discrete units). No resolved dominant frequency; transverse probe SD.00010965cells/s. G1/G2 pass. Raw `noise200b.json`, checkpoint after220s then resumed to2000s; wall574.805s total measured simulation segments. A stale `completed`/summary field was present during the resumed loop, superseded by final2000s metadata; resume now clears these fields before stepping.

Initial G4 at3× dye gave onset8/visuallysteady, but is **provisional and superseded**: forward follow-up exposed a fine-mask mouth seam. No accepted G4 result until corrected reruns. This is not proof of a 2D-physics limit until resolution sensitivity. Carrier prefill subsequently replaces slow reservoir tint arrival: initialize carrier species concentration1 everywhere; blue/green0, remains unadvected during velocity pre-roll. Channel already holds tinted water at dye start, matching the rig. No velocity changes; G4 final optical rerun pending.

Real-page G5 after carrier prefill: four fixed steps/frame, headless Chrome1280×900,DPR2 scrolling. Presented56.7227fps; GPU median16.8380ms,p9022.5112ms. Physical playback.472587s/wall s, oneT≈28.56wall s. Fixed20solver-s deterministic pre-roll takes1.3243wall s. Initial prefill-free run61.958fps/15.018ms/.472575playback; a hot-reload-interrupted run produced no metrics and is excluded. Raw `perf/reverse200-carrier-steps4b-scroll.json`. No pressure/resolution reduction below measured32sweeps/wbar30.09 needed for50fps.

### End-plane dye handling and source regression

The patent left cut is slightly slanted: x0 at top edge, x.008996cm at bottom. The first velocity cell-centre x.01388cm is wet, but the first3×dye sample x.00463cm falls outside the lower mouth and blocked the blue filament completely in forward flow. Both species were correctly injected upstream; the blue mass vanished exactly at the first dye valve column. Clamp the fine dye mask's path-sampling x to [.5,Lcells−.5] velocity cells at **both** end planes. The path itself and all velocity cells/faces/apertures are unchanged, so both G1 trajectories stand. End-plane handling aligns passive transport with the declared MAC open mouth cross-sections, not shape tuning. Fixed240-grid SHA256 regression: cells`dc714a21b8540193765bfe79946d66f596c7b8ac021f0ce206ad6557d1eb0eca`, faces/apertures`b069965469958c26ddf32e45777db58bcec7234231212cdde0382f2279efc328`.

A separate source strip edge sat exactly on fine texel centres and rounded inconsistently (two columns vs three). Centre the strip3.5 rather than3 velocity cells upstream; fixed physical width/spacing unchanged. Predictor/corrector samplers explicitly rebound each pass. Short uniform40cells/s transport,dt1/120,15steps, moves exactly one fine texel/step and crosses each mouth: analytic inventory is source-strip cells plus14 transported columns times per-species width. Forward blue/green present/injected=.9999676/.9999954, reverse1.0002871/1.0002772; all within±5%. Both-direction hardware regression passes. Earlier provisional G4 results discarded; corrected runs retain frozen filament width/spacing and metrics.

### Forward supplementary lower-disturbance run

Force2.0275219014 (log-force secant), dt1/80,32sweeps,A=.062,2000solver s=23.0588T: Re199.227936,Q374.670730,fluxSD.00402349%,mean-section spread.000337696%,every-stepCFLmax.4665885,max|q|7.844900,zero integrated outer-face backflow. q quarter maxima7.83819,7.83797,7.83723,7.83740. It passes the flow criteria but **is not the shipped G1 gate**: response rms=.076773=.61418%U, below D-1. Same stochastic law needs separate directional amplitude calibration. ForwardA=.101 is1.62903× reverseA=.062. Its actual shipped gate:2000solver s=23.0591T,Re199.230345,Q374.675263,fluxSD.00657979%,five-sectionmean spread.000317667%,CFLmax.46664505,max|q|7.847508,noNaN,noouterbackflow. q quarter maxima7.84032,7.84003,7.83899,7.83932. Last10T1133..2000s; no resolved frequency, transverseprobeSD.00080821cells/s. Baselineε0probeRMS3.6185e−6cells/s over121..220s; last10T baseline-subtracted response.1250879cells/s=1.000703%U, response/A1.23849s (accepted). Forward replacement enabled only after this gate.

### Corrected forward paper metrics

Raw `forward200final.json/png`, same shipped velocity and3×dye,320solver s after fixed20s pre-roll: retention blue.94037519,green.93961759; correlation−.05983178. **Forward G4 passes**≥90%/<.2. Area-onset8 is not a forward gate; bounded transport broadens filaments downstream. Last150s transverseprobeSD.00079205cells/s,fluxSD.0063419%; visually steady. Width/spacing frozen; end-plane/source-grid handling corrected as above.

### Final reverse paper metrics and carrier fit

Corrected `reverse200final.json/png`,320solver s,3×dye,20s pre-roll: retention.91743798/.91155787,correlation−.06977719,mixed-area onset8. Visually steady, transverseprobe remains nearsteady. Onset>2 passes, **unsteadiness fails**; G4 reverse overall fails. This supersedes the provisional pre-seam result, without tuning.

Carrier background measurement uses Fig3a patches(x0,y0,x1,y1): (200,16,210,22),(420,16,430,22),(650,16,660,22),(870,16,880,22),(1090,16,1100,22), open chamber water away from islands/filaments/outlines. Mean RGB140.9467/223.9867/177.1133. Patent-registration-matched patches on1920×224 `forward200final.png`: (247,56,257,62),(572,51,582,57),(912,46,922,52),(1236,41,1246,47),(1561,37,1571,43); mean233.7767/246.3300/240.9300. CIE76ΔE35.7246. Invert one scalar by least-squares linear RGB under white backlight, fixed carrierτ(.28,.025,.14): c5.65211746, fittedsRGB125.1025/239.6181/179.4402,linearRMSE.0795025,ΔE12.1237. **Misses≤10 target; residual hue cannot be fixed by a scalar.** Initial rule would retainc1; lead display amendment **after seeing fit** shipsc5.65212 because it is strictly closer. Absorbances unchanged. Prefill/source use thisc; blue/green remain[0,1]. G4 samples concentrations, not renderedRGB, so noG4rerun for carrier-only change. Raw `optics.json`.

Filament FWHM by unit, cm, ours concentration versus photo excess-optical-depth proxy. Photo uses1px-x-neighbour mean, green-channel optical depth for blue at y52..62,blue-channel for green at y43..54; local sideband baseline subtracted. Camera blur/spectral mismatch/registration mean these are trend estimates, not precision metrology.

|unit|ours blue|ours green|photo blue|photo green|
|---|---:|---:|---:|---:|
|1|.04199|.03593|.04291|.03717|
|2|.05077|.05665|.03172|.04839|
|3|.05462|.06307|.03020|.03033|
|4|.06832|.07977|.02890|.03264|
|5|.06978|.07548|.02890|.03297|
|6|.07665|.08193|.04413|.04067|
|7|.08024|.08377|.03032|.03437|
|8|.09266|.10416|.03262|.05798|
|9|.08584|.09224|.04495|.03807|
|10|.10010|.11389|.03611|.03900|
|11|.09330|.09898|.03377|.04810|

Known limitation: ours broadens≈.04→.09–.10cm while photo stays≈.025–.05cm. Numerical dye diffusion/limiting likely contributes; no physical diffusion was added. No sharper limiter adopted or velocity changed; report-only as directed.

### Final Re200 performance and interim disposition

Finalforwardc5.65212 realpage repeat:57.0156presentedfps,GPUmedian15.3325ms,p9023.4957ms,physicalplayback.472637s/wall s,20s pre-roll1.3354wall s. Firstfinalforwardrun during concurrentprepack measured33.7384fps/.266884playback despiteGPUmedian15.5074ms; preserve as contention-sensitive observation, not silently discarded. Uncontended repeat meetsG5. Reverse earlier carrier-prefill run56.7227fps/16.8380ms/.472587playback; scalarcarrieruniform doesn't change draw count, finalforward covers its cost. Both4steps/frame,32sweeps,3×dye. Oneflow-through≈28.6wall s.

Re200 pair passesG1/G2/G5; forwardG4 passes; reverseG4 failsunsteadiness. Pending: low/highRe ladder,εsensitivity,resolution,G3matchedRe. No paper-faithfulness acceptance. Fullnode1055/type0/prepack pass at interim; non-paperconfig SHA256 unchanged`990783045bd65cb22ed1a6951ec931c0344de0c8a25d387641f46ec93047505e`. Own livepreview integration is lead-only; no commit/stage/push/dependency/publicAPIchange.

### Reduced-motion presentation

Respect reduced motion without a blank experiment: deterministic velocity pre-roll plus fixed.25T passive-dye development, idle chunks while visible/pageactive, no intermediate presentation, then one still frame. Small caption: “Still frame: motion paused by reduced-motion preference.” Toggle changes resume/pause without changing the trajectory. Normal play retains fixed steps/frame; no GL in component. Real-page smoke: stillready4.41654wall s,step3328 unchanged after300ms; toggle resumes to3400. Screenshot `reduced-motion.png` inspected: mint channel/first few unit filaments, readable caption. This accessibility addition doesn't alter G1 or normal G4.

### Re50 calibration (pending G1)

Force brackets: .4 atdt.05 gives last200sRe52.513214,CFLmax.503153 (above preferred.5; **not shipped**); .34 atdt.04 givesRe45.443557,CFLmax.349987. Log-force secant proposes.3785480666; fixed candidate dt.04,ν1.8,32sweeps,α.072. A=.0064 gives measured inlet rms≈1.009% frozenU3.125 in the bracket; long-window recalibration remains subject to the full gate. G1 candidate8000solver s (≈23T) is running; no Re50 replacement before completion. No onset metric measured yet.

### Re50 full flow gate

Candidateforce.3785480666115,ν1.8,dt.04,32sweeps,A.0064:8000solver s=23.17498T,measuredRe50.057947,Q94.1396474,fluxSD.00371453%,five-sectionmean spread.000177645%. Every-stepCFLmax.384250793,max|q|3.353036,noNaN/noouterbackflow. Last10T4549..8000s q maxima3.3144753,3.3144763,3.3144345,3.3144407; no growth. TransverseprobeSD2.04631e−5cells/s,noresolvedfrequency. G1/G2pass. Measuredlast10T inletresponse≈.76990%U (before tinyε0subtraction),**D-1FAIL**, admittedonlyunderexplicitbelowexception. Fixed40svelocitypre-roll (within5%by38s). G4 at1100solver s,3×dye/40spre-roll:retention.92093318/.92810955,correlation−.08482854,onset9,steady. LowReonset later thanRe2008 (that pair of the ladder passes); no physical unsteadiness. G5realpage57.3603fps,GPUmedian15.6340ms/p9025.0112ms,playback1.51946physical s/wall s,preroll.7564wall s. Re50 replacement ships with explicit D-1 failure label under the lead exception. No complete paper reproduction claim.

### Re50 D-1 shipping exception, declared during its gate

At6648/8000solver s the rolling10T inlet response estimate fell to.7983%U, just below D-1's.8% lower bound. No amplitude changed mid-run. Lead decision **after seeing this partial data**: retain D-1 as failed if the final window is below.8%, report exact measuredε, but allow Re50 shipping if G1/G2 pass independently; label the actual disturbance and missed1%±20% target. This does not turn D-1 into a pass or alter G1/G2/G4. Optional recalibration/newG1 deferred until afterRe400/fineRe200 and only if budget remains.

### Unsteady G1 amendment before Re400 gate

Lead addition after seeing the32-sweepRe400 calibration's4.55%instantaneous spread, **before Re400G1 data**: unsteady variants additionally require per-sample max|D·u|/U≤1e−3 and instantaneous five-sectionspread≤2% at≥95% of samples, plus all original gates. One-second samples compute exact CPU divergence of the same Float32 packed MAC faces, normalized by five-sectionbulkU. Time-mean conservation cannot hide instantaneous cancellation. Measure32first; iffailedtry64ormore and reportfpscost. Fine1.5×Re400 is required: if it becomes steady, label coarse breakup numerical and don't present as physics. Re200finecheck remains separately required.

### Re400 calibration and failed32-sweep instantaneous gate

Force7,ν1.8,dt.005,32sweeps,A.25,first180s plus checkpoint continuation to240s. Last60sRe392.70269; every-stepCFL≤.394524,max|q|19.85994. Exactdivergence samples181..240: only15% satisfy both D/U≤1e−3 and spread≤2%;maxD/U.00222785,95th-percentilespread4.77485%. **Fails amended instantaneous G1; not shipped**, despite bounded time-meanflow. The visibleunsteadiness is not accepted physics. A=.25response≈1.27%U missesD-1highside in shortwindow. 64-sweepforce7.4/A.20bracket120..180s:Re403.73392,CFLmax.416361,max|q|22.46101,instantpass10%,maxD/U.00152968,95spread5.03889%,**fails**. These differing trajectories/forces are not a fixed-RHS convergence trend.128-sweepshortforce7.3/A.17,dt.005,120s follows; require≥95%last60s beforefullG1. If128misses,try256maximum then ask lead beforefurther. No claim predeclared. FineRe400 check remains required.

### Phase3 bounded pressure-correction experiment

128-sweepRe400shortlast60s:Re400.72837,instantpass40%,maxD/U.000702166,95spread3.47840%,response.84734%U. **Fails**95% criterion. Lead cancelled256-sweepevolution before it started;512 permittedonlyfixedRHS. Optionalcapturehookundefineddefault,singlecheckbeforeprojection,noallocation/readbackwhenunset; seed/no-ophookbyte-identicalface/qhardwaretest added.

Two same-tentative-field curves, warm previousq, Float32GPUdivergence RHS, Float64LDL exact reference with CPUsubtraction/Float32roundfaces. Highqcapture120.3s,previousqmax17.3027;worstspreadcapture124.3s.

|capture|sweeps|spread%|maxD/U|
|---|---:|---:|---:|
|highq|32|.695786|.000980843|
|highq|64|.694608|.000573838|
|highq|128|.693462|.000548805|
|highq|256|.692398|.000523450|
|highq|512|.689902|.000497752|
|highq|exact|.000004016|3.80627e−7|
|worst|32|3.459889|.000374209|
|worst|64|3.460239|.000350577|
|worst|128|3.460832|.000341352|
|worst|256|3.461062|.000335927|
|worst|512|3.458624|.000327923|
|worst|exact|.000004404|3.04490e−7|

Jacobi16×work barely changes smoothalong-channelerror. This motivates scalable pressure work rather than changing advection or tuninggeometry. ADR0115 warning: a coarse hierarchy/aggregation is not evidence of convergence; channelconnectivity/low-energy modes matter.

Leadphase3candidate(c),route-localopt-in`coarseCorrection`onlyRe400: CPUinlet-geodesicBFS,128/256bands splitintoconnectedcomponents, piecewiseconstantP, exactGalerkinA_c=PᵀAP, denseSPDCholeskyinverseuploadedR32F. GPUresidual/restrict/densematvec/prolong4passes+8postsweeps. Re50/200unsetandunchanged. C1bothcaptures:spread≤.2%,D/U≤1e−3,main+post≤64sweeps. B128has277aggregates,max1386cells;B256557aggregates,max756cells. **C1fails**. Worst56main+8post:B128spread3.28640%,D/U.0112226;B2563.16833%,D/U.0119465. HighqB256alsofails (raw`coarse-highq.json`). Noevolutionadopted.

CPUFloat64replicationofsamefield/samepreviousqverifiesGPU:worstB25656+8GPUspread3.1683251%vsCPU3.1683226%;D/U.011946470vs.011946439,max|Δq|6.04066e−5. Coarseenergyerror65.71699→61.90421,factor.9419819≤1;correctGalerkinbutweak. SmallgridGPU/CPUalgebratestpasses. Correctioncreateshighfrequencyinterfaceerror;8postsweepsinsufficient. Notanimplementationbug.

OneboundedSAiteration,benchCPUonly: P_s=(I−(2/3)D⁻¹A)P, A_c=P_sᵀAP_s,exactdenseSPDsolve;cycle4Jacobi+SA+4Jacobi. Jacobi64energybaseline65.71373. Worstfirstcycleenergy47.70353,factor.725612>.5,spread2.684885%,D/U.0176393. **C1fails and early-stoptriggered**;nofurthercycles/ω/Btuning/SA GPU/evolution. ConservativeGPUestimate14passes/cycle(4+6+4);rawinitial10wasbookkeepingerrorcorrectedwithoutchangingnumbers. Allowedsetwasω∈{2/3,1},B∈{128,256};nonebeyondfirstω2/3B256testedafterstop. Raw`sa-cpu-worst.json`. Re400remainsunshippedpendingleaddecision;notacceptedphysics/phenomenon.

### Exact-projection physicality probe, post-hoc lead decision

AfterC1/SAfailed,solverworkstops. Leadpost-hocdecision asks bench-only exactLDLprojectionA atRe4001× andB1.5× for≥60solver s,startingpost-spin-up128checkpoint120s. Pair128controlonidenticalwindow;reportprobeSD/frequency/frozenonset. CPUFloat64subtraction/Float32faceuploadperA-1;benchGPUprojectionstillrunsbutisoverwrittenbeforeevolution/passivedye. ExactRHSisFloat64divergenceofcapturedFloat32tentativefaces,independentofGPUpressure. Noproductiondirectsolver.

FineBscalescellsby1.5atunchangedsolverclock:width1620,U×1.5,ν4.05,f10.95,A.255,dt1/300;spatialnoise/probesderivedfromgeometryscaleaccordingly. Explicitα.0135,CFLinvariant. Interpolatepost-spin-upcoarsefacesontheircomponentlatticesandmultiply1.5,projectfineinitialstateexactly;dyeisreset/carrierprefilled. OriginalplanrecalibratesforceifRedrifts>5%;leadamendmentafterBstartup6sRe≈415:donotrepeat23minrun. Report20–60sactualReandnormaliseprobeSDbyownU;slightlyhigherBRebiasestowardunsteadiness,soBsteadywouldstrengthencoarseunderresolutionfinding. NounstatedRe400matchingclaim. RecordmeasuredεratherthanassumeAsetsresponse.23mincheckpointsegmentationifneeded.

Post-hocshippingrule:ifA/Bbothunsteady,leadallows128sweepRe400full22TG1usingoriginaltime-meancriteria,whileexplicitlyrecordingfailureofunsteadyinstantaneousgate;thenG4/G5frontierandlabel95thinstantspread/exactconfirmation/higher2DRe. IfAsteady,solverartefact,noship. IfAunsteady/Bsteady,under-resolved,noship. ThisdoesnotretroactivelymakeinstantaneousG1pass. ExactA1×complete60s:Re400.55425,probeSD5.00368cells/s,dominant.18333solverHz,St_D.210908,onset6,retention.786831/.791195,correlation−.114722,εunsubtracted.87836%U,sampledCFL≤.399931,spread≤3.24484e−7,wall386.757s. Paired128controlsame120→180s:Re400.72180,probeSD5.03455,.2Hz/St_D.229985,onset5,ε1.03842%,sampledCFL.399316,maxspread3.470904%,wall38.039s. Matchedlate20–60sA/control:exactRe400.54575,probeSD/U.196281,f.195122Hz,St_D.224474,onset6;128controlRe400.69118,SD/U.198917,samef.195122,St_D.224393,onset5,maxspread3.4540%. **Correction: all frequencies/St in this paragraph were sampled at1solver-s and are aliases, not resolved shedding frequencies; the earlier finite-window-only explanation is withdrawn.** Exactprojectiondoesnotremove1×unsteadiness;fineBpending,so noRe400replacementyet.

### Fine exact resolution outcome and solver cleanup

Bcomplete60s,splitat59.51333sby23minlockdeadline,remaining.48667sunderfreshlock.20–60smeanRe420.25750(+5.06%versustarget),probeSD11.10296cells/s,SD/U.281807vsA.196281;dominant.097561solverHz,St_D.106973vsA.224474. Measuredεunsubtracted.81357%U,sampledCFL≤.440737,spread≤4.09588e−7. FineBunsteadyclearly,so**single-probeunsteadinesswasobservedwith exactprojectionat1×and1.5×**underpost-hocrule(**correction:** bothexactrunsstartfromanalreadyunsteadyfieldandlast≤1.5T,andfineisatRe420;thisshowsunsteadinesspersistsfor≤1.5flow-throughtimes,notself-sustainedbreakup;seetheindependentBasiliskevidenceinthe`Disposition`section). HigherfineRebias/mismatchexplicit. **Withdrawn frequency/St convergence claim:** the1s-sampled.22/.11values are aliases; frequency resolution convergence is **untested**, not failed;**dyeonsetresolutionconvergenceFAIL**(coarse5–6,fine8–10,final10). Noquantitativereproductionclaim. Fineper-unitvelocityonsetunmeasured.

Unused`coarseCorrection`opt-in/import/allocation/shadersremovedfromrouteengineafterB. RejectedPC/SAprototypesmovedto`mac/__benches__/`,exercisedbyCPU/GPUalgebratests/fixedRHSbenchonly;notinliveenginegraph. Postcleanuphardware3files5passed/1opt-inskipped,includingno-ophookbyte-identicalfaces/q,geometryhash/source-massregressions. Node1057/type0. Re50/Re200gatesstandunchanged.

### Velocity-onset rule frozen before per-unit Re400 data

AfterfineBdyeonset9at40sversuscoarse5–6,leadseparatesdyeareaoverlapfromvelocityunsteadiness. **FrozenbeforeanyRe400per-unitdata:** onsetisfirstunitwhose temporalSD(v)/U exceeds5×themaximumper-unitSD(v)/UinRe200baseline. Collect11corridorcentrelineprobesinupcoming1×iterativeRe400G1/G4andRe200baseline. Re200baseline100–200solver s,U12.483247:per-unitSD/U=[7.88117e−5,1.16541e−5,4.22953e−5,1.12286e−5,3.33209e−5,8.75643e−6,3.82912e−5,1.18361e−5,5.51835e−5,2.52642e−5,1.68464e−5];threshold**.00039405843**frozenbeforeRe400profile. Unitsordereddownstreamfrominlet. NoA/Breplay:theyloggedoneprobeonly. **Fine1.5×per-unitvelocityonsetnotmeasured**;resolutionrobustnessonlyforsingle-probeunsteadiness,dyeareaonsetresolution-sensitive. PreliminaryRe400100..219sprofilefirstunit.00549,third.06888 givesfrozenonsetunit1. Ruleunchanged:Re200nearsteadybaselineputsthresholdbelowRe400ambientinletdisturbance. **Rule-designlimitation:uninformativeforonsetlocation.** Labeldescribesfinalprofilegrowthratherthanclaimonset;stillreportunit1frozenresult. Reportbothonsetdefinitions/order;don'tinventfinevelocityprofileorquantitativereproductionclaim.

### G3 definition correction

PaperDiisΔp_reverse/Δp_forwardatthesameQ/Re,notQforward/Qreverseatequaldrive. G3mustuseε1%twoforcebracketsperdirection,logforceinterpolationatRe200,andlocaln=dlnf/dlnQ. ReportequalforceQratioseparatelywithDi^(1/n)consistencycheck. `derived/fig2e.csv`logReinterpolationbetweenRe196.7709/210.6146givespaperDi**1.591375**,digitizedband**[1.565226,1.617524]**atRe200. Digitizationuncertainty/bandisnotrawexperimentalerrorbar. NoDiacceptancebeforeactualmatchedRebrackets.

### G3 measured diodicity with 1% disturbance

Two steady force brackets per direction, each1000solver s and last10Taverages, identical frozen geometry/ν1.8/dt1/80/32sweeps. Forwardf1.8/Re181.81341/Q341.920741 andf2.3/Re219.12345/Q412.086502;reversef2/Re187.53989/Q352.690038 andf2.3/Re205.58595/Q386.627706. Log-force interpolation atRe200 givesfF2.04007494,fR2.20560814,**Di1.08114075**. LocalnF1.31324285,nR1.52125751. PaperDi1.591375[1.565226,1.617524]:**G3paperdiodicityFAIL**. Equalforce2.3measuredQF/QR1.06584835;Di^(1/nF)=1.06120780,Di^(1/nR)=1.05262218. These are approximate checks because direction-dependent slopes differ, not alternate Di definitions. At equalforce2.3 the local power-law fits predict the measured ratio exactly by construction; that is consistency, not independent validation.

Post-spin-up baseline121–220s variance subtracted in quadrature. Measured inletεagainst frozen targetU12.5:forwardlow1.06892%,forwardhigh.97287%,reverselow1.06055%,reversehigh1.03100%. Bracket meansectionspreads1.49e−6/2.65e−6/1.02e−6/1.96e−6. All steady, no sustained pressure growth. Forwardhigh every-stepCFL.515519 exceeds preferred.5 but is below original1;lead explicitly permits this diagnostic-only bracket. Cheap checkpoint continuation atdt1/100 scalesqby.8 and preserves forcing clock:240solver s≈3.05T,Q412.738954(+.158329%;lateT+.163709%),CFL.413292. Below declared.2%Q trigger, so retain original interpolation;no shipped timestep changed. These brackets are not separate22TG1shippinggates.

### Re400 original full flow gate and G4

AfterexactA/Bphysicalitycheck,leadexceptionpermitsoriginalG1only,whileamendedgatefailurestaysvisible. Force7.3,ν1.8,dt.005,128sweeps,A.17,1000solver s=23.18821T. Last10T569–1000s:Re400.692258,Q753.547240,fluxSD1.850383=.245556%,meansectionspread.0120636%. Fivefluxmeans753.519513,753.559337,753.598613,753.551034,753.507702. Every-stepCFLmax.40824055,max|q|20.903912,noNaN;lastwindowqmaxima17.30856,17.30478,17.31209,17.31395,bounded. Every-stepouterbackflowKE/volume0. OriginalG1/G2PASS. Amendedinstantgate**FAIL**:38.9178%ofsamplesmeetboth,95spread3.45119%,maxD/U.000744304. Don'tcallthisfullyconservativeinstantaneousflow.

Last10Tεunsubtracted.877791%U,probeSD5.03007. Historical1s-sampled fdominant.196759solverHz/St_D≈.2263 is an alias, **not a shedding measurement**. UnitSD/U=[.00549286,.01298179,.06880947,.07010607,.09845531,.08524102,.09399090,.05159299,.13971979,.05860120,.02383631],growthunit1→3=12.5271×. Frozenvelocityonsetunit1(ruleuninformativeasdisclosed).

G4at470s,dyedevelops450safter20svelocitypre-roll=10.44T:retention.7653023/.7598688,correlation−.1258492,mixedareaonset6(final),5–6overtime;unsteady. Coarsedyeonsetorder50:9>200:8>400:5–6passes;fine4008–10versus2008does**not**establishstrictorder,quantitativeFAIL. Paler/weakerthanFig4. G5pendingduesevereforeignload.

Dyeviewerpre-roll1T43s+20svelocitycost37.32wall satload≈38,sofixedpassivedyecap**7solver s**byownerdecision(noadaptivewallstop);measured15.99wall satsevereload≈70–90isnotlowloadbudgetevidence. Remeasure≤10swhenloadpermitsG5,loweronlyifnecessary. dt/sweepsunchanged;passivedyepre-rolldoesnotalterG1.

### Re400 G5 and shipped pre-roll amendment

Firsteligiblefallbackwindow,actualpage1280×900/DPR2scroll,3×dye,128sweeps,dt.005,4steps/frame: **54.2939presentedfps**,GPUmedian12.7269ms/p9013.1887ms,RAF60.0038fps,playback.191773physical s/wall s. T≈6.74physical s gives≈35.1wall s/T,within45s/Talternative. Load9.6968before→26.7261after;6foreignChromeGPUprocessesbefore/after,noneours. Minimumcanvasvisiblefraction.3094. Original20svelocity+7sdye pre-roll15.9036wall s,misses10sbudget. Raw`perf/reverse400-steps4-final-scroll.json`,load/PIDmanifestsretainedmachine-local.

Leaddecision**afterthismeasurement**:54.3fpsunderincreasingcontentionacceptsasconservative4steps/framepass;repeatonceatload≤5ifwindowoccurs,drop3onlyifrepeat<50. Thiswaivestheearlier45–55repeat-before-shippingcondition;notanuncontendedmeasurementclaim. Nofrontier3/2neededbecausehighestallowed4passes. Shippedpre-roll**10svelocity+3sdye**,fixedtrajectory,velocitywithin5%by8sinthecalibration. Thisdiffersfrom20svelocitypre-rollusedforG4:publishedG4dyemetricsdescribeadevelopedstateafter≈1T,**notthefirstframe**. Realpage10/3recheck**7.4402wall s**,readyatstep2608,picturedcarrierandbothfilaments(nonblank);machine1minload≈50,notanuncontendedbudgetclaim. Noalterationtodt/sweeps/force/geometry. G5performanceacceptanceandinstantaneous-conservationexceptionremainseparate. Viewerdescriptionaddsestimated**15–20wall safterloading**fordyetoreachmid-valvebreakupregion,derivedfrom≈35wall s/Tandunit5–6locationratherthanvisualtiming;startupframeisnotadevelopedbreakupclaim.

### Fine Re200 calibration and completed10T comparison

At1.5×,width1620,height189,ν4.05,dt1/120(coarse1/80÷1.5),64sweeps,A.093. Forcebracketsf3.3/Re210.15878andf3/Re197.15057(last60s)yieldlogsecantf**3.0649061421**. FirstbracketCFLmax.465778,instantp95spread.023895%,maxD/U4.00559e−6;64sweepssufficientforthatsteadywindow. Calibrated1000s3×dyerun,40svelocitypre-roll,targets≥10Tpost-spinup;at284sRe200.00109,CFLmax.443566,D/U1.41e−6,instantspread.01797%. Completed1000solver s=11.57443T,≥10Tpostspinup,lastwindow137–1000s:Re200.006123,fluxSD.00596279%,five-sectionmean spread.000160059%. Every-stepCFLmax.44356626≤.5,instantp95spread.0226414%,maxD/U4.55204e−6. ProbeSD.000194461cells/s,SD/U≈1.037e−5,noresolvedfrequency;ε.973352%U. **FineRe200remainslaminar;all11dyemixedfractions0,onsetnone**. Retention.91998076/.92658845,correlation−.08917394. CoarseRe200apparentareaonset8isnumericaldyediffusion,notphysicalunsteadiness. Descriptionnowstatespaper mixingfails/laminarthroughout/finegridnomixing/3Drigunit3–4. Originalsteadytime-meancriteriaandreportedinstantmetricsgood;this11.57Tresolutionrunisnotaseparate22TG1shipgate.

### Reverse Re200 disturbance sensitivity

Lead narrowed remaining sensitivity work before data:reuse existingε0force brackets;runreverseRe200at≈3%andreportper-unitvelocitySD/Uanddyeonset. Separate3%Di brackets onlyif3%becomesunsteady. Force2.2,dt1/80,32sweeps,A.213,3×dye,20svelocitypre-roll,1000solver s=11.55847T. Last10T135–1000s:Re199.730383,Q375.615640,fluxSD.0195762%,meansectionspread2.83576e−6,every-stepCFL.45155082. Baseline-subtractedinletresponse**3.53326%frozenU**(accepted3%±20%). Per-unitSD(v)/U=[.000252630,.0000312202,.000121967,.0000292760,.0000989573,.0000194887,.0000998197,.0000297728,.000144145,.0000677150,.0000478338]. Compare1%profilemax.0000788117,unit3.0000422953:largernoiseraisesforcedfluctuationsroughly3×butallunitsstaybelowfrozen.000394058threshold. **No self-excited transition at3.53%**;summaryweakfrequency.0138568Hzisforced/noise response,notpaperbreakup. Dyeonset**8**,unchangedfrom1%;retention.9163139/.9096032,correlation−.0699708. Existingε0post-spinupprobeRMS7.90911e−6cells/s,steadyforcebrackets;noε0dyeonsetmeasured. Separate3%Di skippedunderleadstoprulebecauseflowstayssteady. Noamplitudeorsolverretuningafterseeingdyeonset.

### Performance load control dynamics

IndependentcrosscodeCFDlaneusesDocker≤4CPUcores,noGPU. LeadadditionforfutureG5:record`uptime`before/after;initiallywaitif1minload>5;laterleadboundedwait15min,thenmeasureanywayascontendedifstillhigh,repeatlateronlyif45–55fps.RecordforeignChromeGPUprocesspresencewithread-only`ps`;neversignalforeignprocesses. GPUlockremainsmandatory. EarlierRe50/200G5predatethisloadrule;don'tinventhistoricalloadvalues. FirstobservationduringRe400G1load6.60/7.93/10.47,notaperformancemeasurement. OwnperfdriverwaitsoutsideGPUlockandwritesbothuptimevalues. Finalleadamendmentduringsevereforeignburst(load69–144):ifloadstill>20after15min,**deferG5**,runphysics-onlywork,retryateverycleancheckpointwhen≤5or≤10fallback. NoFPSclaimatload144. Re400G5deferredatcapload≈91;loadlater105.55. Ownlane/crosscodeprocessesnotblamedorforeignprocessessignalled.

### Lead additions before resolution/ladder data

ReverseRe200 also receives a1.5× grid check, wbar≈45, at measuredRe200±2%,≥10T after spin-up, ε1%; compare onset and unsteadiness probe. If fine grid becomes unsteady, label coarse result under-resolved rather than blaming2D physics. If a higher reverse rung400/800 is unsteady and passesG1, label explicitly: “2D needs higher Re than the paper’s 3D rig (Re200) for this breakup.” No relabelled Reynolds number or claim of a match.

### Aliasing correction: step-level shedding and exact amplitude comparison

The earlier Re400 records sampled once per solver second. With clock6.408solver s/physical s, Nyquist is3.204physical Hz (St≈.575 atRe400), below the actual shedding. The historical St≈.22 at1× and≈.11 at1.5× are **aliases, not resolved shedding frequencies**. Their difference cannot establish failed frequency convergence. Those values remain above only as explicitly corrected historical records. Fine1.5× frequency is **untested**; no new fine GPU run. Independent Basilisk's earlier4.7physical Hz is also near its own sampling limit; no quantitative cross-code frequency match is claimed.

Follow-up uses the same post-spin-up `reverse400gate` checkpoint at1000solver s,30solver s continuation,6000 every-step samples,dt.005; no passive dye required. Both128sweep GPU projection and Float64 LDL exact projection run from identical fields/forcing clock. Own atomic GPU locks/PID manifests/deadlines; wall48.7758s iterative,207.6079s exact. Clock6.408,physical record4.68165s,Nyquist640.8physical Hz,Fourier bin spacing.2136physical Hz (St≈.0383). Spectra use linear detrending + Hann taper; quoted frequencies are discrete bins, not sub-bin estimates or confidence intervals.

| Quantity | 128 sweeps | Exact projection |
|---|---:|---:|
| Mean Re | 400.687905 | 400.573897 |
| Q fundamental solver Hz | .8 | .8 |
| Q fundamental physical Hz | 5.1264 | 5.1264 |
| Fundamental St_D | .920018 | .920280 |
| Q fundamental amplitude, cells²/solver s | 2.585540 | .429418 |
| Second harmonic physical Hz | 10.2528 | 10.2528 |

All five section fluxes peak at5.1264physical Hz. All iterative unit probes except10 peak at the fundamental; unit10 peaks at the second harmonic. Exact units1–2,5–9,11 peak at5.1264Hz; units3–4 peak at adjacent5.34Hz bin, unit10 at10.2528Hz. Iterative Q second-harmonic amplitude.150041 (power.00337 of fundamental); unit-probe second-harmonic power ratios range.00126–.118 except unit10 where it dominates. Exact Q second-harmonic amplitude.0229542 (power.002857 of fundamental), with additional low-frequency/transient power; full probe spectra remain in machine-local `spectra-analysis.json`. **No resolved fundamental-frequency shift between iterative and exact at1×** at this record length; frequency convergence across resolution remains untested.

Step-level temporal SD(v)/own meanU, all30s (not Fourier amplitude; **upstream exact units1–4 are transient-dominated, see the per-sixth and last-window tables below**):

| Unit, downstream order | 128 sweeps SD/U | Exact SD/U | Iterative/exact | Phase128, rad | Phase exact, rad |
|---|---:|---:|---:|---:|---:|
| 1 | .00549450 | .000879421 | 6.24786 | 2.60796 | −2.26393 |
| 2 | .0129597 | .00331424 | 3.91030 | 1.91737 | 3.00584 |
| 3 | .0689775 | .0307795 | 2.24102 | −.479157 | −.161835 |
| 4 | .0701758 | .0472998 | 1.48364 | .095685 | .515708 |
| 5 | .0985463 | .0856268 | 1.15088 | −.029500 | .140483 |
| 6 | .0854124 | .0875174 | .975947 | −.012393 | .164550 |
| 7 | .0943518 | .0926882 | 1.01795 | −.535454 | −.427551 |
| 8 | .0517072 | .0516523 | 1.00106 | −.228270 | .020076 |
| 9 | .139523 | .140990 | .989595 | −2.23232 | −2.05331 |
| 10 | .0585467 | .0604850 | .967954 | −.376744 | −.272839 |
| 11 | .0237981 | .0242207 | .982553 | −.891748 | −.731897 |

Phases are complex Fourier phases at5.1264physical Hz, relative to each record start, wrapped to[−π,π]. Adjacent phase differences change sign; unit10 is harmonic-dominated and early exact probes have weak fundamental amplitude. Thus **no unique cross-unit phase speed is inferred**: converting wrapped phase into travel time would require unverified cycle counts/a traveling-wave model. This is a spatially coupled shedding pattern, not evidence for a single advected wave.

Q fundamental inflation is**6.02103×**; aggregate11-probe RMS ratio1.07515 hides strong spatial error. The all-30s table above is **dominated by a start-up transient and must not be read as a settled comparison**: the exact record starts from the128-sweep checkpoint, so its upstream units1–4 decay over the whole record while downstream units5–11 stay level. Raw per-sixth SD/U (exact; recomputed by `mac/__benches__/window-sd.ts` from `spectrumexact.json`/`spectrum128.json`, same U definition as the table, population SD):

| Exact unit | 1st sixth | 2nd | 3rd | 4th | 5th | 6th |
|---|---:|---:|---:|---:|---:|---:|
| 1 | .002038 | .0003397 | .0003793 | .0002385 | .0002339 | .0003208 |
| 2 | .007882 | .001085 | .001040 | .0005714 | .0004031 | .0007738 |
| 3 | .06677 | .03353 | .006074 | .006111 | .003177 | .002416 |
| 4 | .07320 | .07251 | .04232 | .02376 | .01820 | .009535 |
| 5 | .09437 | .09338 | .08996 | .08472 | .08066 | .06244 |
| 9 | .1409 | .1399 | .1429 | .1435 | .1473 | .1309 |

The iterative run is stationary (unit1/3/4 SD/U ≈.0055/.069/.070 in every sixth). So the iterative solve *sustains* upstream fluctuations that the exact solve damps. **Exact units1–4 are still decaying at30s; no settled exact value exists**, and any ratio below is a lower bound on the eventual inflation. Iterative/exact SD/U over the last third (rows4000–5999) and last sixth (5000–5999):

| Unit | Last third iter/exact | Last sixth iter/exact |
|---|---:|---:|
| 1 | 19.56 | 17.17 |
| 2 | 21.03 | 16.78 |
| 3 | 24.48 | 28.58 |
| 4 | 4.831 | 7.360 |
| 5 | 1.365 | 1.578 |
| 6 | 1.040 | 1.051 |
| 7 | 1.159 | 1.147 |
| 8 | .9562 | .8902 |
| 9 | 1.000 | 1.065 |
| 10 | .9705 | .9970 |
| 11 | .9768 | .9871 |

In the last third the iterative solve exceeds exact by≈20× at units1–3 (19.6/21.0/24.5×) and4.8× at unit4. Downstream units6–11 agree within **15.9%** (last third) / **14.7%** (last sixth); unit5 is still decaying (1.37×/1.58×). The all-30s figure "within3.205%" (units6–11) and "overstated1.15–6.25×" were artefacts of the transient and are withdrawn. Exact unit1→3 SD/U growth is 34.9997× over all30s but 10.04× over the last third and 7.53× over the last sixth (iterative 12.55×), so the earlier "35×" is a transient artefact too and is not a claim. **The upstream fluctuations at units1–4 in the shipped variant are largely a projection-leak artifact**; this is inferred from the exact solve's decay, not from a separate causal intervention. The earlier single-probe amplitude agreement at unit9 does **not** validate the full velocity field. No physics/solver/pre-roll parameters changed.

`metrics.ts` now rejects a spectral label above.4sampling rate, rejects nonuniform intervals, and accepts optional expected solver-frequency bandwidth requiring≥8samples/cycle. Re400 measurement summaries pass prior St_D≈1 bandwidth, so their1s rows return null rather than low aliases. A low alias alone cannot reveal its high-frequency source; the prior bandwidth is necessary. Node regression covers near-Nyquist rejection, expected-bandwidth alias rejection, and a resolved signal.

### Fine-grid every-step frequency check: pre-registered tolerance and scatter

Pre-registered before this run: compare1.5× Q peak with1× exact5.184physical Hz using±.20Hz tolerance **after Reynolds normalization via St_D**. Within tolerance counts as supporting grid robustness under the rule; a larger shift toward Basilisk4.74Hz indicates resolution sensitivity; otherwise unresolved. This does not waive stationarity or Re-matching limitations.

Housekeeping after owner pause: no owned runner/browser survivors, GPU lock free, no partial fine-frequency output to retain. Start from existing exact400b fine checkpoint,post-spin-up180solver s:width1620,height189,ν4.05,force10.95,noise acceleration.255,dt1/300. Continue30solver s with128sweep iterative projection;9000 every-step Q and11unit-probe samples. No physics,tuning,geometry,forcing or pre-roll changes. Bench-only fix derives output width from source checkpoint width×scale (previous hardcoded1080 would downsample a native fine source), adds explicit sweep override, samples inlet probe once/solver-s **only for ε RMS**, never spectra. Own lock released within25min; in-loop23min deadline, exact runner/browser PID manifests; no timing used as performance under foreign load.

All frequency estimates below use the identical linear detrend,Hann taper,and log-power three-bin parabolic estimator. This reproduces lead1× values5.15550Hz iterative/5.18369Hz exact. Clock6.408solver s/physical s at both grids;fine Nyquist961.2physical Hz. Record30solver s=4.68165physical s,raw bin spacing.2136Hz. Sub-bin estimates are not precision error bars.

| Record | Mean Re | Q peak physical Hz | St_D | Half-window Q peaks, Hz | Peak-to-peak spread, Hz |
|---|---:|---:|---:|---|---:|
| 1× iterative | 400.687905 | 5.155502 | .925241 | 5.155497 / 5.155397 | .000100 |
| 1× exact | 400.573897 | 5.183689 | .930564 | 5.275995 / 5.225772 | .050222 |
| 1.5× iterative | 420.205174 | 5.252140 | .898804 | 5.376220 / 5.025863 | .350357 |

Fine ε temporal3×3inlet RMS from30samples: .873364%frozen targetU37.5cells/s, .831370%own measuredU; not baseline-subtracted and short-window only. Fine remains Re≈420,not matched400. Normalize fine Q frequency to1× exact Re400.573897: **5.006769Hz**,difference **−.176920Hz**;St shifts−3.413%. **Within the pre-registered ±.20Hz (−.177Hz, normalized to the1×Re).** However normalized half-window peaks5.125052/4.791063 give **.333989Hz peak-to-peak spread**,larger than the shift. This weakly supports grid robustness under the declared rule; it does **not establish** it. **The test was underpowered: the ±.20Hz tolerance is narrower than one raw bin (.2136Hz) and the half-window scatter (.35Hz) exceeds the shift, so the verdict carries no information and frequency grid-convergence is unresolved.** The shipped description therefore omits "within tolerance". The .334Hz quantity is a spread,not±.334 uncertainty or a confidence interval.

Fine per-unit dominant peaks,downstream1–11,physical Hz: [5.214278,5.253773,5.266394,5.590884,5.612239,5.608138,5.550522,6.094553,5.967260,5.930155,5.925950]. This short fine record is not spatially single-frequency like the1×periodic run; no unique phase-speed or harmonic-convergence claim. Raw` spectrumfine128.json` and`fine-frequency-analysis.json` remain machine-local.

Direction matters: fineSt.898804 lies between1×MAC.930564 and independent Basilisk≈.835;shift is toward Basilisk. The cross-code frequency gap remains unexplained; candidate causes include resolution,cut-cell versus staircase walls,and ε. No claim that this check resolves the≈7–9%cross-code discrepancy. Description reports tolerance plus scatter,not a bare convergence claim. Earlier statements that fine frequency was untested are historical and superseded by this subsection.

## Disposition and limits

Forward/reverseRe200andreverseRe50replacementsareverifiedasrecorded;forwardG4passes,reverse200paperunsteadinessfails,Re50D-1failsunderexplicitexception. Re400originalmeanG1/G2/G4complete,G5accepted54.3fpsunderload9.7–26.7with4steps/frame;amendedinstantgatefails,dyeonsetresolutionconvergencefails,step-level1.5×frequencyiswithinpre-registeredtoleranceafterRenormalizationbutlargehalf-windowscatterweakenssupport (earlierStcomparisonaliased). Re400shipsunderexplicitpost-dataleadexceptions,notfullpaperacceptance. G3complete:Di1.08114versuspaper1.59138fails. FineRe200remainslaminarwithnodyeoverlap;3.53%ambientresponsealsofails totriggerRe200transition. Re800skippedbecauseRe400alreadyunsteady. OptionalRe50disturbancerecalibrationnotrun;itsrecordedD-1exceptionremains. Existing public absorption feature untouched. Two-dimensional flow lacks depth walls/three-dimensional instabilities; artificial ambient disturbance is explicitly disclosed, not turbulence synthesis or paper matching. Molecular diffusion omitted; numerical transport still broadens the thinnest filaments. No scalable solver replacement, new inflow boundary, path tuning, confinement, depth drag, runtime dependency or public API.

### Review corrections (2026-10-23)

- **Unsteadiness claim.** "Breakup confirmed with exact projection" overclaimed: both exact runs start from an already-unsteady field and last ≤1.5T, and the fine run is at Re420. What is shown: unsteadiness persists for ≤1.5 flow-through times under exact projection, from an unsteady start (fine grid at Re420). Independent support: Basilisk (23 cells/w̄) shows Re400 shedding is self-excited with **zero** inlet disturbance (Q4.712Hz, St.835; late/early fundamental amplitude1.19 over ~1T). The MAC–Basilisk gap stays: St.92 vs .835, ~9%, unexplained.
- **Fine-frequency test underpowered.** Tolerance (±.20Hz) < bin width (.2136Hz) and half-window scatter (.35Hz) > shift (see that subsection). Grid-convergence of the shedding frequency is unresolved.
- **Playback factors.** `scripts/flame-scroll-perf.mjs` read `physicalSeconds` before rAF collection and after tracing, but divided by the rAF span, so every stored factor exceeds the physical ceiling 4·dt·rAFfps/6.408 by1–2.4%. Recomputed from the stored `perf/*-scroll.json` (rAF≈60.00fps, 4 steps/frame): Re50 1.5195 vs ceiling1.4982; Re200 (forward/reverse) .4726 vs .4682; Re400 .1918 vs .1873. Quote these as ≈ ceiling. The script now samples `physicalSeconds` in the same rAF callbacks that bound the window; no hardware rerun yet, so stored numbers keep the overshoot.
- **D-1 sponge clearance violated.** D-1 requires the disturbance support ≥1w̄ from mouth and sponge. The shipped forcing (`engine.ts`, centre plenum∓2.25w̄ beyond the mouth, half-width .7w̄) has support [32.24,74.36] cells from the inlet end of the1322-cell domain, with the sponge ending at31: clearance **1.24 cells vs ≥30.09 required**. The forcing was deliberately **not** moved (it would change physics and invalidate calibrations); the ε calibrations stand as measured responses under this placement. `mac/geometry.test.ts` pins the interval so any change is deliberate.
- **Feedback-loop exposure.** `bind()` attached `divergence` (unit2), `columns` (unit5) and `scratch` (unit6) in every program, including the passes rendering into them. Those passes now bind a1×1 dummy instead; their shaders never read the target in that pass, so output is byte-identical (verify with the `mac.browser.test.ts` byte-identity checks on hardware).
- **Alias guard.** The St_D≈1 expected-frequency bandwidth is now passed for every target Re, not only ≥400.
- **Context loss.** `PaperFlow.svelte` stops on `webglcontextlost` (preventDefault, rAF cancelled, status "GPU context lost — press Restart"); no auto-rebuild on restore, Restart remounts. Untested (needs a GPU context).

### Construct-only laboratory options (2026-10-23)

Route-local `MacOptions` now exposes the existing constants without changing any variant: `plenumWidths=4`, `spongeWidths=1`; `disturbance={centerWidths:2.25,halfWidthWidths:.7,timeFactor:.05,spatialDivisor:3,seed:704}`; `filament={widthCm:(.755622*2)/36,spacingCm:(.755622*11)/36}`; `tracers={capacity:262144,rate:2048,sigma:.25}`; `pressureSolver='jacobi'`. `bufferRate` remains the sponge rate; `noiseAcceleration` remains the disturbance amplitude. Geometry and forcing keep their original arithmetic order and default placement, including the disclosed D-1 clearance violation. Dye and tracers share one computed source.

`resolveMacOptions()` gives stable, fully defaulted checkpoint options, including nested objects and `'grid'` for omitted dye. Restore compares resolved options on both sides, accepting legacy checkpoints lacking these keys while rejecting real differences. Pure, field-specific `RangeError` validation precedes WebGL context/resource allocation, including rasterized domain support/source checks. This is options plumbing, not recalibration.

A single private `solvePressure()` owns the unchanged paired-Jacobi loop. `'two-level'` is reserved but rejects with `RangeError('two-level pressure not available in this build')`. Route-only `pressureSolverOverride?: () => void` can replace the loop after divergence and before gradient subtraction for controlled solver experiments; unset means the original solve, no checkpoint field. No package API, tuning value or variant is changed.

Hardware verification: the old four-file engine graph was frozen before edits, then compared against omitted and explicit defaults on Chrome/ANGLE Metal at240-wide valve,12steps, directions±1, noise acceleration0/.03. Every velocity, pressure, dye, tracer-state and geometry SHA256 matched; permanent hashes live in `mac.browser.test.ts`, temporary snapshot deleted. A second hardware run against pinned hashes passed. The isolated non-default sponge (5-width plenums,2-width sponge) has maximum section-flux relative error1.1472774e−7 (limit1e−6), transverse squared-velocity sum2089.441406→2061.545582. Zero noise matches omission; seed13 changes the field and repeats byte-identically. Legacy checkpoint restore and override ordering pass. Full node1102tests/type0errors/0warnings; hardware18passed,1long measurement opt-in skipped. No performance claim from these short runs.
