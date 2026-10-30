'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const model=require('../assets/js/ece685-stage-model.js'),diagrams=require('../assets/js/ece685-stage-diagrams.js');
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const solve=p=>model.solve('power-flow-ybus',p);
const checks=r=>Object.values(r.checks).forEach(v=>near(v,0));

test('L33 source example reproduces the complete matrix, currents and powers',()=>{
 const r=solve(),Y=r.network.ybus;
 const expected=[[[6.015727,-19.576234],[-4.587156,15.290520],[-1.428571,4.285714]],
 [[-4.587156,15.290520],[6.809378,-21.957187],[-2.222222,6.666667]],
 [[-1.428571,4.285714],[-2.222222,6.666667],[3.650794,-10.952381]]];
 Y.forEach((row,i)=>row.forEach((z,k)=>{near(z.re,expected[i][k][0],.51e-6);near(z.im,expected[i][k][1],.51e-6);}));
 const currents=[[.234600,-.448668],[.086035,.216922],[-.320635,.231746]];
 const powers=[[.239292,.457641],[.086035,-.216922],[-.318857,-.220698]];
 for(let i=0;i<3;i++){near(r.network.currents[i].re,currents[i][0],.51e-6);near(r.network.currents[i].im,currents[i][1],.51e-6);near(r.network.powers[i].re,powers[i][0],.51e-6);near(r.network.powers[i].im,powers[i][1],.51e-6);}
 near(r.metrics.row_sum_max,0);near(r.metrics.symmetry_max,0);
 assert.ok(Math.abs(Y[0][1].im+Y[1][0].im)>1,'reciprocal complex matrix is not Hermitian');checks(r);
});

test('L32 load mismatch is distinct from physical KCL and source power accounting',()=>{
 const r=model.solve('power-flow-balance');
 near(r.metrics.mismatch_p_pu,-.581142857142857);near(r.metrics.mismatch_q_pu,-.0793015873015873);
 near(r.metrics.real_loss_mw,.6469783020241744);checks(r);
 const changed=model.solve('power-flow-balance',{load_p_mw:100,load_q_mvar:40});
 assert.deepEqual(changed.network,r.network);near(changed.metrics.mismatch_p_pu,r.metrics.mismatch_p_pu-.1);
 near(changed.metrics.mismatch_q_pu,r.metrics.mismatch_q_pu-.1);
 const b=r.network.branches[0];near(b.i_from.re,-b.i_to.re);near(b.i_from.im,-b.i_to.im);
 near(b.s_from.re+b.s_to.re,b.series_loss.re);
 assert.notEqual(b.s_from.re,-b.s_to.re,'received and sent powers differ by losses');
});

test('line charging and independent bus shunt are counted once and only on diagonals',()=>{
 const a=solve(),b=solve({charging23_pu:.04,shunt3_pu:.12});
 for(let i=0;i<3;i++)for(let k=0;k<3;k++){
  near(b.network.ybus[i][k].re,a.network.ybus[i][k].re);
  near(b.network.ybus[i][k].im-a.network.ybus[i][k].im,i!==k?0:i===1?.02:i===2?.14:0);
 }
 near(b.metrics.q3_pu-a.metrics.q3_pu,-.14*(.98**2+.02**2));
 near(b.metrics.p3_pu,a.metrics.p3_pu);near(b.metrics.symmetry_max,0);assert.ok(b.metrics.row_sum_max>.13);
 const branch=b.network.branches.find(v=>v.from===2&&v.to===3);
 assert.ok(Math.hypot(branch.i_from.re+branch.i_to.re,branch.i_from.im+branch.i_to.im)>.03);
 checks(b);checks(solve({shunt3_pu:-.15}));
});

test('real tap reproduces the revised example while preserving unrelated contributions',()=>{
 const r=solve({tap12:1.05,charging23_pu:.04,shunt3_pu:.12}),a=solve();
 for(const [key,value] of Object.entries({y11_re:5.589257109571657,y11_im:-18.15466655571505,y12_re:-4.36871996505024,y12_im:14.562399883500802,y22_im:-21.93718654434251,y33_im:-10.812380952380953}))near(r.metrics[key],value);
 for(const key of ['y13_re','y13_im','y23_re','y23_im','y22_re','y33_re'])near(r.metrics[key],a.metrics[key]);
 near(r.metrics.symmetry_max,0);assert.ok(r.metrics.row_sum_max>0);checks(r);
});

test('complex tap uses opposite conjugates and physical port equations conserve power',()=>{
 const r=solve({tap12:1.05,shift12_deg:17,charging23_pu:.04,shunt3_pu:.12}),a=solve();
 const theta=17*Math.PI/180,y={re:-a.metrics.y12_re,im:-a.metrics.y12_im};
 near(r.metrics.y12_re,(-y.re*Math.cos(theta)+y.im*Math.sin(theta))/1.05);
 near(r.metrics.y12_im,(-y.re*Math.sin(theta)-y.im*Math.cos(theta))/1.05);
 near(r.metrics.y21_re,(-y.re*Math.cos(theta)-y.im*Math.sin(theta))/1.05);
 near(r.metrics.y21_im,(y.re*Math.sin(theta)-y.im*Math.cos(theta))/1.05);
 assert.ok(r.metrics.symmetry_max>1);checks(r);
 const b=r.network.branches[0];near(b.s_from.re+b.s_to.re,b.series_loss.re);near(b.s_from.im+b.s_to.im,b.series_loss.im);
});

test('opening a line removes its four series terms and both charging ends',()=>{
 const off=solve({branch23:0,charging23_pu:.04,shunt3_pu:.12}),noCharge=solve({branch23:0,shunt3_pu:.12});
 assert.deepEqual(off.network,noCharge.network);near(off.metrics.y23_re,0);near(off.metrics.y23_im,0);
 assert.equal(off.network.branches.length,2);assert.equal(off.network.ybus.length,3);checks(off);
});

test('common angle rotation leaves all powers and mismatches invariant',()=>{
 const p={tap12:1.075,shift12_deg:-12,charging23_pu:.06,shunt3_pu:-.08};
 const a=solve(p),b=solve({...p,angle_ref_deg:137});
 for(const key of ['p1_pu','q1_pu','p2_pu','q2_pu','p3_pu','q3_pu','real_loss_mw','mismatch_p_pu','mismatch_q_pu'])near(a.metrics[key],b.metrics[key]);
 checks(a);checks(b);
});

test('all public controls, boundary scans and Python network outputs agree',()=>{
 const modules=JSON.parse(fs.readFileSync(path.join(__dirname,'../_data/ece685_stage_one.json'))).modules.filter(m=>m.id.startsWith('power-flow-'));
 const cases=[];
 for(const m of modules){
  cases.push({module:m.id});
  for(const c of m.controls){
   for(const v of c.type==='select'?c.options.map(o=>Number(o.value)):[c.min,c.max]){
    const p={[c.key]:v},r=model.solve(m.id,p);checks(r);cases.push({module:m.id,...p});
    r.plots.forEach(plot=>plot.curves.forEach(curve=>assert.ok(curve.values.every(Number.isFinite))));
   }
  }
 }
 cases.push({module:'power-flow-ybus',tap12:.8,shift12_deg:30,charging23_pu:.5,shunt3_pu:-.5,v3_re:.5,v3_im:-.5});
 const py=spawnSync('python3',['-c',`import json,sys,importlib.util\ns=importlib.util.spec_from_file_location('m','assets/code/ece685_stage_one.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps([m.solve(c) for c in json.load(sys.stdin)]))`],{cwd:path.join(__dirname,'..'),input:JSON.stringify(cases),encoding:'utf8',maxBuffer:20*1024*1024});
 assert.equal(py.status,0,py.stderr);const results=JSON.parse(py.stdout);
 function compare(a,b,where=''){
  if(typeof a==='number'){if(where.endsWith('.angle_deg'))near(model.wrap(a-b),0,1e-8);else near(a,b,1e-8);return;}
  if(a===null||typeof a!=='object'){assert.equal(a,b,where);return;}
  assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),where);
  Object.keys(a).forEach(k=>compare(a[k],b[k],where+'.'+k));
 }
 cases.forEach((c,i)=>{const {module,...parameters}=c;compare(model.solve(module,parameters),results[i]);});
});

test('rendered diagrams preserve bus connections, complete matrix and conditional equipment',()=>{
 for(const lang of ['en','zh'])for(const kind of ['power-flow-balance','power-flow-ybus']){
  const base=diagrams.render(kind,model.solve(kind),lang);assert.ok(!/NaN|undefined/.test(base.markup));
  assert.match(base.markup,/data-network-branch="1-3"/);assert.match(base.markup,/data-network-branch="2-3"/);
  if(kind==='power-flow-ybus')assert.equal((base.markup.match(/data-ybus-entry=/g)||[]).length,9);
  const off=diagrams.render(kind,model.solve(kind,{branch23:0}),lang);assert.match(off.markup,/data-network-open="2-3"/);
  const updated=diagrams.render(kind,model.solve(kind,{tap12:1.05,charging23_pu:.04,shunt3_pu:-.12}),lang);
  assert.match(updated.markup,/t12/);assert.match(updated.markup,/jbc\/2/);assert.match(updated.markup,/y3,sh/);
 }
 for(const p of [{tap12:0},{impedance_scale:0},{charging23_pu:-.1},{branch23:2},{shift12_deg:31},{v3_re:0}])assert.throws(()=>solve(p));
});

test('L34 reproduces the source solved slack/PV/PQ operating point',()=>{
 const r=model.solve('power-flow-operating'),m=r.metrics;
 near(m.v3_mag,.96441,.0000051);near(m.theta2_deg,.3108,.000051);near(m.theta3_deg,-3.6523,.000051);
 near(m.pg1_mw,37.8855,.000051);near(m.qg1_mvar,54.8871,.000051);near(m.qg2_mvar,-16.1649,.000051);
 near(m.real_loss_mw,2.8855,.000051);assert.ok(m.max_mismatch_pu<1e-10);checks(r);
 assert.deepEqual(r.operating.voltage_unknowns,['theta2','theta3','|V3|']);
 assert.deepEqual(r.operating.dependent_quantities,['P1','Q1','Q2']);
 near(r.network.voltages[0].rms,1.03);near(r.network.voltages[0].angle_deg,0);near(r.network.voltages[1].rms,1.01);
 near(m.p2_pu,.55);near(m.p3_pu,-.9);near(m.q3_pu,-.3);
 assert.ok(m.qg2_mvar<0,'regulated generator can absorb Q');
});

test('L34 physical port currents independently reconcile all selected power equations',()=>{
 const cases=[{}, {load_p_mw:0,load_q_mvar:0,pg2_mw:0,v1_mag:1,v2_mag:1},
 {load_p_mw:140,load_q_mvar:55,pg2_mw:90}, {v1_mag:1.07,v2_mag:.98}, {v1_mag:.98,v2_mag:1.07},
 {impedance_scale:1.3,load_p_mw:140,load_q_mvar:55,v1_mag:.97,v2_mag:.97}];
 for(const p of cases){
  const r=model.solve('power-flow-operating',p),v=r.network.voltages;
  const supplied=[{re:0,im:0},{re:0,im:0},{re:0,im:0}];let loss=0;
  for(const b of r.network.branches){
   const i=b.from-1,k=b.to-1,z=b.z,d={re:v[i].re-v[k].re,im:v[i].im-v[k].im};
   const den=z.re*z.re+z.im*z.im,I={re:(d.re*z.re+d.im*z.im)/den,im:(d.im*z.re-d.re*z.im)/den};
   supplied[i].re+=I.re;supplied[i].im+=I.im;supplied[k].re-=I.re;supplied[k].im-=I.im;
   loss+=z.re*(I.re**2+I.im**2)*100;
  }
  supplied.forEach((I,i)=>{near(v[i].re*I.re+v[i].im*I.im,r.network.powers[i].re);near(v[i].im*I.re-v[i].re*I.im,r.network.powers[i].im);});
  near(loss,r.metrics.real_loss_mw);near(r.metrics.pg1_mw+r.parameters.pg2_mw-r.parameters.load_p_mw,loss);
  near(r.metrics.qg1_mvar+r.metrics.qg2_mvar-r.parameters.load_q_mvar,r.metrics.reactive_absorption_mvar);checks(r);
 }
 const idle=model.solve('power-flow-operating',cases[1]);near(idle.metrics.real_loss_mw,0);near(idle.metrics.pg1_mw,0);near(idle.metrics.v3_mag,1);
});

test('lossless line is independent from the solved three-bus case and obeys terminal identities',()=>{
 const baseline=model.solve('power-flow-operating');
 for(const delta of [-120,-20,0,20,90,120]){
  const r=model.solve('power-flow-operating',{line_angle_deg:delta}),m=r.metrics;
  assert.deepEqual(r.network,baseline.network);near(m.line_pi_mw,515*Math.sin(delta*Math.PI/180));
  near(m.line_qi_mvar+m.line_qk_mvar,100*(1.03**2+1-2*1.03*Math.cos(delta*Math.PI/180))/.2);
  assert.equal(r.plots[0].markers[0].x,delta);near(r.plots[0].markers[0].y,m.line_pi_mw);
  checks(r);
 }
 const zero=model.solve('power-flow-operating',{line_angle_deg:0});near(zero.metrics.line_pi_mw,0);near(zero.metrics.line_qi_mvar,15.45);near(zero.metrics.line_qk_mvar,-15);
 const peak=model.solve('power-flow-operating',{line_angle_deg:90});near(peak.metrics.line_pi_mw,peak.metrics.line_pmax_mw);
 const reverse=model.solve('power-flow-operating',{line_angle_deg:0,line_vi:1,line_vk:1.03});assert.ok(reverse.metrics.line_qi_mvar<0);assert.ok(reverse.metrics.line_qk_mvar>0);
 const twice=model.solve('power-flow-operating',{line_x_pu:.4});near(twice.metrics.line_pi_mw,baseline.metrics.line_pi_mw/2);assert.deepEqual(twice.network,baseline.network);
});

test('L34 refuses unsupported or nonconverged inputs instead of fabricating a solved state',()=>{
 for(const p of [{line_x_pu:0},{v1_mag:0},{impedance_scale:0},{load_p_mw:-1},{load_p_mw:1e7},{v2_mag:NaN}])assert.throws(()=>model.solve('power-flow-operating',p));
 for(const lang of ['en','zh']){
  const d=diagrams.render('power-flow-operating',model.solve('power-flow-operating'),lang).markup;
  assert.ok(!d.includes('Trial-voltage'));assert.match(d,/Slack 1 \/ PV 2 \/ PQ 3/);
  assert.match(d,/Q2 = -16\.1649/);assert.ok(d.includes(lang==='zh'?'独立的两端无损线路':'Separate two-terminal lossless line'));
 }
});
