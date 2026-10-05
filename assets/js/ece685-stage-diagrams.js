(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ECE685StageDiagrams=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const palette={ink:'#29262e',purple:'#512888',red:'#a33e3e',blue:'#0877a0',gold:'#b57813',teal:'#087e75',muted:'#696273'};
  const style=`.ed-wire{fill:none;stroke:#29262e;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}.ed-axis{fill:none;stroke:#b9b1c3;stroke-width:1}.ed-text{font:14px system-ui,sans-serif;fill:#696273}.ed-label{font:16px system-ui,sans-serif;fill:#29262e}.ed-heading{font:600 17px system-ui,sans-serif;fill:#512888}.ed-math{font:italic 21px Georgia,"Times New Roman",serif;fill:#29262e}.ed-small{font:12px system-ui,sans-serif;fill:#696273}.ed-core{stroke:#8b8691;stroke-width:1.4;fill:none}.stage-circuit-wire{fill:none;stroke:#29262e;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.stage-circuit-core{fill:none;stroke:#8b8691;stroke-width:1.4}.stage-circuit-symbol{font:italic 22px Georgia,"Times New Roman",serif;fill:#29262e}.stage-circuit-value{font:14px system-ui,sans-serif;fill:#5a5363}.stage-circuit-heading{font:600 16px system-ui,sans-serif;fill:#512888}`;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sub=(s,i)=>`${s}<tspan baseline-shift="sub" font-size="70%">${i}</tspan>`;
  function context(kind,lang){
    const zh=lang==='zh',w=(cn,en)=>zh?cn:en;
    const f=(n,d=2)=>n===null?w('未定义','Undefined'):(Math.abs(n)<.5*10**-d?0:n).toLocaleString(zh?'zh-CN':'en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
    const complex=(re,im,d=3)=>`${f(re,d)} ${im<0?'−':'+'} j${f(Math.abs(im),d)}`;
    const t=(x,y,s,cls='ed-text',anchor='middle',color)=>`<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}"${color?` style="fill:${color}"`:''}>${esc(s)}</text>`;
    const math=(x,y,s,anchor='middle')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" class="ed-math">${s}</text>`;
    const path=(d,color=palette.ink,width=2.3,dash='')=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dash?` stroke-dasharray="${dash}"`:''} stroke-linecap="round" stroke-linejoin="round"/>`;
    const line=(x1,y1,x2,y2,color=palette.ink,width=2.3,dash='')=>path(`M${x1} ${y1}L${x2} ${y2}`,color,width,dash);
    const arrow=(x1,y1,x2,y2,color='purple',dash='')=>`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${palette[color]}" stroke-width="2.2"${dash?` stroke-dasharray="${dash}"`:''} marker-end="url(#ed-${kind}-${color})"/>`;
    const node=(x,y,open=false,color=palette.ink)=>`<circle cx="${x}" cy="${y}" r="${open?3.5:2.8}" fill="${open?'#fff':color}" stroke="${color}" stroke-width="1.7"/>`;
    function component(x1,y1,x2,y2,type='z',color=palette.ink,dot=false){
      const length=Math.hypot(x2-x1,y2-y1),angle=Math.atan2(y2-y1,x2-x1)*180/Math.PI,start=length*.25,end=length*.75;
      let body=line(0,0,start,0,color)+line(end,0,length,0,color);
      if(type==='coil'){
        const step=(end-start)/4;
        body+=path(`M${start} 0`+Array.from({length:4},()=>`a${step/2} ${step/2} 0 0 1 ${step} 0`).join(''),color);
      }else body+=`<rect x="${start}" y="-8" width="${end-start}" height="16" fill="#fff" stroke="${color}" stroke-width="2.3"/>`;
      if(dot)body+=`<circle cx="${length*.12}" cy="-8" r="3.2" fill="${color}"/>`;
      return `<g transform="translate(${x1} ${y1}) rotate(${angle})">${body}</g>`;
    }
    function pair(x,y,h=120){return component(x,y,x,y+h,'coil')+component(x+50,y+h,x+50,y,'coil')+path(`M${x+22} ${y+20}V${y+h-20} M${x+28} ${y+20}V${y+h-20}`, '#8b8691',1.4);}
    function axes(cx,cy,r=110){return `<circle cx="${cx}" cy="${cy}" r="${r}" class="ed-axis" stroke-dasharray="3 5"/>`+line(cx-r-12,cy,cx+r+12,cy,'#b9b1c3',1)+line(cx,cy-r-12,cx,cy+r+12,'#b9b1c3',1)+t(cx+r+12,cy+19,'Re / V','ed-small')+t(cx+10,cy-r-12,'Im / V','ed-small','start');}
    function vector(cx,cy,z,scale,color,name){
      if(z.rms<1e-10)return node(cx,cy,false,palette[color]);
      const dx=z.re*scale,dy=-z.im*scale,length=Math.hypot(dx,dy);
      return `<g data-phasor="${name}">`+arrow(cx,cy,cx+dx,cy+dy,color)+t(cx+dx+dx/length*16,cy+dy+dy/length*16+5,name,'ed-label','middle',palette[color])+'</g>';
    }
    // The winding starts are dotted. Delta order names those directed endpoints;
    // it does not change the fixed abc supply or the paired coil colors.
    function connection(cx,cy,connection,type='z',upper=false,order='abc',scale=1){
      const labels=upper?['A','B','C']:['a','b','c'],colors=[palette.red,palette.blue,palette.gold];
      const points=connection==='wye'?[[cx+110*scale,cy],[cx-55*scale,cy+95*scale],[cx-55*scale,cy-95*scale]]:[[cx+110*scale,cy+85*scale],[cx-110*scale,cy+85*scale],[cx,cy-105*scale]];
      let body='';
      points.forEach(([x,y],i)=>{
        const target=connection==='wye'?[cx,cy]:points[order==='abc'?(i+1)%3:(i+2)%3];
        body+=component(x,y,...target,type,colors[i],type==='coil')+node(x,y,true,colors[i]);
        const dx=x-cx,dy=y-cy,n=Math.hypot(dx,dy);
        body+=t(x+dx/n*21,y+dy/n*21+5,labels[i],'ed-label','middle',colors[i]);
      });
      if(connection==='wye')body+=node(cx,cy)+t(cx+12,cy+23,upper?'N':'n','ed-label','start');
      return body;
    }
    const markers=Object.entries(palette).filter(([name])=>name!=='muted'&&name!=='ink').map(([name,color])=>`<marker id="ed-${kind}-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${color}"/></marker>`).join('');
    return{w,f,complex,t,math,path,line,arrow,node,component,pair,axes,vector,connection,defs:`<style>${style}</style><defs>${markers}</defs>`};
  }
  function overview(r,c){
    const {w,f,t,path,line,arrow,node}=c,m=r.metrics,p=r.parameters;
    let b=t(400,29,w('电力系统单线图与功率平衡','One-line system and power balance'),'ed-heading');
    b+=path('M98 155H186 M242 155H335 M335 155H615 M615 155H705 M615 155V224');
    b+=`<circle cx="75" cy="155" r="23" fill="#fff" stroke="${palette.ink}" stroke-width="2.3"/>`+path('M60 155q7-17 15 0t15 0');
    b+=`<circle cx="204" cy="155" r="18" fill="#fff" stroke="${palette.ink}" stroke-width="2.3"/><circle cx="224" cy="155" r="18" fill="#fff" stroke="${palette.ink}" stroke-width="2.3"/>`;
    b+=line(335,130,335,180,palette.ink,4)+line(615,130,615,180,palette.ink,4)+node(615,155);
    b+=path('M605 224H625 M605 235H625 M615 235V265 M707 146L723 155L707 164',palette.ink);
    b+=arrow(380,128,530,128,'purple')+t(455,110,w('输电线路','Transmission line'),'ed-label');
    b+=t(75,98,w('发电机','Generator'),'ed-label')+t(214,98,w('变压器','Transformer'),'ed-label')+t(720,98,w('负荷','Load'),'ed-label');
    b+=t(75,210,'PG = '+f(m.generator_mw,1)+' MW')+t(75,233,'QG = '+f(m.generator_mvar,1)+' Mvar');
    b+=t(280,270,w('变压器损耗：','Transformer loss: ')+f(p.transformer_loss_mw,1)+' MW');
    b+=t(455,190,f(p.transmission_kv,0)+' kV · '+f(m.transmission_current_a,1)+' A');
    b+=t(455,213,w('线路损耗：','Line loss: ')+f(p.line_loss_mw,1)+' MW');
    b+=t(711,208,'PL = '+f(p.load_mw,1)+' MW')+t(711,232,'QL = '+f(p.load_mvar,1)+' Mvar');
    b+=t(615,296,'Qc = '+f(p.shunt_mvar,1)+' Mvar','ed-label','middle',palette.teal);
    b+=line(35,321,765,321,'#e5dfec',1)+t(400,349,'PG = PL + Pline,loss + PT,loss','ed-label')+t(400,377,'QG + Qc = QL + Qline + QT','ed-label');
    b+=t(400,407,w('三相系统采用单线表示；并联电容提供无功。','One line represents the three-phase system; the shunt supplies reactive power.'));
    return{height:430,body:b};
  }
  function generation(r,c){
    const {w,f,t,line}=c,m=r.metrics,p=r.parameters,maximum=Math.max(p.accredited_mw,m.capacity_target_mw,m.mix_accredited_mw,m.annual_target_mw)*1.1;
    let b=t(400,29,w('容量规划：日峰值与年度净负荷分别核查','Capacity planning: daily and annual cases'),'ed-heading');
    const x=v=>240+v/maximum*475;
    const bar=(y,name,value,color)=>t(220,y+5,name,'ed-text','end')+`<rect x="240" y="${y-12}" width="${x(value)-240}" height="24" fill="${color}" rx="2"/>`+t(735,y+5,f(value,0),'ed-text','start');
    b+=t(45,65,w('L03 · 日峰值与备用','L03 · Daily peak and reserve'),'ed-label','start')+t(735,65,'MW','ed-text','start');
    b+=bar(105,w('日峰值负荷','Daily peak'),m.daily_peak_mw,palette.blue)+bar(147,w('含备用的容量目标','Target with reserve'),m.capacity_target_mw,palette.purple)+bar(189,w('现有可信容量','Existing accredited'),p.accredited_mw,palette.teal);
    b+=line(x(m.capacity_target_mw),88,x(m.capacity_target_mw),205,palette.purple,1.5,'4 4');
    b+=t(400,229,w('日能量：','Daily energy: ')+f(m.energy_mwh,0)+' MWh · '+w('缺额：','Shortfall: ')+f(m.capacity_gap_mw,0)+' MW');
    b+=line(35,249,765,249,'#e5dfec',1)+t(45,280,w('L04 · 年度组合与容量信用','L04 · Annual mix and capacity credit'),'ed-label','start');
    b+=bar(320,w('年度容量目标','Annual target'),m.annual_target_mw,palette.purple);
    let start=240;
    const segments=[['CC',m.cc_units*543,palette.blue],['GT',(m.gt_units_load+m.extra_gt_prm)*211,palette.gold],[w('风电','Wind'),p.wind_mw*p.wind_credit,palette.teal],[w('光伏','Solar'),p.solar_mw*p.solar_credit,palette.red]];
    segments.forEach(([,v,color])=>{b+=`<rect x="${start}" y="355" width="${v/maximum*475}" height="24" fill="${color}"/>`;start+=v/maximum*475;});
    b+=t(220,373,w('建成组合可信容量','Planned accredited mix'),'ed-text','end')+t(735,373,f(m.mix_accredited_mw,0),'ed-text','start');
    b+=line(x(m.annual_target_mw),302,x(m.annual_target_mw),388,palette.purple,1.5,'4 4');
    b+=t(400,410,`CC: ${m.cc_units} × 543 MW · GT: (${m.gt_units_load} + ${m.extra_gt_prm}) × 211 MW`);
    b+=t(400,437,w('蓝：CC · 金：GT · 绿：风电信用 · 红：光伏信用；横向长度按 MW 比例。','Blue: CC · Gold: GT · Teal: wind credit · Red: solar credit; bar length scales with MW.'));
    return{height:460,body:b};
  }
  function singlePhase(r,c){
    const {w,f,t,math,path,line,arrow,node,component}=c,m=r.metrics,p=r.parameters;
    let b=t(400,29,w('单相负荷、并联补偿与复功率','Single-phase load, shunt correction and complex power'),'ed-heading');
    b+=t(250,64,w('电容与原负荷并联','Capacitor in parallel with the original load'),'ed-label')+t(640,64,w('功率三角形','Power triangle'),'ed-label');
    b+=path('M90 118H410 M90 246H410 M90 118V158 M90 202V246 M270 118V148 M270 216V246');
    b+=`<circle cx="90" cy="180" r="22" fill="#fff" stroke="${palette.ink}" stroke-width="2.3"/>`+path('M76 180q7-16 14 0t14 0');
    b+=component(270,148,270,216)+math(306,188,'Z');
    b+=arrow(130,98,197,98,'purple')+t(168,83,'Is = '+f(m.current_after_a)+' A');
    b+=t(90,279,f(p.voltage_rms,0)+' V RMS')+t(270,279,'Iload = '+f(p.current_rms)+' A');
    b+=`<g opacity="${m.capacitance_uf>0?1:.35}">`+line(410,118,410,174,palette.teal)+line(396,174,424,174,palette.teal)+line(396,186,424,186,palette.teal)+line(410,186,410,246,palette.teal)+node(410,118,false,palette.teal)+node(410,246,false,palette.teal)+'</g>';
    b+=t(410,279,'C = '+f(m.capacitance_uf)+' μF','ed-text','middle',palette.teal)+t(250,312,'Qc = '+f(m.capacitor_var)+' var · '+w('补偿后功率因数：','Corrected pf: ')+f(m.corrected_pf,3));
    const ox=540,oy=188,scale=Math.min(175/(m.p_w||1),86/(Math.abs(m.q_var)||1)),px=ox+m.p_w*scale,qy=oy-m.q_var*scale,after=oy-(m.q_var-m.capacitor_var)*scale;
    b+=line(515,oy,756,oy,'#b9b1c3',1)+line(ox,85,ox,291,'#b9b1c3',1)+t(755,oy+22,'+P','ed-small')+t(ox-5,84,'+Q','ed-small','end');
    b+=line(ox,oy,px,oy,palette.blue,3)+line(px,oy,px,qy,palette.gold,3)+arrow(ox,oy,px,qy,'purple');
    if(m.p_w>1e-8)b+=math((ox+px)/2,oy+(m.q_var<0?-12:25),'P');
    if(Math.abs(m.q_var)>1e-8)b+=math(px+18,(oy+qy)/2+5,'Q');
    if(m.s_va>1e-8)b+=math((ox+px)/2-24,(oy+qy)/2+(m.q_var<0?19:-8),'S');
    if(m.capacitor_var>1e-8)b+=arrow(ox,oy,px,after,'teal','5 4');
    b+=t(645,321,'P = '+f(m.p_w)+' W')+t(645,344,'Q = '+f(m.q_var)+' var')+t(645,367,'|S| = '+f(m.s_va)+' VA');
    b+=t(230,358,w('紫：电源电流 · 绿：并联电容','Purple: supply current · Teal: shunt capacitor'))+t(230,381,w('负荷吸收的 Q 与电容提供的 Qc 分开记账。','Keep load Q and capacitor supply Qc separate.'));
    b+=t(400,418,w('功率向量使用同一比例；虚线为补偿后的复功率。零电容支路淡显。','Power vectors share one scale; dashed vector is corrected power. An inactive capacitor is faded.'));
    return{height:440,body:b};
  }
  function threePhase(r,c){
    const {w,f,t,line,axes,vector,connection}=c,m=r.metrics,p=r.parameters,z=r.phasors;
    let b=t(400,29,w('平衡三相相量与实际负荷接线','Balanced phasors and load connection'),'ed-heading');
    b+=t(200,64,w('相电压与线电压 · RMS','Phase and line voltages · RMS'),'ed-label')+t(595,64,p.connection==='wye'?w('星形 Y 负荷','Wye Y load'):w('三角形 Δ 负荷','Delta Δ load'),'ed-label');
    const scale=104/Math.max(z.Va.rms,z.Vab.rms);
    b+=axes(200,204,110)+vector(200,204,z.Va,scale,'red','Va')+vector(200,204,z.Vb,scale,'blue','Vb')+vector(200,204,z.Vc,scale,'gold','Vc')+vector(200,204,z.Vab,scale,'purple','Vab');
    b+=line(395,80,395,330,'#e5dfec',1)+connection(595,204,p.connection,'z',true,'abc',.87);
    b+=t(200,351,p.sequence+' · ∠Va = '+f(z.Va.angle_deg,0)+'°')+t(200,376,'|Va| = '+f(z.Va.rms)+' V · |Vab| = '+f(z.Vab.rms)+' V');
    b+=t(595,351,'Zbranch = '+c.complex(p.resistance,p.reactance,1)+' Ω')+t(595,376,'Vbranch = '+f(m.branch_voltage)+' V')+t(595,401,'Ibranch = '+f(m.branch_current_a)+' A · Iline = '+f(m.line_current_a)+' A');
    b+=t(200,401,'∠Vab = '+f(z.Vab.angle_deg,0)+'°');
    b+=t(400,437,p.connection==='wye'?w('相量共享坐标与比例；星点 N 为公共节点，不表示接地。','Phasors share axes and scale; star point N is a common node, with no grounding assumed.'):w('相量共享坐标与比例；Δ 支路形成闭环，没有中性端子。','Phasors share axes and scale; delta branches form a closed loop with no neutral terminal.'));
    return{height:460,body:b};
  }
  function transformers(r,c){
    const {w,f,t,math,path,line,arrow,node,pair}=c,m=r.metrics,p=r.parameters;
    let b=t(400,29,w('理想绕组模型与三相线量','Ideal winding model and three-phase line quantities'),'ed-heading');
    b+=t(225,69,'H: '+(p.h_connection==='wye'?'Y':'Δ'),'ed-label')+t(625,69,'L: '+(p.l_connection==='wye'?'Y':'Δ'),'ed-label');
    b+=path('M95 140H375 M95 260H375 M425 140H705 M425 260H705')+pair(375,140);
    [[95,140],[95,260],[705,140],[705,260]].forEach(([x,y])=>{b+=node(x,y,true);});
    b+=math(73,150,'+')+math(73,269,'−')+math(728,150,'+')+math(728,269,'−');
    b+=math(73,208,sub('E','H'))+math(728,208,sub('E','L'))+math(400,105,'a : 1');
    b+=arrow(130,118,205,118,'red')+arrow(595,118,670,118,'blue')+t(168,98,'Icoil,H = '+f(m.h_winding_a,1)+' A')+t(632,98,'Icoil,L = '+f(m.l_winding_a,1)+' A');
    b+=t(240,187,'E_H = '+f(m.h_winding_kv,3)+' kV')+t(585,187,'E_L = '+f(m.l_winding_kv,3)+' kV')+t(240,213,'VLL,H = '+f(p.h_kv,3)+' kV')+t(585,213,'VLL,L = '+f(m.l_line_kv,3)+' kV');
    b+=t(400,294,'a = '+f(p.turns_ratio,3)+' · kLL = '+f(m.line_ratio,3),'ed-label');
    b+=line(35,315,765,315,'#e5dfec',1)+t(230,348,w('绕组关系：EH / EL = a','Winding relation: EH / EL = a'),'ed-label')+t(585,348,w('线电压比：a kH / kL','Line-voltage ratio: a kH / kL'),'ed-label');
    b+=t(230,375,w('图中电流为绕组电流，按理想安匝关系换算。','Arrows show winding currents from ideal ampere-turn balance.'))+t(585,375,'kY = √3 · kΔ = 1');
    b+=t(400,409,w('图示理想绕组幅值；损耗与电压调整率在下方曲线核查，相移需另给接线约定。','Ideal winding magnitudes shown; inspect losses below. Phase displacement requires connection conventions.'));
    return{height:435,body:b};
  }
  function perUnit(r,c){
    const {w,f,t,math,path,line,node,pair,component}=c,m=r.metrics,p=r.parameters,three=p.system==='three-phase';
    let b=t(400,29,w('阻抗折算与协调电压基准','Impedance referral and coordinated voltage bases'),'ed-heading');
    b+=t(215,65,'H: '+(three?'Vbase,LL':'Vbase')+' = '+f(p.v_base_h_kv,2)+' kV','ed-label')+t(610,65,'L: '+(three?'Vbase,LL':'Vbase')+' = '+f(m.v_base_l_kv,2)+' kV','ed-label');
    b+=path('M95 135H370 M95 255H370 M420 135H695 M420 255H695')+pair(370,135)+component(695,135,695,255);
    b+=node(95,135,true)+node(95,255,true)+math(395,110,'a : 1')+math(743,208,sub('Z','L'));
    b+=t(215,185,'ZH = a² ZL','ed-label')+t(215,214,w('折算至高压侧','Referred to H side'));
    b+=t(585,184,'ZL = '+c.complex(p.z_re_ohm,p.z_im_ohm,2)+' Ω')+t(585,210,'a = '+f(p.turns_ratio,3));
    b+=t(215,288,'ZB,H = '+f(m.z_base_h_ohm,3)+' Ω')+t(585,288,'ZB,L = '+f(m.z_base_l_ohm,3)+' Ω');
    b+=t(215,312,'IB,H = '+f(m.i_base_h_a,1)+' A')+t(585,312,'IB,L = '+f(m.i_base_l_a,1)+' A');
    b+=line(35,333,765,333,'#e5dfec',1)+t(400,363,'zpu = ZH / ZB,H = ZL / ZB,L = '+c.complex(m.z_pu_re,m.z_pu_im,4),'ed-label');
    b+=t(400,390,'SB = '+f(p.s_base_mva,0)+' MVA · '+w('还原 ZL = ','Recovered ZL = ')+c.complex(m.recovered_z_re_ohm,m.recovered_z_im_ohm,2)+' Ω');
    b+=t(400,423,three?w('三相基准使用总三相容量和线电压；单相等效支路表示阻抗折算。','Three-phase bases use total S and line voltage; the branch illustrates impedance referral.'):w('单相基准使用单相容量和端电压；改变基准不改变实际阻抗。','Single-phase bases use terminal V and single-phase S; changing bases preserves physical impedance.'));
    return{height:445,body:b};
  }
  function banks(r,c){
    const {w,f,t,math,line,connection,vector}=c,m=r.metrics,p=r.parameters;
    let b=t(400,29,w('三相绕组接线、同名端与端口相移','Three-phase windings, paired dots and terminal displacement'),'ed-heading');
    b+=t(205,55,'H: '+(p.h_connection==='wye'?'Y':'Δ'),'ed-label')+t(595,55,'L: '+(p.l_connection==='wye'?'Y':'Δ'),'ed-label')+math(400,128,'a = '+esc(f(p.turns_ratio,2)));
    b+=connection(205,185,p.h_connection,'coil',true,p.h_delta_order,.86)+connection(595,185,p.l_connection,'coil',false,p.l_delta_order,.86);
    b+=t(205,308,'VLL,H = '+f(p.h_kv,3)+' kV')+t(595,308,'VLL,L = '+f(m.l_line_kv,3)+' kV');
    b+=t(205,331,'Ecoil,H = '+f(m.h_winding_kv,3)+' kV')+t(595,331,'Ecoil,L = '+f(m.l_winding_kv,3)+' kV');
    b+=t(205,354,p.h_connection==='delta'?(p.h_delta_order==='abc'?'AB · BC · CA':'AC · BA · CB'):w('星点 N，不假定接地','Star point N; no grounding assumed'));
    b+=t(595,354,p.l_connection==='delta'?(p.l_delta_order==='abc'?'ab · bc · ca':'ac · ba · cb'):w('星点 n，不假定接地','Star point n; no grounding assumed'));
    b+=line(35,375,765,375,'#e5dfec',1);
    const delta=m.delta_lh_deg*Math.PI/180,base={re:1,im:0,rms:1},lv={re:Math.cos(delta),im:Math.sin(delta),rms:1};
    b+=line(75,434,290,434,'#b9b1c3',1)+vector(105,434,base,90,'red','H')+vector(105,434,lv,55,'blue','L');
    b+=t(485,410,'kLL = '+f(m.line_ratio,3)+' · δLH = '+f(m.delta_lh_deg,0)+'°','ed-label')+t(485,436,'Iline,H = '+f(m.h_line_a,1)+' A · Iline,L = '+f(m.l_line_a,1)+' A');
    b+=t(485,464,w('相量只比较方向；H 线电压为 0° 参考。','Phasors compare angles only; H line voltage is the 0° reference.'));
    b+=t(400,525,w('同色绕组为配对线圈，圆点为同名端；相移由端子连接方向决定。','Matching colors pair the coils; dots identify their starts. Directed terminal joining sets displacement.'));
    return{height:550,body:b};
  }
  function transformerNetworkDiagram(svg,r,lang){
    const c=context('transformer-network',lang),words=c.w,fmt=(n,d=3)=>c.f(n,d);
    const m=r.metrics,p=r.parameters;
    const sub=(symbol,index)=>`${symbol}<tspan baseline-shift="sub" font-size="70%">${index}</tspan>`;
    const value=(x,y,s)=>`<text x="${x}" y="${y}" text-anchor="middle" class="stage-circuit-value">${esc(s)}</text>`;
    const symbol=(x,y,s)=>`<text x="${x}" y="${y}" text-anchor="middle" class="stage-circuit-symbol">${s}</text>`;
    // L18 slide 14: H-side series impedance and separate ideal-transformer ports.
    // The complex ratio is in pu on fixed bases, rather than the physical turns ratio.
    svg.setAttribute('viewBox','0 0 800 365');
    svg.innerHTML=`<title>${esc(words('Y–Δ 变压器正序等效电路','Y–Δ transformer positive-sequence equivalent circuit'))}</title>
      <desc>${esc(words('高压侧串联等效阻抗连接理想变压器。高、低压侧回路彼此电气隔离。两侧电压上正下负，高压电流流入、低压电流流出。所有相量采用固定基准的标幺值，忽略励磁支路。','H-side series impedance feeds an ideal transformer with electrically separate H and L ports. Voltage references are positive at the top; H current enters and L current leaves. Phasors use fixed per-unit bases; excitation is neglected.'))}</desc>
      <defs>
        <marker id="stage-circuit-h-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a33e3e" stroke-width="1.5"/></marker>
        <marker id="stage-circuit-l-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#0877a0" stroke-width="1.5"/></marker>
      </defs>
      <text x="400" y="28" text-anchor="middle" class="stage-circuit-heading">${esc(words('Y–Δ 正序等效电路','Y–Δ positive-sequence equivalent circuit'))}</text>
      <g class="stage-circuit-wire">
        <path d="M115 140H250 M335 140H475V152 M475 252V265H115 M525 152V140H720 M525 252V265H720"/>
        <rect x="250" y="127" width="85" height="26"/>
        <path d="M475 152a12.5 12.5 0 0 1 0 25a12.5 12.5 0 0 1 0 25a12.5 12.5 0 0 1 0 25a12.5 12.5 0 0 1 0 25 M525 152a12.5 12.5 0 0 0 0 25a12.5 12.5 0 0 0 0 25a12.5 12.5 0 0 0 0 25a12.5 12.5 0 0 0 0 25"/>
        <g fill="#fff"><circle cx="115" cy="140" r="3.5"/><circle cx="115" cy="265" r="3.5"/><circle cx="720" cy="140" r="3.5"/><circle cx="720" cy="265" r="3.5"/></g>
      </g>
      <path d="M497 151V253 M503 151V253" class="stage-circuit-core"/>
      <path d="M145 76H215" fill="none" stroke="#a33e3e" stroke-width="2" marker-end="url(#stage-circuit-h-arrow)"/>
      <path d="M615 76H685" fill="none" stroke="#0877a0" stroke-width="2" marker-end="url(#stage-circuit-l-arrow)"/>
      ${symbol(180,57,sub('i','H'))}${symbol(650,57,sub('i','L'))}
      ${value(180,101,fmt(r.phasors.IH_pu.rms)+' pu ('+fmt(m.h_line_a,1)+' A)')}
      ${value(650,101,fmt(r.phasors.IL_pu.rms)+' pu ('+fmt(m.l_line_a,1)+' A)')}
      ${symbol(293,113,sub('z','eq'))}
      ${value(293,192,fmt(m.z_pu_re)+' + j'+fmt(m.z_pu_im)+' pu')}
      ${value(293,215,words('折算至高压侧的串联阻抗','H-side series impedance'))}
      ${symbol(500,65,'τe<tspan baseline-shift="super" font-size="70%">j30°</tspan> : 1')}
      ${value(500,90,'τ = '+fmt(p.tap))}
      ${value(500,113,words('标幺理想变压器','Per-unit ideal transformer'))}
      ${symbol(82,149,'+')}${symbol(82,273,'−')}${symbol(82,207,sub('v','H'))}
      ${symbol(751,149,'+')}${symbol(751,273,'−')}${symbol(751,207,sub('v','L'))}
      ${value(225,298,'vH = 1.000∠0° pu')}
      ${value(625,298,'vL = '+fmt(m.l_voltage_pu)+'∠'+fmt(m.l_angle_deg,1)+'° pu')}
      ${value(225,320,words('高压线电压：','HV line voltage: ')+fmt(p.h_kv)+' kV')}
      ${value(625,320,words('低压线电压：','LV line voltage: ')+fmt(m.l_line_kv)+' kV')}
      ${value(400,351,words('平衡正序 · 忽略励磁支路 · 保持电压基准不变','Balanced positive sequence · excitation neglected · fixed voltage bases'))}`;
  }
  function review(r,c){
    const p=r.parameters,m=r.metrics;
    if(p.focus==='single-phase')return singlePhase({parameters:{...p,delta_deg:p.v_phase_deg-p.i_phase_deg},metrics:{...m,s_va:p.voltage_rms*p.current_rms,capacitor_var:0,capacitance_uf:0,current_after_a:p.current_rms,corrected_pf:m.pf}},c);
    if(p.focus==='three-phase')return threePhase({parameters:{connection:'delta',sequence:'abc',resistance:p.delta_r,reactance:p.delta_x},phasors:r.phasors,metrics:{branch_voltage:p.delta_voltage_ll,branch_current_a:p.delta_voltage_ll/Math.hypot(p.delta_r,p.delta_x),line_current_a:m.delta_line_a}},c);
    const {w,f,t,line,path}=c,max=Math.max(p.gt_fixed+p.gt_variable*8760,p.cc_fixed+p.cc_variable*8760,1),x=h=>90+h/8760*620,y=v=>315-v/max*220;
    let b=t(400,29,w('经济性筛选曲线与可信容量目标','Screening curves and accredited capacity target'),'ed-heading');
    b+=line(90,85,90,315,'#b9b1c3',1)+line(90,315,725,315,'#b9b1c3',1)+t(90,70,'$/MW-year','ed-text','start')+t(725,340,'h/year','ed-text','end');
    for(const [name,color,fixed,variable] of [['GT',palette.gold,p.gt_fixed,p.gt_variable],['CC',palette.blue,p.cc_fixed,p.cc_variable]]){
      b+=line(x(0),y(fixed),x(8760),y(fixed+variable*8760),color,2.8)+t(740,y(fixed+variable*8760)+5,name,'ed-label','start',color);
    }
    b+=line(x(p.hours),85,x(p.hours),315,palette.purple,1.5,'4 4')+t(x(p.hours),338,f(p.hours,0),'ed-text');
    b+=t(400,376,'T* = '+f(m.crossover_hours,0)+' h · '+w('容量目标：','Capacity target: ')+f(m.required_capacity_mw,1)+' MW','ed-label');
    b+=t(400,407,w('按运行时长比较成本；容量目标按峰值与规划备用率计算。','Compare costs at the operating duration; the capacity target includes planning reserve.'));
    return{height:435,body:b};
  }
  const handlers={overview,generation,'single-phase':singlePhase,'three-phase':threePhase,transformers,'per-unit':perUnit,'transformer-banks':banks,'exam-review':review};
  function render(kind,r,lang='en'){
    const c=context(kind,lang);
    if(kind==='transformer-network'){
      const svg={setAttribute(k,v){this[k]=v;},innerHTML:''};
      transformerNetworkDiagram(svg,r,lang);
      return{viewBox:svg.viewBox,markup:c.defs+svg.innerHTML};
    }
    if(!handlers[kind])throw Error('Unknown diagram: '+kind);
    const d=handlers[kind](r,c);
    return{viewBox:`0 0 800 ${d.height}`,markup:`<title>${esc(c.w('ECE 685 教学模型图','ECE 685 teaching model diagram'))}</title>${c.defs}${d.body}`};
  }
  function standalone(kind,r,lang='en'){
    const d=render(kind,r,lang);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${d.viewBox}" role="img">${d.markup}</svg>\n`;
  }
  function representations(lang='en'){
    const {w,t,math,path,line,arrow,axes}=context('representations',lang),phi=35*Math.PI/180;
    let body=t(145,31,w('时域 · 峰值','Time domain · peak'),'ed-heading')+t(435,31,w('极坐标相量 · RMS','Polar phasor · RMS'),'ed-heading')+t(695,31,w('直角坐标相量 · RMS','Rectangular phasor · RMS'),'ed-heading');
    body+=line(45,132,250,132,'#b9b1c3',1)+line(45,64,45,201,'#b9b1c3',1);
    const wave=Array.from({length:161},(_,i)=>`${i?'L':'M'}${45+i/160*205} ${132-55*Math.cos(i/160*2*Math.PI+phi)}`).join(' ');
    body+=path(wave,palette.purple,2.8)+t(35,80,'1','ed-small','end')+t(35,191,'−1','ed-small','end')+t(45,218,'0','ed-small')+t(148,218,'π','ed-small')+t(250,218,'2π','ed-small')+t(148,59,'v(t) / Vpeak','ed-text');
    body+=line(337,191,519,191,'#b9b1c3',1)+line(362,64,362,212,'#b9b1c3',1)+arrow(362,191,362+95*Math.cos(phi),191-95*Math.sin(phi),'purple');
    body+=path('M398 191 A36 36 0 0 0 '+(362+36*Math.cos(phi))+' '+(191-36*Math.sin(phi)),palette.gold,1.5)+math(411,183,'φ')+math(422,116,'V<tspan baseline-shift="sub" font-size="70%">RMS</tspan>');
    body+=line(598,191,791,191,'#b9b1c3',1)+line(619,64,619,212,'#b9b1c3',1)+arrow(619,191,619+95*Math.cos(phi),191-95*Math.sin(phi),'purple');
    body+=path(`M${619+95*Math.cos(phi)} ${191-95*Math.sin(phi)}V191H619`,palette.teal,1.5,'4 4')+math(658,211,'a')+math(721,167,'b');
    body+=t(145,250,'v(t) = √2 VRMS cos(ωt + φ)','ed-label')+t(435,250,'V = VRMS ∠φ','ed-label')+t(695,250,'V = a + jb','ed-label');
    body+=t(430,282,w('同一信号，φ = 35°；波形按峰值归一化，相量采用 RMS 幅值。','One signal at φ = 35°; the waveform is peak-normalized and the phasors use RMS magnitude.'));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 305" role="img"><title>${esc(w('同一个正弦电压的三种数学表示','Three mathematical representations of one sinusoidal voltage'))}</title><style>${style}</style>${context('representations',lang).defs}${body}</svg>\n`;
  }
  return{render,standalone,representations};
});
