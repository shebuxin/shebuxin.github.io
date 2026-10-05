'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../assets/js/ece685-stage-model.js'),diagrams=require('../assets/js/ece685-stage-diagrams.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function vector(svg,name){
  const group=svg.match(new RegExp(`<g data-phasor="${name}">([\\s\\S]*?)</g>`));assert.ok(group,'Missing vector '+name);
  const points=group[1].match(/d="M([^ ]+) ([^L]+)L([^ ]+) ([^"]+)"/);assert.ok(points);
  return {dx:Number(points[3])-Number(points[1]),dy:Number(points[2])-Number(points[4])};
}
test('phase vectors preserve a common RMS scale across connections, sequence and references',()=>{
  for(const connection of ['wye','delta'])for(const sequence of ['abc','acb'])for(const phase_ref_deg of [-180,-90,0,90,180]){
    const r=model.solve('three-phase',{connection,sequence,phase_ref_deg}),svg=diagrams.render('three-phase',r).markup;
    const scales=[];
    for(const name of ['Va','Vb','Vc','Vab']){
      const v=vector(svg,name),z=r.phasors[name];
      near(v.dx/z.rms,z.re/z.rms*Math.hypot(v.dx,v.dy)/z.rms);
      near(v.dy/z.rms,z.im/z.rms*Math.hypot(v.dx,v.dy)/z.rms);
      scales.push(Math.hypot(v.dx,v.dy)/z.rms);
      assert.ok(Math.hypot(v.dx,v.dy)<=104.000001);
    }
    scales.forEach(s=>near(s,scales[0]));
  }
});
test('bank angle illustration respects every paired-dot joining convention',()=>{
  for(const h_connection of ['wye','delta'])for(const l_connection of ['wye','delta'])for(const h_delta_order of ['abc','acb'])for(const l_delta_order of ['abc','acb']){
    const r=model.solve('transformer-banks',{h_connection,l_connection,h_delta_order,l_delta_order}),svg=diagrams.render('transformer-banks',r).markup;
    const v=vector(svg,'L');near(Math.atan2(v.dy,v.dx)*180/Math.PI,r.metrics.delta_lh_deg);
    near(Math.hypot(v.dx,v.dy),55);
    assert.equal((svg.match(/r="3\.2"/g)||[]).length,6,'Three dotted winding pairs');
  }
});
test('signed power triangle preserves real/reactive directions, including reverse real power in review',()=>{
  for(const delta of [-170,-80,0,80,170]){
    const P=2160*Math.cos(delta*Math.PI/180),Q=2160*Math.sin(delta*Math.PI/180);
    const r={parameters:{focus:'single-phase',voltage_rms:180,current_rms:12,v_phase_deg:delta,i_phase_deg:0},metrics:{p_w:P,q_var:Q,pf:Math.abs(Math.cos(delta*Math.PI/180))}};
    const v=vector(diagrams.render('exam-review',r).markup,'S');
    near(v.dx/Math.hypot(v.dx,v.dy),P/2160);near(v.dy/Math.hypot(v.dx,v.dy),Q/2160);
    assert.ok(Math.abs(v.dx)<=175.000001&&Math.abs(v.dy)<=86.000001);
  }
});
test('all modules render finite, self-contained English and Chinese SVGs, including edge cases',()=>{
  const cases={'single-phase':[{current_rms:0},{delta_deg:-80},{delta_deg:80,target_pf:1}],overview:[{load_mvar:-40,shunt_mvar:80}],generation:[{demand_scale:1.5,wind_credit:1,solar_credit:1}],transformers:[{loading:0},{h_connection:'delta',l_connection:'wye'}],'per-unit':[{system:'single-phase',z_re_ohm:0,z_im_ohm:-5}],'transformer-network':[{tap:1.1,loading:1.2}]};
  for(const kind of Object.keys(model.defaults))for(const p of [{},...(cases[kind]||[])])for(const lang of ['en','zh']){
    const svg=diagrams.standalone(kind,model.solve(kind,p),lang);
    assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
    assert.match(svg,/<style>/);assert.match(svg,/<title>/);
    const ids=new Set([...svg.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
    for(const m of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.has(m[1]),'Unresolved arrow marker '+m[1]);
  }
});
