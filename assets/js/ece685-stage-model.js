(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ECE685StageModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const defaults={
    overview:{load_mw:80,load_mvar:30,shunt_mvar:10,line_loss_mw:3,line_mvar:5,transformer_loss_mw:1,transformer_mvar:2,transmission_kv:138},
    generation:{demand_scale:1,accredited_mw:4850,prm_percent:15,hours:2000,gt_fixed:217000,gt_variable:40.901,cc_fixed:284000,cc_variable:26.05,wind_mw:500,solar_mw:300,wind_credit:0,solar_credit:0},
    'single-phase':{voltage_rms:120,current_rms:10,delta_deg:50,omega:377,target_pf:0.95},
    'three-phase':{voltage_ll:400,resistance:20,reactance:15,connection:'wye',sequence:'abc',phase_ref_deg:0,omega:377},
    transformers:{h_kv:138,turns_ratio:10,s_mva:30,loading:0.8,power_factor:0.9,h_connection:'wye',l_connection:'wye',r_pu:0.01,x_pu:0.08,core_kw:30,oc_v:240,oc_a:2,oc_w:120,sc_v:120,sc_a:4.1667,sc_w:180},
    'per-unit':{system:'three-phase',s_base_mva:100,v_base_h_kv:138,turns_ratio:10,v_actual_l_kv:13.8,current_a:600,z_re_ohm:1,z_im_ohm:4,power_factor:0.9},
    'transformer-banks':{h_kv:138,turns_ratio:10,s_mva:60,h_connection:'wye',l_connection:'delta',h_delta_order:'abc',l_delta_order:'abc'},
    'transformer-network':{h_kv:138,l_rated_kv:13.8,s_mva:60,s_base_mva:100,r_pu:0.006,x_pu:0.09,tap:1,loading:0,power_factor:0.9},
    'exam-review':{focus:'single-phase',voltage_rms:180,current_rms:12,v_phase_deg:-20,i_phase_deg:10,delta_voltage_ll:208,delta_r:8,delta_x:6,s_base_kva:30,v_base_h_v:1500,turns_ratio:10,z_h_re:1.5,z_h_im:3.4369,peak_mw:160,prm_percent:15,gt_fixed:75000,gt_variable:85,cc_fixed:195000,cc_variable:45,hours:2000}
  };
  Object.values(defaults).forEach(Object.freeze);Object.freeze(defaults);
  const rad=x=>x*Math.PI/180, wrap=x=>((x+180)%360+360)%360-180;
  const polar=(m,a)=>({re:m*Math.cos(rad(a)),im:m*Math.sin(rad(a))});
  const add=(a,b)=>({re:a.re+b.re,im:a.im+b.im}), sub=(a,b)=>({re:a.re-b.re,im:a.im-b.im});
  const mul=(a,b)=>({re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re});
  const conj=a=>({re:a.re,im:-a.im}), div=(a,b)=>{const d=b.re*b.re+b.im*b.im;return{re:(a.re*b.re+a.im*b.im)/d,im:(a.im*b.re-a.re*b.im)/d};};
  const describe=z=>({re:z.re,im:z.im,rms:Math.hypot(z.re,z.im),angle_deg:Math.hypot(z.re,z.im)<1e-12?null:wrap(Math.atan2(z.im,z.re)*180/Math.PI)});
  const positive=(p,keys)=>keys.forEach(k=>{if(p[k]<=0)throw Error(k+' must be positive');});
  const nonnegative=(p,keys)=>keys.forEach(k=>{if(p[k]<0)throw Error(k+' must be nonnegative');});
  const range=(p,key,min,max)=>{if(p[key]<min||p[key]>max)throw Error(key+' must be in ['+min+', '+max+']');};
  const choice=(p,key,values)=>{if(!values.includes(p[key]))throw Error(key+' must be one of '+values.join(', '));};
  function plot(x,curves,x_unit,y_unit){return{x,curves:Object.entries(curves).map(([name,values])=>({name,values})),x_unit,y_unit};}
  // Positive supply sequence and fixed paired dots. Delta order names coil
  // endpoint directions (ABC: AB,BC,CA; ACB: AC,BA,CB), not supply sequence.
  function transformerBanks(p){
    positive(p,['h_kv','turns_ratio','s_mva']);
    choice(p,'h_connection',['wye','delta']);choice(p,'l_connection',['wye','delta']);
    choice(p,'h_delta_order',['abc','acb']);choice(p,'l_delta_order',['abc','acb']);
    const kh=p.h_connection==='wye'?Math.sqrt(3):1,kl=p.l_connection==='wye'?Math.sqrt(3):1;
    const ratio=p.turns_ratio*kh/kl,hcoil=p.h_kv/kh,lcoil=hcoil/p.turns_ratio,lv=p.h_kv/ratio;
    const ehAngle=p.h_connection==='wye'?-30:(p.h_delta_order==='abc'?0:-60);
    const delta=wrap(ehAngle+(p.l_connection==='wye'?30:(p.l_delta_order==='abc'?0:60)));
    const ih=p.s_mva*1000/(Math.sqrt(3)*p.h_kv),il=p.s_mva*1000/(Math.sqrt(3)*lv);
    const iwh=p.s_mva*1000/(3*hcoil),iwl=p.s_mva*1000/(3*lcoil);
    const xs=Array.from({length:41},(_,i)=>2+i*.45);
    return{metrics:{line_ratio:ratio,l_line_kv:lv,h_winding_kv:hcoil,l_winding_kv:lcoil,h_line_a:ih,l_line_a:il,h_winding_a:iwh,l_winding_a:iwl,phase_mva:p.s_mva/3,delta_lh_deg:delta},
      phasors:{VAB_H:describe(polar(p.h_kv,0)),EH_A:describe(polar(hcoil,ehAngle)),EL_a:describe(polar(lcoil,ehAngle)),Vab_L:describe(polar(lv,delta))},
      checks:{h_bank_mva:Math.sqrt(3)*p.h_kv*ih/1000-p.s_mva,l_bank_mva:Math.sqrt(3)*lv*il/1000-p.s_mva,winding_current_ratio:iwl/iwh-p.turns_ratio,line_current_ratio:il/ih-ratio},
      plots:[plot(xs,{'LV line voltage':xs.map(a=>p.h_kv/(a*kh/kl)),'LV winding voltage':xs.map(a=>hcoil/a)},'winding ratio a','kV'),plot(xs,{'LV line current':xs.map(a=>p.s_mva*1000*a*kh/kl/(Math.sqrt(3)*p.h_kv)),'LV winding current':xs.map(a=>p.s_mva*1000*a/(3*hcoil))},'winding ratio a','A')]};
  }
  function transformerNetwork(p){
    positive(p,['h_kv','l_rated_kv','s_mva','s_base_mva','tap']);
    nonnegative(p,['r_pu','x_pu','loading']);range(p,'power_factor',0.01,1);
    // L18's Y–delta ABC/abc bank: delta_LH = -30°, theta_HL = +30°.
    // Per-unit H phase is the angle reference; line voltages share this
    // relative displacement. H current enters, L current leaves the branch.
    const ratio=p.h_kv/p.l_rated_kv,a=ratio/Math.sqrt(3),zbH=p.h_kv**2/p.s_base_mva,zbL=p.l_rated_kv**2/p.s_base_mva;
    const z={re:p.r_pu*p.s_base_mva/p.s_mva,im:p.x_pu*p.s_base_mva/p.s_mva},t=polar(p.tap,30);
    const ih=polar(p.loading*p.s_mva/p.s_base_mva,-Math.acos(p.power_factor)*180/Math.PI);
    const vl=div(sub({re:1,im:0},mul(z,ih)),t),il=mul(conj(t),ih),sh=conj(ih),sl=mul(vl,conj(il));
    const loss=mul(z,{re:ih.re**2+ih.im**2,im:0}),v=describe(vl),loading=Array.from({length:41},(_,i)=>i*.03),taps=Array.from({length:41},(_,i)=>.9+i*.005);
    const drop=sub({re:1,im:0},mul(z,ih));
    const loadV=k=>{const i=polar(k*p.s_mva/p.s_base_mva,-Math.acos(p.power_factor)*180/Math.PI);return Math.hypot(...Object.values(sub({re:1,im:0},mul(z,i))))/p.tap;};
    return{metrics:{winding_ratio:a*p.tap,rated_line_ratio:ratio,actual_ideal_line_ratio:ratio*p.tap,theta_hl_deg:30,delta_lh_deg:-30,z_pu_re:z.re,z_pu_im:z.im,z_base_h_ohm:zbH,z_base_l_ohm:zbL,z_h_re_ohm:z.re*zbH,z_h_im_ohm:z.im*zbH,z_l_delta_re_ohm:3*z.re*zbL,z_l_delta_im_ohm:3*z.im*zbL,l_voltage_pu:v.rms,l_line_kv:v.rms*p.l_rated_kv,l_angle_deg:v.angle_deg,h_line_a:Math.hypot(ih.re,ih.im)*p.s_base_mva*1000/(Math.sqrt(3)*p.h_kv),l_line_a:Math.hypot(il.re,il.im)*p.s_base_mva*1000/(Math.sqrt(3)*p.l_rated_kv),input_p_mw:sh.re*p.s_base_mva,output_p_mw:sl.re*p.s_base_mva,series_loss_mw:loss.re*p.s_base_mva},
      phasors:{VH_pu:describe({re:1,im:0}),VL_pu:v,IH_pu:describe(ih),IL_pu:describe(il)},
      checks:{voltage_equation:Math.hypot(...Object.values(sub({re:1,im:0},add(mul(z,ih),mul(t,vl))))),real_power_balance:sh.re-sl.re-loss.re,reactive_power_balance:sh.im-sl.im-loss.im,ohmic_base_invariance:z.re*zbH-p.r_pu*p.h_kv**2/p.s_mva},
      plots:[plot(taps,{'LV line voltage':taps.map(tau=>Math.hypot(drop.re,drop.im)/tau*p.l_rated_kv)},'H-side tap magnitude tau','kV'),plot(loading,{'LV terminal voltage':loading.map(loadV)},'rated input-current loading','pu')]};
  }
  function screening(p){
    const difference=p.gt_variable-p.cc_variable, fixedDifference=p.cc_fixed-p.gt_fixed;
    const crossover=difference===0?null:fixedDifference/difference;
    return{crossover_hours:crossover,gt_cost:p.gt_fixed+p.gt_variable*p.hours,cc_cost:p.cc_fixed+p.cc_variable*p.hours};
  }
  function power(p){
    positive(p,['voltage_rms','omega']);nonnegative(p,['current_rms']);range(p,'delta_deg',-89,89);range(p,'target_pf',0.01,1);
    const P=p.voltage_rms*p.current_rms*Math.cos(rad(p.delta_deg)),Q=p.voltage_rms*p.current_rms*Math.sin(rad(p.delta_deg));
    const targetQ=P*Math.tan(Math.acos(p.target_pf)),qc=Q>0?Math.max(0,Q-targetQ):0;
    const correctedQ=Q-qc,correctedS=Math.hypot(P,correctedQ);
    const x=Array.from({length:241},(_,i)=>i/240*4*Math.PI/p.omega*1000);
    const vn=x.map(t=>Math.cos(p.omega*t/1000)),inorm=x.map(t=>Math.cos(p.omega*t/1000-rad(p.delta_deg)));
    return{metrics:{p_w:P,q_var:Q,s_va:p.voltage_rms*p.current_rms,pf:p.current_rms===0?null:Math.cos(rad(p.delta_deg)),capacitor_var:qc,capacitance_uf:qc/(p.omega*p.voltage_rms**2)*1e6,corrected_pf:correctedS===0?null:P/correctedS,current_after_a:correctedS/p.voltage_rms,frequency_hz:p.omega/(2*Math.PI)},
      phasors:{V:describe(polar(p.voltage_rms,0)),I:describe(polar(p.current_rms,-p.delta_deg))},
      checks:{power_triangle:p.voltage_rms*p.current_rms-Math.hypot(P,Q)},
      plots:[plot(x,{'v / peak':vn,'i / peak':inorm},'ms','normalized'),plot(x,{'p(t)':vn.map((v,i)=>2*p.voltage_rms*p.current_rms*v*inorm[i]),'P (average)':x.map(()=>P)},'ms','W')]};
  }
  function threePhase(p){
    positive(p,['voltage_ll','omega']);nonnegative(p,['resistance']);if(Math.hypot(p.resistance,p.reactance)===0)throw Error('Load impedance must be nonzero');choice(p,'connection',['wye','delta']);choice(p,'sequence',['abc','acb']);
    const shift=p.sequence==='abc'?-120:120,V=p.voltage_ll/Math.sqrt(3),z={re:p.resistance,im:p.reactance};
    const va=polar(V,p.phase_ref_deg),vb=polar(V,p.phase_ref_deg+shift),vc=polar(V,p.phase_ref_deg+2*shift);
    const vab=sub(va,vb),vbc=sub(vb,vc),vca=sub(vc,va);
    const branch=p.connection==='wye'?[div(va,z),div(vb,z),div(vc,z)]:[div(vab,z),div(vbc,z),div(vca,z)];
    const line=p.connection==='wye'?branch:[sub(branch[0],branch[2]),sub(branch[1],branch[0]),sub(branch[2],branch[1])];
    const s=[va,vb,vc].map((v,i)=>mul(v,conj(line[i]))).reduce(add,{re:0,im:0});
    const x=Array.from({length:241},(_,i)=>i/240*4*Math.PI/p.omega*1000);
    const volts=[va,vb,vc].map(v=>describe(v)),amps=line.map(v=>describe(v));
    const wave=(q)=>x.map(t=>Math.SQRT2*q.rms*Math.cos(p.omega*t/1000+rad(q.angle_deg||0)));
    const vwave=volts.map(wave),iwave=amps.map(wave);
    const totalInstantaneous=x.map((_,i)=>vwave.reduce((sum,row,j)=>sum+row[i]*iwave[j][i],0));
    return{metrics:{voltage_ll:p.voltage_ll,branch_voltage:p.connection==='wye'?V:p.voltage_ll,branch_current_a:describe(branch[0]).rms,line_current_a:amps[0].rms,p_w:s.re,q_var:s.im,s_va:Math.hypot(s.re,s.im),pf:p.resistance/Math.hypot(p.resistance,p.reactance),neutral_current_a:Math.hypot(...Object.values(line.reduce(add,{re:0,im:0}))),line_angle_deg:amps[0].angle_deg},
      phasors:{Va:volts[0],Vb:volts[1],Vc:volts[2],Vab:describe(vab),Ia:amps[0],Ibranch:describe(branch[0])},
      checks:{instantaneous_power_ripple:Math.max(...totalInstantaneous)-Math.min(...totalInstantaneous),real_power_balance:s.re-3*(p.connection==='wye'?V:p.voltage_ll)**2*p.resistance/(p.resistance**2+p.reactance**2)},
      plots:[plot(x,{Va:vwave[0],Vb:vwave[1],Vc:vwave[2]},'ms','V'),plot(x,{Ia:iwave[0],Ib:iwave[1],Ic:iwave[2]},'ms','A')]};
  }
  const handlers={
    'exam-review'(p){
      positive(p,['voltage_rms','current_rms','delta_voltage_ll','s_base_kva','v_base_h_v','turns_ratio','peak_mw']);nonnegative(p,['delta_r','prm_percent','gt_fixed','gt_variable','cc_fixed','cc_variable','hours']);choice(p,'focus',['single-phase','three-phase','planning']);
      const delta=wrap(p.v_phase_deg-p.i_phase_deg),P=p.voltage_rms*p.current_rms*Math.cos(rad(delta)),Q=p.voltage_rms*p.current_rms*Math.sin(rad(delta));
      const three=threePhase({...defaults['three-phase'],voltage_ll:p.delta_voltage_ll,resistance:p.delta_r,reactance:p.delta_x,connection:'delta',phase_ref_deg:-30});
      const zb=p.v_base_h_v**2/(p.s_base_kva*1000),vl=p.v_base_h_v/p.turns_ratio,zbl=vl*vl/(p.s_base_kva*1000),screen=screening(p),hours=Array.from({length:45},(_,i)=>8760*i/44);
      const singleX=Array.from({length:241},(_,i)=>i/240*4*Math.PI/377*1000);
      const singlePlot=plot(singleX,{'v / peak':singleX.map(t=>Math.cos(377*t/1000+rad(p.v_phase_deg))),'i / peak':singleX.map(t=>Math.cos(377*t/1000+rad(p.i_phase_deg)))},'ms','normalized');
      return{metrics:{p_w:P,q_var:Q,pf:Math.abs(Math.cos(rad(delta))),delta_line_a:three.metrics.line_current_a,delta_p_w:three.metrics.p_w,delta_q_var:three.metrics.q_var,z_pu_re:p.z_h_re/zb,z_pu_im:p.z_h_im/zb,ib_h_a:p.s_base_kva*1000/p.v_base_h_v,ib_l_a:p.s_base_kva*1000/vl,required_capacity_mw:p.peak_mw*(1+p.prm_percent/100),...screen},
        checks:{per_unit_referral:p.z_h_re/(p.turns_ratio**2)/zbl-p.z_h_re/zb},phasors:three.phasors,
        plots:p.focus==='single-phase'?[singlePlot]:p.focus==='three-phase'?three.plots:[plot(hours,{GT:hours.map(t=>p.gt_fixed+p.gt_variable*t),CC:hours.map(t=>p.cc_fixed+p.cc_variable*t)},'h/year','$/MW-year')]};
    },
    'transformer-banks':transformerBanks,
    'transformer-network':transformerNetwork,
    overview(p){
      positive(p,['transmission_kv']);nonnegative(p,['load_mw','shunt_mvar','line_loss_mw','transformer_loss_mw']);
      const receiveQ=p.load_mvar-p.shunt_mvar,lineP=p.load_mw+p.line_loss_mw,lineQ=receiveQ+p.line_mvar;
      const P=lineP+p.transformer_loss_mw,Q=lineQ+p.transformer_mvar;
      return{metrics:{generator_mw:P,generator_mvar:Q,net_load_mvar:receiveQ,generator_mva:Math.hypot(P,Q),transmission_current_a:Math.hypot(lineP,lineQ)*1e3/(Math.sqrt(3)*p.transmission_kv)},
        checks:{p_balance:P-p.load_mw-p.line_loss_mw-p.transformer_loss_mw,q_balance:Q+p.shunt_mvar-p.load_mvar-p.line_mvar-p.transformer_mvar},
        plots:[plot([0,1,2,3],{P:[P,lineP,p.load_mw,p.load_mw],Q:[Q,lineQ,receiveQ,p.load_mvar]},'node','MW / Mvar')]};
    },
    generation(p){
      positive(p,['demand_scale']);nonnegative(p,['accredited_mw','prm_percent','hours','gt_fixed','gt_variable','cc_fixed','cc_variable','wind_mw','solar_mw']);range(p,'hours',0,8760);range(p,'wind_credit',0,1);range(p,'solar_credit',0,1);
      const chronological=[2500,2300,2200,2400,2900,3500,4000,4200,3900,4380,3700,3000].map(v=>v*p.demand_scale);
      const sorted=[...chronological].sort((a,b)=>b-a),peak=sorted[0],capacityTarget=peak*(1+p.prm_percent/100),screen=screening(p);
      const annualX=[0,1000,4000,7000,8760],annualLoad=[4200,3400,2600,1800,1800].map(v=>v*p.demand_scale);
      const net=annualLoad.map(v=>Math.max(0,v-p.wind_mw-p.solar_mw));
      let ccCapacity=0;
      // Assign each MW layer at its own annual operating duration; this also
      // handles reversed, parallel, and out-of-year screening curves.
      for(let i=0;i<annualX.length-1;i++){
        const next=i===annualX.length-2?0:net[i+1],layer=Math.max(0,net[i]-next),duration=annualX[i+1];
        if(p.cc_fixed+p.cc_variable*duration<p.gt_fixed+p.gt_variable*duration)ccCapacity+=layer;
      }
      const ccUnits=Math.ceil(ccCapacity/543),gtUnits=Math.ceil(Math.max(0,net[0]-ccUnits*543)/211);
      const accredited=ccUnits*543+gtUnits*211+p.wind_mw*p.wind_credit+p.solar_mw*p.solar_credit;
      const annualTarget=annualLoad[0]*(1+p.prm_percent/100),extraGT=Math.ceil(Math.max(0,annualTarget-accredited)/211);
      const hours=Array.from({length:45},(_,i)=>8760*i/44);
      return{metrics:{energy_mwh:chronological.reduce((a,b)=>a+b,0)*2,daily_peak_mw:peak,capacity_target_mw:capacityTarget,capacity_gap_mw:Math.max(0,capacityTarget-p.accredited_mw),current_prm_percent:(p.accredited_mw/peak-1)*100,...screen,cc_units:ccUnits,gt_units_load:gtUnits,extra_gt_prm:extraGT,mix_accredited_mw:accredited+extraGT*211,annual_target_mw:annualTarget},
        checks:{sorted_energy_difference:(chronological.reduce((a,b)=>a+b,0)-sorted.reduce((a,b)=>a+b,0))*2,annual_load_covered:ccUnits*543+gtUnits*211>=net[0]?1:0,reserve_met:accredited+extraGT*211>=annualTarget?1:0},
        plots:[Object.assign(plot(Array.from({length:13},(_,i)=>2*i),{'clock-time load':[...chronological,chronological[11]],'sorted duration load':[...sorted,sorted[11]]},'h','MW'),{step:true}),plot(hours,{GT:hours.map(t=>p.gt_fixed+p.gt_variable*t),CC:hours.map(t=>p.cc_fixed+p.cc_variable*t)},'h/year','$/MW-year')],annual:{hours:annualX,load:annualLoad,net_load:net}};
    },
    'single-phase':power,'three-phase':threePhase,
    transformers(p){
      positive(p,['h_kv','turns_ratio','s_mva','oc_v','oc_a','oc_w','sc_v','sc_a','sc_w']);nonnegative(p,['loading','r_pu','x_pu','core_kw']);range(p,'power_factor',0.01,1);choice(p,'h_connection',['wye','delta']);choice(p,'l_connection',['wye','delta']);
      if(p.oc_w>=p.oc_v*p.oc_a||p.sc_w>p.sc_v*p.sc_a)throw Error('Test real power must not exceed apparent power; OC needs a magnetizing component');
      const kh=p.h_connection==='wye'?Math.sqrt(3):1,kl=p.l_connection==='wye'?Math.sqrt(3):1;
      const hW=p.h_kv/kh,lW=hW/p.turns_ratio,lLine=lW*kl,S=p.s_mva*p.loading;
      const iH=S*1000/(Math.sqrt(3)*p.h_kv),iL=S*1000/(Math.sqrt(3)*lLine);
      const sin=Math.sqrt(1-p.power_factor**2),reg=p.loading*(p.r_pu*p.power_factor+p.x_pu*sin);
      const outputMW=S*p.power_factor,copper=p.r_pu*p.s_mva*p.loading**2,core=p.core_kw/1000;
      const ic=p.oc_w/p.oc_v,im=Math.sqrt(p.oc_a**2-ic**2),rc=p.oc_v**2/p.oc_w,xm=p.oc_v/im;
      const z=p.sc_v/p.sc_a,r=p.sc_w/p.sc_a**2,x=Math.sqrt(Math.max(0,z*z-r*r));
      const fractions=Array.from({length:41},(_,i)=>i/40);
      return{metrics:{h_winding_kv:hW,l_winding_kv:lW,l_line_kv:lLine,line_ratio:p.h_kv/lLine,h_line_a:iH,l_line_a:iL,h_winding_a:iH/(p.h_connection==='delta'?Math.sqrt(3):1),l_winding_a:iL/(p.l_connection==='delta'?Math.sqrt(3):1),output_mw:outputMW,copper_loss_mw:copper,efficiency_percent:outputMW===0?0:outputMW/(outputMW+copper+core)*100,regulation_percent:reg*100,loaded_l_line_kv:lLine*(1-reg),rc_lv_ohm:rc,xm_lv_ohm:xm,req_hv_ohm:r,xeq_hv_ohm:x,rc_hv_ohm:100*rc,xm_hv_ohm:100*xm},
        checks:{ideal_bank_power:S-Math.sqrt(3)*lLine*iL/1000,ampere_turn_ratio:p.turns_ratio*(iH/(p.h_connection==='delta'?Math.sqrt(3):1))-(iL/(p.l_connection==='delta'?Math.sqrt(3):1))},
        plots:[plot(fractions,{'approx. regulation':fractions.map(v=>100*v*(p.r_pu*p.power_factor+p.x_pu*sin))},'loading pu','%'),plot(fractions,{'efficiency':fractions.map(v=>{const out=p.s_mva*v*p.power_factor;return out===0?0:100*out/(out+p.r_pu*p.s_mva*v*v+core);})},'loading pu','%')]};
    },
    'per-unit'(p){
      positive(p,['s_base_mva','v_base_h_kv','turns_ratio','v_actual_l_kv']);nonnegative(p,['current_a']);range(p,'power_factor',0.01,1);choice(p,'system',['single-phase','three-phase']);
      const factor=p.system==='three-phase'?Math.sqrt(3):1,vb=p.v_base_h_kv/p.turns_ratio,ib=p.s_base_mva*1000/(factor*vb),zb=vb*vb/p.s_base_mva,zhb=p.v_base_h_kv**2/p.s_base_mva;
      const zre=p.z_re_ohm/zb,zim=p.z_im_ohm/zb,S=factor*p.v_actual_l_kv*p.current_a/1000;
      const bases=Array.from({length:41},(_,i)=>20+i*4.5);
      return{metrics:{v_base_l_kv:vb,i_base_l_a:ib,i_base_h_a:ib/p.turns_ratio,z_base_l_ohm:zb,z_base_h_ohm:zhb,v_pu:p.v_actual_l_kv/vb,i_pu:p.current_a/ib,z_pu_re:zre,z_pu_im:zim,s_pu:S/p.s_base_mva,physical_s_mva:S,physical_p_mw:S*p.power_factor,recovered_z_re_ohm:zre*zb,recovered_z_im_ohm:zim*zb,referred_z_re_ohm:p.z_re_ohm*p.turns_ratio**2},
        checks:{reconstruction_re:zre*zb-p.z_re_ohm,reconstruction_im:zim*zb-p.z_im_ohm,referral_invariance:p.z_re_ohm*p.turns_ratio**2/zhb-zre,power_base_identity:(p.v_actual_l_kv/vb)*(p.current_a/ib)-S/p.s_base_mva},
        plots:[plot(bases,{'Re(Zpu)':bases.map(b=>p.z_re_ohm*b/vb**2),'Im(Zpu)':bases.map(b=>p.z_im_ohm*b/vb**2)},'Sbase / MVA','pu'),plot(bases,{'recovered Re(Z)':bases.map(()=>p.z_re_ohm),'recovered Im(Z)':bases.map(()=>p.z_im_ohm)},'Sbase / MVA','ohm')]};
    }
  };
  function solve(module,parameters={}){
    if(!defaults[module])throw Error('Unknown teaching module');
    const p={...defaults[module],...parameters};
    Object.entries(defaults[module]).forEach(([key,value])=>{if(typeof value==='number'&&(typeof p[key]!=='number'||!Number.isFinite(p[key])))throw Error(key+' must be finite');});
    const r=handlers[module](p);return{module,parameters:p,...r};
  }
  return{defaults,solve,wrap};
});
