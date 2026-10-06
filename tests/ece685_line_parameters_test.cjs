'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const model=require('../assets/js/ece685-stage-model.js'),diagrams=require('../assets/js/ece685-stage-diagrams.js');
const near=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=tolerance*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);
test('L22–L25 reproduce independent published slide examples with SI conversions',()=>{
  const examples={
    'line-conductor':{resistance_ohm:8.7570527,inductance_mh_km:1.2620915,reactance_ohm:57.4291123,loop_resistance_ohm:17.5141054},
    'line-inductance':{gmd_m:6.2144650,inductance_mh_km:1.2691744,reactance_ohm:57.7514084},
    'line-capacitance':{capacitance_nf_km:9.12669913,susceptance_ms:.415293373,charging_current_a:33.0882242,capacitive_mvar:7.908847},
    'line-bundles':{resistance_ohm:2.2176,reactance_ohm:47.6713512,capacitance_nf_km:11.5904559,susceptance_ms:.562562152,resistance_pu:.00088704,reactance_pu:.0190685405,susceptance_pu:1.40640538}
  };
  for(const [kind,metrics] of Object.entries(examples)){const r=model.solve(kind);for(const [key,value] of Object.entries(metrics))near(r.metrics[key],value);}
});
test('temperature, conducting area and magnetic geometry remain distinct',()=>{
  const a=model.solve('line-conductor'),b=model.solve('line-conductor',{area_mm2:1000}),c=model.solve('line-conductor',{temperature_c:20}),d=model.solve('line-conductor',{spacing_m:12});
  near(b.metrics.resistance_ohm,a.metrics.resistance_ohm/2);near(b.metrics.inductance_h,a.metrics.inductance_h);
  near(a.metrics.resistance_ohm/c.metrics.resistance_ohm,1+.00403*55);
  near(d.metrics.inductance_mh_km-a.metrics.inductance_mh_km,.2*Math.log(2));
  const simple=model.solve('line-conductor',{rho20:2.8e-8,area_mm2:200,length_km:10,temperature_c:20,path_factor:1,ac_factor:1});near(simple.metrics.resistance_ohm,1.4);
});
test('physical geometry, transposition and balanced per-phase reactance obey analytical identities',()=>{
  const eq=model.solve('line-inductance',{spacing_ab_m:6,spacing_bc_m:6,position_angle_deg:120});
  eq.geometry.distances.forEach(d=>near(d,6));near(eq.metrics.gmd_m,6);
  const a=model.solve('line-inductance'),b=model.solve('line-inductance',{frequency_hz:120,length_km:241.4016});
  near(b.metrics.inductance_h,2*a.metrics.inductance_h);near(b.metrics.reactance_ohm,4*a.metrics.reactance_ohm);
  near(a.metrics.reactance_ohm,2*Math.PI*60*a.metrics.inductance_h);
  assert.ok(a.metrics.arithmetic_error_percent>1);
});
test('charging uses physical radius, phase voltage and one total three-phase formula',()=>{
  const a=model.solve('line-capacitance'),b=model.solve('line-capacitance',{voltage_ll_kv:131.1}),c=model.solve('line-capacitance',{length_km:241.4016});
  near(b.metrics.capacitance_uf,a.metrics.capacitance_uf);near(b.metrics.charging_current_a,.95*a.metrics.charging_current_a);near(b.metrics.capacitive_mvar,.95**2*a.metrics.capacitive_mvar);
  for(const key of ['capacitance_uf','susceptance_ms','charging_current_a','capacitive_mvar'])near(c.metrics[key],2*a.metrics[key]);
  near(a.metrics.capacitive_mvar,3*a.metrics.phase_voltage_kv*a.metrics.charging_current_a/1000);near(a.metrics.absorbed_mvar,-a.metrics.capacitive_mvar);
  near(2*a.metrics.pi_end_ms,a.metrics.susceptance_ms);
  const wrong=model.solve('line-capacitance',{radius_mm:10.9});assert.ok(wrong.metrics.capacitance_nf_km<a.metrics.capacitance_nf_km);
});
test('bundle radii match the full self/mutual geometric product, including square diagonals',()=>{
  const d=.4572,ds=.01792224,r=.0223774;
  for(const n of [1,2,3,4]){
    const pts=n===1?[[0,0]]:n===2?[[0,0],[d,0]]:n===3?[[0,0],[d,0],[d/2,d*Math.sqrt(3)/2]]:[[0,0],[d,0],[d,d],[0,d]];
    const full=self=>Math.exp(pts.reduce((total,[x,y],i)=>total+pts.reduce((sum,[u,v],j)=>sum+Math.log(i===j?self:Math.hypot(x-u,y-v)),0),0)/(n*n));
    const m=model.solve('line-bundles',{bundle_count:n}).metrics;
    near(m.bundle_gmr_m,full(ds));near(m.bundle_radius_m,full(r));near(m.resistance_ohm,4.4352/n);
  }
});
test('parallel circuit equivalencing and base changes preserve the individual physical circuit',()=>{
  const a=model.solve('line-bundles'),b=model.solve('line-bundles',{circuits:2}),c=model.solve('line-bundles',{s_base_mva:200});
  for(const key of ['resistance_ohm','reactance_ohm','susceptance_ms','capacitive_mvar']){near(a.metrics[key],b.metrics[key]);near(a.metrics[key],c.metrics[key]);}
  near(b.metrics.equivalent_x_ohm,a.metrics.reactance_ohm/2);near(b.metrics.equivalent_b_ms,2*a.metrics.susceptance_ms);
  near(c.metrics.equivalent_x_pu,2*a.metrics.equivalent_x_pu);near(c.metrics.equivalent_b_pu,a.metrics.equivalent_b_pu/2);
});
test('invalid geometry and incompatible numeric choices are rejected before logarithms',()=>{
  for(const [kind,p] of [['line-conductor',{area_mm2:0}],['line-conductor',{spacing_m:.02}],['line-inductance',{position_angle_deg:180}],['line-capacitance',{radius_mm:1000}],['line-capacitance',{epsilon_r:0}],['line-bundles',{bundle_count:2.5}],['line-bundles',{bundle_count:'2'}],['line-bundles',{circuits:3}],['line-bundles',{bundle_spacing_m:.01}],['line-bundles',{bundle_spacing_m:5}]])assert.throws(()=>model.solve(kind,p));
});
test('Python agrees with the browser model for every bundle and non-horizontal geometry',()=>{
  const cases=[];
  for(const module of ['line-conductor','line-inductance','line-capacitance','line-bundles'])cases.push({module});
  for(const module of ['line-inductance','line-capacitance','line-bundles'])for(const position_angle_deg of [0,60,120])for(const frequency_hz of [40,70])cases.push({module,position_angle_deg,frequency_hz});
  for(const bundle_count of [1,2,3,4])for(const circuits of [1,2])cases.push({module:'line-bundles',bundle_count,circuits,s_base_mva:1000});
  const program="import sys,json,importlib.util\nsys.dont_write_bytecode=True\ns=importlib.util.spec_from_file_location('m',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps([m.solve(c) for c in json.load(sys.stdin)]))";
  const python=cp.spawnSync('python3',['-c',program,'assets/code/ece685_stage_one.py'],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:5e6});assert.equal(python.status,0,python.stderr);
  const results=JSON.parse(python.stdout);
  function compare(a,b){if(typeof a==='number')near(a,b);else if(Array.isArray(a)){assert.equal(a.length,b.length);a.forEach((x,i)=>compare(x,b[i]));}else if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const key of Object.keys(a))compare(a[key],b[key]);}else assert.equal(a,b);}
  cases.forEach((p,i)=>{const {module,...inputs}=p;const r=model.solve(module,inputs);compare(r,results[i]);for(const lang of ['en','zh'])assert.doesNotMatch(diagrams.render(p.module,r,lang).markup,/NaN|Infinity|undefined/);});
});
