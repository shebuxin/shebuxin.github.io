const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const model=require('../assets/js/ece685-stage-model.js');
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);

test('source data, accounting signs, daily energy, reserve, and cost crossovers',()=>{
  const o=model.solve('overview');near(o.metrics.generator_mw,84);near(o.metrics.generator_mvar,27);
  const compensated=model.solve('overview',{shunt_mvar:20});near(compensated.metrics.generator_mvar,17);near(compensated.metrics.generator_mw,84);
  near(model.solve('overview',{transmission_kv:69}).metrics.transmission_current_a,2*o.metrics.transmission_current_a);
  Object.values(o.checks).forEach(v=>near(v,0));
  const g=model.solve('generation');near(g.metrics.energy_mwh,77960);near(g.metrics.capacity_target_mw,5037);near(g.metrics.capacity_gap_mw,187);
  near(g.metrics.crossover_hours,67000/14.851);assert.equal(g.metrics.cc_units,4);assert.equal(g.metrics.gt_units_load,6);assert.equal(g.metrics.extra_gt_prm,7);
  assert.ok(g.metrics.mix_accredited_mw>=g.metrics.annual_target_mw);
  for(const c of [{gt_variable:26.05},{cc_variable:100,cc_fixed:1},{wind_mw:5000,solar_mw:5000},{wind_credit:1,solar_credit:1}]){
    const r=model.solve('generation',c);assert.equal(r.checks.annual_load_covered,1);assert.equal(r.checks.reserve_met,1);near(r.checks.sorted_energy_difference,0);
  }
  assert.equal(model.solve('generation',{gt_variable:26.05}).metrics.crossover_hours,null);
  const p=g.plots[0], energy=p.curves.map(c=>p.x.slice(0,-1).reduce((s,x,i)=>s+c.values[i]*(p.x[i+1]-x),0));
  energy.forEach(e=>near(e,77960));
});

test('single-phase average instantaneous power and capacitor correction',()=>{
  const r=model.solve('single-phase');near(r.metrics.p_w,1200*Math.cos(50*Math.PI/180));near(r.metrics.q_var,1200*Math.sin(50*Math.PI/180));
  near(r.metrics.corrected_pf,.95);near(r.metrics.capacitance_uf,122.62828753516744);
  const samples=r.plots[1].curves[0].values.slice(0,-1);near(samples.reduce((s,x)=>s+x,0)/samples.length,r.metrics.p_w);
  const leading=model.solve('single-phase',{delta_deg:-30});assert.ok(leading.metrics.q_var<0);assert.equal(leading.metrics.capacitor_var,0);
  const met=model.solve('single-phase',{delta_deg:5,target_pf:.95});assert.equal(met.metrics.capacitor_var,0);
  const zero=model.solve('single-phase',{current_rms:0});assert.equal(zero.metrics.pf,null);assert.equal(zero.metrics.corrected_pf,null);
});

test('three-phase branch KCL, Y/delta equivalence, sequence, and constant power',()=>{
  const y=model.solve('three-phase'),d=model.solve('three-phase',{connection:'delta'});
  near(y.metrics.p_w,5120);near(y.metrics.q_var,3840);near(d.metrics.line_current_a,3*y.metrics.line_current_a);
  near(d.metrics.p_w,3*y.metrics.p_w);near(y.phasors.Vab.angle_deg,30);
  const equivalent=model.solve('three-phase',{connection:'delta',resistance:60,reactance:45});near(equivalent.metrics.line_current_a,y.metrics.line_current_a);near(equivalent.metrics.p_w,y.metrics.p_w);
  const reverse=model.solve('three-phase',{sequence:'acb'});near(reverse.phasors.Vab.angle_deg,-30);near(reverse.metrics.p_w,y.metrics.p_w);
  for(const r of [y,d,equivalent,reverse]){near(r.metrics.neutral_current_a,0);near(r.checks.instantaneous_power_ripple,0,1e-8);near(r.checks.real_power_balance,0);}
});

test('transformer winding versus bank ratios and independent OC/SC recovery',()=>{
  for(const h of ['wye','delta'])for(const l of ['wye','delta']){
    const r=model.solve('transformers',{h_connection:h,l_connection:l}),factor=(h==='wye'?Math.sqrt(3):1)/(l==='wye'?Math.sqrt(3):1);
    near(r.metrics.line_ratio,10*factor);near(r.checks.ideal_bank_power,0);near(r.checks.ampere_turn_ratio,0);
  }
  const r=model.solve('transformers');near(r.metrics.rc_lv_ohm,480);near(r.metrics.xm_lv_ohm,240/Math.sqrt(4-.25));
  const z=Math.hypot(r.metrics.req_hv_ohm,r.metrics.xeq_hv_ohm);near(z,120/4.1667);
  near(4.1667**2*r.metrics.req_hv_ohm,180);near(240**2/r.metrics.rc_lv_ohm,120);near(r.metrics.rc_hv_ohm,48000);
  assert.throws(()=>model.solve('transformers',{oc_w:500}));assert.throws(()=>model.solve('transformers',{sc_w:1000}));
  assert.equal(model.solve('transformers',{loading:0,core_kw:0}).metrics.efficiency_percent,0);
});

test('coherent single/three-phase bases, referral, base changes, and physical recovery',()=>{
  const a=model.solve('per-unit'),b=model.solve('per-unit',{s_base_mva:50}),c=model.solve('per-unit',{v_base_h_kv:276});
  near(a.metrics.z_base_l_ohm,1.9044);near(b.metrics.z_pu_re,a.metrics.z_pu_re/2);near(c.metrics.z_pu_im,a.metrics.z_pu_im/4);
  const single=model.solve('per-unit',{system:'single-phase'});near(single.metrics.i_base_l_a,Math.sqrt(3)*a.metrics.i_base_l_a);
  for(const r of [a,b,c,single]){near(r.metrics.recovered_z_re_ohm,1);near(r.metrics.recovered_z_im_ohm,4);Object.values(r.checks).forEach(v=>near(v,0));}
  near(a.metrics.physical_s_mva,b.metrics.physical_s_mva);near(a.metrics.physical_s_mva,c.metrics.physical_s_mva);
});

test('published L16 practice keeps its references and first-exam scope',()=>{
  const r=model.solve('exam-review');near(r.metrics.p_w,2160*Math.sqrt(3)/2);near(r.metrics.q_var,-1080);
  near(r.metrics.delta_line_a,20.8*Math.sqrt(3));near(r.phasors.Vab.angle_deg,0);near(r.phasors.Ia.angle_deg,-66.86989764584402);
  near(r.metrics.z_pu_re,.02);near(r.metrics.z_pu_im,3.4369/75);near(r.metrics.ib_h_a,20);near(r.metrics.ib_l_a,200);
  near(r.metrics.required_capacity_mw,184);near(r.metrics.crossover_hours,3000);near(r.metrics.gt_cost,245000);
  const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../_data/ece685_stage_one.json')));
  assert.equal(config.modules.length,13);assert.deepEqual(config.modules[8].sources,['L16','L16b']);assert.deepEqual(config.modules[4].extension,['L17','L18']);
  for(const m of config.modules){const baseline=model.solve(m.id);for(const a of m.practice)assert.ok(Number.isFinite(baseline.metrics[a.key]));assert.equal(m.quiz.choices.length,3);}
});

test('invalid input and incompatible type choices are rejected',()=>{
  for(const [id,p] of [['overview',{transmission_kv:0}],['generation',{hours:9000}],['generation',{wind_credit:2}],['single-phase',{target_pf:1.1}],['three-phase',{resistance:0,reactance:0}],['three-phase',{connection:'bad'}],['transformers',{turns_ratio:0}],['per-unit',{system:'bad'}],['exam-review',{s_base_kva:0}]])assert.throws(()=>model.solve(id,p));
  for(const id of Object.keys(model.defaults)){const number=Object.keys(model.defaults[id]).find(k=>typeof model.defaults[id][k]==='number');for(const value of [NaN,Infinity,'10',true])assert.throws(()=>model.solve(id,{[number]:value}));}
});

test('L17 reproduces the source example and fixed-dot delta joining displacements',()=>{
  const r=model.solve('transformer-banks');near(r.metrics.l_line_kv,138/(Math.sqrt(3)*10));
  near(r.metrics.l_line_a,60000/(Math.sqrt(3)*r.metrics.l_line_kv));near(r.metrics.phase_mva,20);
  const cases=[['wye','wye','abc','abc',0],['wye','delta','abc','abc',-30],['wye','delta','abc','acb',30],
    ['delta','wye','abc','abc',30],['delta','wye','acb','abc',-30],
    ['delta','delta','abc','abc',0],['delta','delta','acb','acb',0],
    ['delta','delta','abc','acb',60],['delta','delta','acb','abc',-60]];
  for(const [h_connection,l_connection,h_delta_order,l_delta_order,angle] of cases){
    const b=model.solve('transformer-banks',{h_connection,l_connection,h_delta_order,l_delta_order});
    near(b.metrics.delta_lh_deg,angle);near(b.phasors.Vab_L.angle_deg,angle);
    Object.values(b.checks).forEach(x=>near(x,0));
    near(b.metrics.line_ratio,10*(h_connection==='wye'?Math.sqrt(3):1)/(l_connection==='wye'?Math.sqrt(3):1));
  }
  assert.throws(()=>model.solve('transformer-banks',{h_delta_order:'invalid'}));
});

test('L18 preserves ohms across bases and conserves complex power with directional taps',()=>{
  const r=model.solve('transformer-network');near(r.metrics.winding_ratio,10/Math.sqrt(3));
  near(r.metrics.z_pu_re,.01);near(r.metrics.z_pu_im,.15);near(r.metrics.z_h_re_ohm,1.9044);
  near(r.metrics.z_h_im_ohm,28.566);near(r.metrics.z_l_delta_re_ohm,.057132);
  near(r.metrics.l_line_kv,13.8);near(r.metrics.l_angle_deg,-30);
  const tap=model.solve('transformer-network',{tap:1.05});near(tap.metrics.l_line_kv,13.8/1.05);near(tap.metrics.l_angle_deg,-30);
  const a=model.solve('transformer-network',{tap:1.05,loading:1}),b=model.solve('transformer-network',{tap:1.05,loading:1,s_base_mva:50});
  for(const m of ['z_h_re_ohm','z_h_im_ohm','z_l_delta_re_ohm','l_line_kv','h_line_a','l_line_a','series_loss_mw'])near(a.metrics[m],b.metrics[m]);
  for(const x of [a,b,tap])Object.values(x.checks).forEach(v=>near(v,0));
  near(a.metrics.series_loss_mw,.006*60);assert.ok(a.metrics.l_line_kv<tap.metrics.l_line_kv);
  near(a.phasors.IL_pu.angle_deg,a.phasors.IH_pu.angle_deg-30);
  assert.throws(()=>model.solve('transformer-network',{tap:0}));
});

test('standard-library Python matches every module, its plots, and boundary cases',()=>{
  const cases=Object.keys(model.defaults).map(module=>({module}));
  cases.push({module:'overview',shunt_mvar:80,transmission_kv:69},{module:'generation',cc_fixed:1,cc_variable:100},{module:'generation',gt_variable:26.05},
    {module:'single-phase',delta_deg:-50},{module:'single-phase',current_rms:0},{module:'three-phase',connection:'delta',sequence:'acb'},
    {module:'transformers',h_connection:'delta',l_connection:'wye'},{module:'transformers',loading:0,core_kw:0},
    {module:'per-unit',system:'single-phase',s_base_mva:50},{module:'exam-review',focus:'planning'},{module:'exam-review',focus:'three-phase'},{module:'transformer-banks',l_delta_order:'acb'},{module:'transformer-network',tap:1.05,loading:1});
  const program=`import sys, json, importlib.util
sys.dont_write_bytecode = True
s=importlib.util.spec_from_file_location('models',sys.argv[1])
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
print(json.dumps([m.solve(c) for c in json.load(sys.stdin)],allow_nan=False))
`;
  const py=spawnSync(process.env.PYTHON||'python3',['-c',program,path.resolve(__dirname,'../assets/code/ece685_stage_one.py')],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:6*1024*1024});
  assert.equal(py.status,0,py.stderr);const results=JSON.parse(py.stdout);
  function compare(a,b){if(typeof a==='number')near(a,b,Math.max(1e-8,Math.abs(a)*1e-11));else if(a===null||typeof a==='string'||typeof a==='boolean')assert.equal(a,b);else if(Array.isArray(a)){assert.equal(a.length,b.length);a.forEach((v,i)=>compare(v,b[i]));}else{assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());Object.keys(a).forEach(k=>compare(a[k],b[k]));}}
  cases.forEach((c,i)=>{const {module,...p}=c;compare(model.solve(module,p),results[i]);});
});
