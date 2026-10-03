/* Three-bus, four-conductor radial AC power flow; constant-PQ wye loads. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.UnbalancedPowerFlow = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const defaults = Object.freeze({load_scale:1, p3_a_kw:90, p3_b_kw:55, p3_c_kw:35,
    power_factor:.95, dg_kw:50, dg_phase:"balanced", slack_pu:1, r_scale:1, x_scale:1,
    neutral_mode:"finite", neutral_scale:1, mutual_ratio:.2, current_limit_a:600,
    neutral_limit_a:250, open12:false, open23:false});
  const base = Object.freeze({mva:1, kv:.4, phase_kw:1000/3, phase_v:400/Math.sqrt(3),
    z_ohm:.16, current_a:1000/(Math.sqrt(3)*.4)});
  const add=(a,b)=>[a[0]+b[0],a[1]+b[1]], sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
  const mul=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];
  const scale=(a,k)=>[a[0]*k,a[1]*k], conj=a=>[a[0],-a[1]], abs=a=>Math.hypot(...a);
  const div=(a,b)=>scale(mul(a,conj(b)),1/(b[0]**2+b[1]**2));
  const sum=values=>values.reduce(add,[0,0]);
  const matvec=(matrix,vector)=>matrix.map(row=>sum(row.map((z,i)=>mul(z,vector[i]))));
  const local=v=>v.slice(0,3).map(phase=>sub(phase,v[3]));
  function sequence(phases) {
    const a=[-.5,Math.sqrt(3)/2], a2=mul(a,a);
    const zero=scale(sum(phases),1/3);
    const positive=scale(sum([phases[0],mul(a,phases[1]),mul(a2,phases[2])]),1/3);
    const negative=scale(sum([phases[0],mul(a2,phases[1]),mul(a,phases[2])]),1/3);
    return {zero_pu:zero,positive_pu:positive,negative_pu:negative,
      vuf_pct:100*abs(negative)/abs(positive),zero_pct:100*abs(zero)/abs(positive)};
  }
  function network(options={}) {
    const s={...defaults,...options};
    for(const key of ["load_scale","p3_a_kw","p3_b_kw","p3_c_kw","power_factor","dg_kw","slack_pu","r_scale","x_scale","neutral_scale","mutual_ratio","current_limit_a","neutral_limit_a"])
      if(!Number.isFinite(s[key]))throw new RangeError("Non-finite parameter: "+key);
    if([s.load_scale,s.p3_a_kw,s.p3_b_kw,s.p3_c_kw,s.dg_kw,s.neutral_scale].some(v=>v<0)
      ||s.power_factor<=0||s.power_factor>1||s.slack_pu<=0||s.r_scale<=0||s.x_scale<=0
      ||s.mutual_ratio<0||s.mutual_ratio>=1||s.current_limit_a<=0||s.neutral_limit_a<=0)
      throw new RangeError("Invalid operating parameters");
    if(!["finite","ideal"].includes(s.neutral_mode)||!["balanced","a","b","c"].includes(s.dg_phase))throw new RangeError("Unknown connection setting");
    const source=[0,-2*Math.PI/3,2*Math.PI/3].map(angle=>[s.slack_pu*Math.cos(angle),s.slack_pu*Math.sin(angle)]).concat([[0,0]]);
    const pLoad=[[0,0,0],[40,40,40],[s.p3_a_kw,s.p3_b_kw,s.p3_c_kw]].map(row=>row.map(p=>p*s.load_scale));
    const qLoad=pLoad.map(row=>row.map(p=>p*Math.tan(Math.acos(s.power_factor))));
    const generation=[0,1,2].map(i=>s.dg_phase==="balanced"?s.dg_kw/3:s.dg_phase==="abc"[i]?s.dg_kw:0);
    const demand=pLoad.map((row,bus)=>row.map((p,phase)=>[(p-(bus===2?generation[phase]:0))/base.phase_kw,qLoad[bus][phase]/base.phase_kw]));
    const edges=[{id:"12",from:0,to:1,r:.012,x:.008,rn:.018,xn:.006,active:!s.open12},
      {id:"23",from:1,to:2,r:.008,x:.006,rn:.012,xn:.004,active:!s.open23}];
    edges.forEach(e=>{
      const nr=s.neutral_mode==="ideal"?0:s.neutral_scale;
      e.z=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>{
        if(i===3||j===3)return i===j?[e.rn*s.r_scale*nr/base.z_ohm,e.xn*s.x_scale*nr/base.z_ohm]:[0,0];
        return i===j?[e.r*s.r_scale/base.z_ohm,e.x*s.x_scale/base.z_ohm]:[0,e.x*s.x_scale*s.mutual_ratio/base.z_ohm];
      }));
    });
    return {s,source,p_load_kw:pLoad,q_load_kvar:qLoad,generation_kw:generation,demand,edges};
  }
  function loadCurrents(net,voltage) {
    return voltage.map((v,bus)=>{
      const u=local(v);
      if(u.some(phase=>abs(phase)<.05))throw new Error("Very low phase voltage");
      const phases=u.map((phase,i)=>conj(div(net.demand[bus][i],phase)));
      return phases.concat([scale(sum(phases),-1)]);
    });
  }
  function sweep(net,voltage) {
    const loads=loadCurrents(net,voltage);
    const currents=[loads[1].map((i,c)=>add(i,loads[2][c])),loads[2]];
    const next=[net.source.map(v=>[...v])];
    net.edges.forEach((e,k)=>{const drop=matvec(e.z,currents[k]);next.push(next[e.from].map((v,c)=>sub(v,drop[c])));});
    return {next,currents,loads};
  }
  function solve(options={}) {
    const net=network(options), s=net.s;
    if(s.open12||s.open23)return {ok:false,reason:"island",islands:s.open12?[2,3]:[3],history:[]};
    let voltage=Array.from({length:3},()=>net.source.map(v=>[...v])),flow;
    const history=[];
    let converged=false;
    for(let k=0;k<=200;k++) {
      try {flow=sweep(net,voltage);}catch(_){break;}
      const residual=Math.max(...flow.next.flatMap((row,i)=>row.map((v,c)=>abs(sub(v,voltage[i][c])))));
      const minimum=Math.min(...voltage.flatMap(v=>local(v).map(abs)));
      history.push({iteration:k,residual_pu:residual,min_vm_pu:minimum});
      if(!Number.isFinite(residual)||minimum<.1)break;
      if(residual<1e-10){converged=true;break;}
      if(k===200)break;
      voltage=flow.next.map((row,i)=>row.map((v,c)=>add(voltage[i][c],scale(sub(v,voltage[i][c]),.65))));
    }
    if(!converged)return {ok:false,reason:"nonconvergence",history};
    const buses=voltage.map((v,bus)=>({id:bus+1,conductors_pu:v,
      phases:local(v).map((u,i)=>({phase:"abc"[i],u_pu:u,vm_pu:abs(u),voltage_v:abs(u)*base.phase_v,
        theta_deg:Math.atan2(u[1],u[0])*180/Math.PI,p_load_kw:net.p_load_kw[bus][i],q_load_kvar:net.q_load_kvar[bus][i],
        p_net_kw:net.demand[bus][i][0]*base.phase_kw,q_net_kvar:net.demand[bus][i][1]*base.phase_kw})),
      neutral_v:abs(v[3])*base.phase_v,components:sequence(local(v))}));
    const branches=net.edges.map((e,k)=>{
      const current=flow.currents[k],power=bus=>sum(voltage[bus].map((v,c)=>mul(v,conj(current[c]))));
      const from=scale(power(e.from),base.phase_kw),to=scale(power(e.to),-base.phase_kw);
      const currentA=current.map(i=>abs(i)*base.current_a);
      const neutralLoss=abs(current[3])**2*e.z[3][3][0]*base.phase_kw;
      return {...e,currents_pu:current,current_a:currentA,p_from_kw:from[0],q_from_kvar:from[1],p_to_kw:to[0],q_to_kvar:to[1],
        loss_kw:from[0]+to[0],neutral_loss_kw:neutralLoss,
        loading_pct:currentA.map((i,c)=>100*i/(c===3?s.neutral_limit_a:s.current_limit_a))};
    });
    const violations=[];
    buses.forEach(bus=>{
      bus.phases.forEach(p=>{if(p.vm_pu<.95-1e-9||p.vm_pu>1.05+1e-9)violations.push({kind:"voltage",bus:bus.id,phase:p.phase});});
      if(bus.components.vuf_pct>2+1e-7)violations.push({kind:"vuf",bus:bus.id});
    });
    branches.forEach(e=>e.loading_pct.forEach((loading,c)=>{if(loading>100+1e-7)violations.push({kind:"current",line:e.id,phase:"abcn"[c]});}));
    return {ok:true,buses,branches,history,residual_pu:history.at(-1).residual_pu,
      loss_kw:branches.reduce((sum,e)=>sum+e.loss_kw,0),neutral_loss_kw:branches.reduce((sum,e)=>sum+e.neutral_loss_kw,0),
      slack_p_kw:branches[0].p_from_kw,slack_q_kvar:branches[0].q_from_kvar,violations,
      total_load_kw:net.p_load_kw.flat().reduce((sum,p)=>sum+p,0)};
  }
  return Object.freeze({defaults,base,network,solve,sequence,complex:{add,sub,mul,div,conj,abs,scale,sum,matvec,local}});
});
