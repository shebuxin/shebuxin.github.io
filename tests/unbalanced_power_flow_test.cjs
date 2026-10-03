const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const model=require('../assets/js/unbalanced-power-flow-model.js');
const balanced=require('../assets/js/balanced-power-flow-model.js');
function close(actual,expected,tolerance=1e-7){assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected} by more than ${tolerance}`);}
const C=model.complex;
const cases=[{}, {p3_a_kw:60,p3_b_kw:60,p3_c_kw:60}, {neutral_mode:'ideal'},
  {load_scale:2}, {power_factor:.8}, {mutual_ratio:0}, {mutual_ratio:.6},
  {dg_phase:'a',dg_kw:160}, {dg_phase:'b',dg_kw:100}, {dg_phase:'c',dg_kw:100},
  {p3_a_kw:140,p3_b_kw:20,p3_c_kw:20,dg_kw:0,neutral_scale:2},
  {load_scale:0,dg_kw:0}, {open12:true}, {open23:true}, {load_scale:20}];

// A separate rectangular-voltage Newton solution of the 12 real load-terminal
// equations. It eliminates the shared neutral analytically instead of solving
// four conductor voltages by the production fixed-point sweep.
function linear(matrix,rhs){
  const a=matrix.map((row,i)=>[...row,rhs[i]]),n=rhs.length;
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
    assert.ok(Math.abs(a[pivot][k])>1e-12);[a[k],a[pivot]]=[a[pivot],a[k]];
    for(let i=k+1;i<n;i++){const factor=a[i][k]/a[k][k];for(let j=k;j<=n;j++)a[i][j]-=factor*a[k][j];}
  }
  const x=Array(n).fill(0);for(let i=n-1;i>=0;i--){let v=a[i][n];for(let j=i+1;j<n;j++)v-=a[i][j]*x[j];x[i]=v/a[i][i];}return x;
}
function referenceNewton(options){
  const net=model.network(options),effective=net.edges.map(edge=>edge.z.slice(0,3).map(row=>row.slice(0,3).map(z=>C.add(z,edge.z[3][3]))));
  const unpack=x=>[0,1].map(bus=>[0,1,2].map(phase=>[x[bus*6+phase*2],x[bus*6+phase*2+1]]));
  const residual=x=>{
    const u=unpack(x),i=u.map((row,bus)=>row.map((v,p)=>C.conj(C.div(net.demand[bus+1][p],v))));
    const i12=i[0].map((current,p)=>C.add(current,i[1][p]));
    const d12=C.matvec(effective[0],i12),d23=C.matvec(effective[1],i[1]);
    return u.flatMap((row,bus)=>row.flatMap((v,p)=>C.add(C.sub(v,bus===0?net.source[p]:u[0][p]),bus===0?d12[p]:d23[p])));
  };
  const norm=x=>Math.max(...x.map(Math.abs));
  let x=[...net.source.slice(0,3).flat(),...net.source.slice(0,3).flat()];
  for(let iteration=0;iteration<30;iteration++){
    const f=residual(x),error=norm(f);if(error<1e-12)return unpack(x);
    const n=x.length,jac=Array.from({length:n},()=>Array(n));
    for(let column=0;column<n;column++){
      const a=[...x],b=[...x],h=1e-6;a[column]+=h;b[column]-=h;
      const fa=residual(a),fb=residual(b);for(let row=0;row<n;row++)jac[row][column]=(fa[row]-fb[row])/(2*h);
    }
    const step=linear(jac,f.map(v=>-v));let accepted=false;
    for(let alpha=1;alpha>=1/128;alpha/=2){const trial=x.map((v,i)=>v+alpha*step[i]);if(norm(residual(trial))<error){x=trial;accepted=true;break;}}
    assert.ok(accepted,'Reference Newton step stalled');
  }
  throw new Error('Reference Newton did not converge');
}

test('four-conductor sweep agrees with independent rectangular Newton and neutral elimination',()=>{
  for(const options of cases.slice(0,11)){
    const reference=referenceNewton(options),r=model.solve(options);assert.equal(r.ok,true);
    for(let bus=0;bus<2;bus++)for(let phase=0;phase<3;phase++)for(let c=0;c<2;c++)close(r.buses[bus+1].phases[phase].u_pu[c],reference[bus][phase][c],2e-9);
  }
});

test('balanced limit reproduces the prior AC lesson, with zero neutral current and sequence unbalance',()=>{
  for(const options of [{},{load_scale:1.5,power_factor:.85},{slack_pu:1.02,r_scale:1.4,x_scale:.7}]){
    const r=model.solve({...options,p3_a_kw:60,p3_b_kw:60,p3_c_kw:60,mutual_ratio:0});
    const expected=balanced.solve(options);assert.equal(r.ok,true);
    r.buses.forEach((bus,i)=>{
      bus.phases.forEach(p=>close(p.vm_pu,expected.buses[i].vm_pu,2e-9));
      close(bus.neutral_v,0);close(bus.components.vuf_pct,0);close(bus.components.zero_pct,0);
    });
    r.branches.forEach(e=>close(e.current_a[3],0));close(r.loss_kw,expected.loss_kw,1e-6);
  }
});

test('KCL, four-wire KVL, constant PQ, phase and neutral I²R, and total power balance hold',()=>{
  const checks=[...cases.slice(0,12)];
  for(let k=0;k<30;k++)checks.push({load_scale:.5+(k%5)*.2,p3_a_kw:50+(k%4)*15,p3_b_kw:40+(k%3)*15,p3_c_kw:30+(k%6)*10,
    dg_kw:(k%7)*20,dg_phase:['balanced','a','b','c'][k%4],neutral_scale:.5+(k%3)*.3,mutual_ratio:(k%4)*.15,r_scale:.7+(k%3)*.2});
  for(const options of checks){
    const net=model.network(options),r=model.solve(options);assert.equal(r.ok,true,JSON.stringify(options));
    assert.ok(r.residual_pu<1e-10);
    r.branches.forEach((line,k)=>{
      const currents=line.currents_pu,total=C.sum(currents);close(C.abs(total),0);
      const drop=C.matvec(net.edges[k].z,currents);
      for(let c=0;c<4;c++)close(C.abs(C.sub(C.sub(r.buses[k].conductors_pu[c],r.buses[k+1].conductors_pu[c]),drop[c])),0,2e-10);
      const physicalLoss=line.current_a.slice(0,3).reduce((sum,i)=>sum+i*i*net.edges[k].r*net.s.r_scale,0)/1000
        +line.current_a[3]**2*net.edges[k].rn*net.s.r_scale*(net.s.neutral_mode==='ideal'?0:net.s.neutral_scale)/1000;
      close(line.loss_kw,physicalLoss,3e-7);
      close(line.loss_kw,line.p_from_kw+line.p_to_kw);
      assert.ok(line.loss_kw>=-1e-9);
    });
    for(let bus=1;bus<3;bus++)for(let phase=0;phase<3;phase++){
      const outgoing=bus===1?r.branches[1].currents_pu[phase]:[0,0];
      const i=C.sub(r.branches[bus-1].currents_pu[phase],outgoing);
      const p=C.scale(C.mul(r.buses[bus].phases[phase].u_pu,C.conj(i)),model.base.phase_kw);
      close(p[0],net.demand[bus][phase][0]*model.base.phase_kw,1e-7);
      close(p[1],net.demand[bus][phase][1]*model.base.phase_kw,1e-7);
    }
    close(r.slack_p_kw+net.s.dg_kw-r.total_load_kw,r.loss_kw,5e-7);
    close(r.slack_q_kvar-net.q_load_kvar.flat().reduce((a,b)=>a+b,0),r.branches.reduce((a,e)=>a+e.q_from_kvar+e.q_to_kvar,0),5e-7);
  }
});

test('sequence components use complex phase angles, with the ABC sign convention',()=>{
  const a=[-.5,Math.sqrt(3)/2],a2=C.mul(a,a),zero=[.03,-.01],positive=[1,0],negative=[0,.02];
  const phases=[C.sum([zero,positive,negative]),C.sum([zero,C.mul(a2,positive),C.mul(a,negative)]),C.sum([zero,C.mul(a,positive),C.mul(a2,negative)])];
  const r=model.sequence(phases);
  [zero,positive,negative].forEach((v,i)=>{const actual=[r.zero_pu,r.positive_pu,r.negative_pu][i];close(actual[0],v[0]);close(actual[1],v[1]);});
  close(r.vuf_pct,2);
  const angleOnly=model.sequence([[Math.cos(.1),Math.sin(.1)],a2,a]);
  assert.ok(angleOnly.vuf_pct>3); // all magnitudes remain 1 pu
});

test('all three pure sequence modes are classified correctly and invert arbitrary complex phasors',()=>{
  const a=[-.5,Math.sqrt(3)/2],a2=C.mul(a,a),coefficient=[.7,-.2];
  const bases=[[[1,0],[1,0],[1,0]],[[1,0],a2,a],[[1,0],a,a2]];
  bases.forEach((basis,index)=>{
    const phases=basis.map(z=>C.mul(z,coefficient)),seq=model.sequence(phases);
    if(index!==1){assert.equal(seq.vuf_pct,null);assert.equal(seq.zero_pct,null);}
    [seq.zero_pu,seq.positive_pu,seq.negative_pu].forEach((z,i)=>close(C.abs(C.sub(z,i===index?coefficient:[0,0])),0,5e-16));
    model.reconstruct(seq).forEach((z,i)=>close(C.abs(C.sub(z,phases[i])),0,5e-16));
  });
  const zeroInput=model.sequence([[0,0],[0,0],[0,0]]);
  assert.equal(zeroInput.vuf_pct,null);assert.deepEqual(model.reconstruct(zeroInput),[[0,0],[0,0],[0,0]]);
  // Unequal magnitudes AND angles, including a missing phase and arbitrary reference.
  const inputs=[[[0,0],[.3,-.4],[-.2,.7]],...Array.from({length:40},(_,i)=>[0,1,2].map(p=>[Math.sin(i+p*.8),Math.cos(i*.3-p*.9)]))];
  for(const phases of inputs){
    const seq=model.sequence(phases),rebuilt=model.reconstruct(seq);
    rebuilt.forEach((z,p)=>close(C.abs(C.sub(z,phases[p])),0,1e-15));
    const swapped=model.sequence([phases[0],phases[2],phases[1]]);
    close(C.abs(C.sub(swapped.positive_pu,seq.negative_pu)),0,1e-15);
    close(C.abs(C.sub(swapped.negative_pu,seq.positive_pu)),0,1e-15);
    close(C.abs(C.sub(swapped.zero_pu,seq.zero_pu)),0,1e-15);
  }
});

test('solved voltages reconstruct on either reference; neutral subtraction changes only zero sequence',()=>{
  for(const options of cases.slice(0,12))for(const bus of model.solve(options).buses){
    const conductor=bus.conductors_pu.slice(0,3),local=bus.phases.map(p=>p.u_pu),vn=bus.conductors_pu[3];
    const v=model.sequence(conductor),u=model.sequence(local);
    close(C.abs(C.sub(u.zero_pu,C.sub(v.zero_pu,vn))),0,1e-15);
    close(C.abs(C.sub(u.positive_pu,v.positive_pu)),0,1e-15);
    close(C.abs(C.sub(u.negative_pu,v.negative_pu)),0,1e-15);
    close(u.vuf_pct,v.vuf_pct,1e-12);
    [conductor,local].forEach(phases=>model.reconstruct(model.sequence(phases)).forEach((z,p)=>close(C.abs(C.sub(z,phases[p])),0,1e-15)));
  }
  const bus=model.solve().buses[2];
  assert.ok(Math.abs(C.abs(bus.components.zero_pu)*model.base.phase_v-bus.neutral_v)>2,'Zero voltage is not neutral displacement');
});

test('neutral current persists with ideal neutral; coupling disappears only when both mutual and neutral impedance are zero',()=>{
  const ideal=model.solve({neutral_mode:'ideal'});close(ideal.buses[2].neutral_v,0);assert.ok(ideal.branches[0].current_a[3]>200);
  const baseCase={neutral_mode:'ideal',mutual_ratio:0},r1=model.solve(baseCase),r2=model.solve({...baseCase,p3_a_kw:100});
  for(const p of [1,2])close(r1.buses[2].phases[p].vm_pu,r2.buses[2].phases[p].vm_pu,2e-9);
  const finite1=model.solve({mutual_ratio:0}),finite2=model.solve({mutual_ratio:0,p3_a_kw:100});
  assert.ok(Math.abs(finite1.buses[2].phases[1].vm_pu-finite2.buses[2].phases[1].vm_pu)>.001);
  const noLoad=model.solve({load_scale:0,dg_kw:0,slack_pu:1.02});close(noLoad.loss_kw,0);noLoad.buses.forEach(bus=>bus.phases.forEach(p=>close(p.vm_pu,1.02)));
  const baseline=model.solve();assert.ok(baseline.buses[2].components.vuf_pct<2&&baseline.buses[2].phases[0].vm_pu<.95);
  const tighter=model.solve({current_limit_a:250,neutral_limit_a:100});close(tighter.loss_kw,baseline.loss_kw);assert.ok(tighter.violations.some(v=>v.kind==='current'&&v.phase==='n'));
});

test('islands, nonconvergence and invalid parameters are reported explicitly',()=>{
  assert.deepEqual(model.solve({open12:true}).islands,[2,3]);assert.deepEqual(model.solve({open23:true}).islands,[3]);
  assert.equal(model.solve({load_scale:20}).reason,'nonconvergence');
  for(const options of [{power_factor:0},{p3_a_kw:-5},{mutual_ratio:1},{neutral_scale:-1},{dg_kw:NaN},{neutral_mode:'open'},{dg_phase:'d'}])assert.throws(()=>model.solve(options),RangeError);
});

test('downloadable Python and JavaScript agree on phases, neutral, sequences, currents and failures',()=>{
  const py=spawnSync(process.env.PYTHON||'python3',['-c',
    'import importlib.util,json,sys\ns=importlib.util.spec_from_file_location("lesson",sys.argv[1])\nm=importlib.util.module_from_spec(s)\ns.loader.exec_module(m)\nassert m.sequence([0j,0j,0j])["vuf_pct"] is None\nresults=[m.solve(c) for c in json.load(sys.stdin)]\nfor r in results:\n if r["ok"]:\n  for bus in r["buses"]:\n   bus["rebuilt"]=[[z.real,z.imag] for z in m.reconstruct_sequence(bus["components"])]\nprint(json.dumps(results,allow_nan=False))',
    path.resolve(__dirname,'../assets/code/unbalanced_power_flow.py')],{input:JSON.stringify(cases),encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(py.status,0,py.stderr||String(py.error));
  JSON.parse(py.stdout).forEach((reference,i)=>{
    const r=model.solve(cases[i]);assert.equal(reference.ok,r.ok);
    if(!r.ok){assert.equal(reference.reason,r.reason);assert.deepEqual(reference.islands,r.islands);return;}
    for(const key of ['loss_kw','neutral_loss_kw','slack_p_kw','slack_q_kvar'])close(reference[key],r[key],1e-6);
    reference.buses.forEach((bus,b)=>{close(bus.neutral_v,r.buses[b].neutral_v,1e-7);close(bus.components.vuf_pct,r.buses[b].components.vuf_pct,1e-7);bus.phases.forEach((p,c)=>{for(const key of ['vm_pu','voltage_v','theta_deg'])close(p[key],r.buses[b].phases[c][key],1e-7);close(C.abs(C.sub(bus.rebuilt[c],r.buses[b].phases[c].u_pu)),0,1e-9);});});
    reference.branches.forEach((line,b)=>line.current_a.forEach((v,c)=>close(v,r.branches[b].current_a[c],1e-6)));
    assert.deepEqual(reference.violations,r.violations);
  });
});
