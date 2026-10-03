(function () {
  "use strict";
  const root=document.getElementById('unbalanced-lab'),model=window.UnbalancedPowerFlow;
  if(!root||!model)return;
  const zh=root.dataset.lang==='zh',ns='http://www.w3.org/2000/svg';
  const colors=['var(--uf-a)','var(--uf-b)','var(--uf-c)','var(--uf-n)'];
  const networkSvg=root.querySelector('.uf-network'),phaseSvg=document.querySelector('.uf-phasors');
  const profileSvg=root.querySelector('.uf-profile'),loadingSvg=root.querySelector('.uf-loading');
  const labels=zh?{bus:'节点',line:'支路',phase:'相',neutral:'中性线',open:'断开',voltage:'电压越限',current:'电流越限',vuf:'VUF 越限',safe:'已收敛，满足当前教学限值。',warning:'已收敛，存在越限：',island:'与参考电源断开，无法在本模型中供电。',fail:'前推回代未收敛；这不能证明系统不存在物理解。',profile:'相对当地中性点的电压 (pu)',loading:'电流 / 导线限值 (%)'}:
    {bus:'Bus',line:'Branch',phase:'phase',neutral:'neutral',open:'Open',voltage:'voltage',current:'current',vuf:'VUF',safe:'Converged; within the current teaching limits.',warning:'Converged with limit violations: ',island:'disconnected from the reference source; not supplied in this model.',fail:'The sweep did not converge; this does not prove physical infeasibility.',profile:'Phase-to-local-neutral voltage (pu)',loading:'Current / conductor limit (%)'};
  const presets={baseline:{},balanced:{p3_a_kw:60,p3_b_kw:60,p3_c_kw:60},heavy:{load_scale:2},
    neutral:{p3_a_kw:140,p3_b_kw:20,p3_c_kw:20,dg_kw:0,neutral_scale:2},solar:{dg_phase:'a',dg_kw:160}};
  let state={...model.defaults},result,runner;
  const f=(n,d=2)=>(Math.abs(n)<1e-8?0:n).toFixed(d);
  const abs=model.complex.abs;
  function element(svg,tag,attrs={}){const node=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,value));svg.appendChild(node);return node;}
  function text(svg,x,y,value,anchor='middle',color){const t=element(svg,'text',{x,y,'text-anchor':anchor});t.textContent=value;if(color)t.style.fill=color;return t;}
  function canvas(svg,height,title){const width=svg.getBoundingClientRect().width;if(!width)return 0;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('height',height);svg.replaceChildren();element(svg,'title').textContent=title;return width;}
  function marker(svg,x,y,phase,color){
    if(phase===0)element(svg,'circle',{cx:x,cy:y,r:3.2,fill:color});
    else if(phase===1)element(svg,'rect',{x:x-3,y:y-3,width:6,height:6,fill:color});
    else element(svg,'polygon',{points:`${x},${y-4} ${x-4},${y+3} ${x+4},${y+3}`,fill:color});
  }
  function drawNetwork(){
    const w=canvas(networkSvg,285,zh?'三相四线馈线电压':'Four-wire feeder voltages');if(!w)return;
    const x=[w*.13,w*.5,w*.87];
    ['12','23'].forEach((id,k)=>{
      const active=!state['open'+id],branch=result.ok?result.branches[k]:null;
      for(let phase=0;phase<4;phase++){
        const y=67+phase*10,color=active?colors[phase]:'var(--bf-border)';
        element(networkSvg,'line',{x1:x[k]+22,y1:y,x2:x[k+1]-22,y2:y,stroke:color,'stroke-width':!branch?1.5:1.5+Math.min(4,branch.current_a[phase]/200),'stroke-dasharray':!active?'4 4':phase===3?'5 3':'none'});
      }
      text(networkSvg,(x[k]+x[k+1])/2,24,labels.line+' '+id[0]+'–'+id[1]);
      text(networkSvg,(x[k]+x[k+1])/2,43,active&&branch?f(branch.p_from_kw,1)+' kW':active?'—':labels.open);
    });
    x.forEach((cx,i)=>{
      element(networkSvg,'circle',{cx,cy:82,r:22,fill:i===0?'#e7eefb':'var(--bf-surface)',stroke:'var(--bf-border)','stroke-width':1.5});
      text(networkSvg,cx,86,String(i+1));
      for(let phase=0;phase<3;phase++)text(networkSvg,cx,130+phase*21,'ABC'[phase]+' '+(result.ok?f(result.buses[i].phases[phase].vm_pu,4):'—'), 'middle',colors[phase]);
      text(networkSvg,cx,201,'N '+(result.ok?f(result.buses[i].neutral_v,2)+' V':'—'),'middle',colors[3]);
      text(networkSvg,cx,237,i===0?(zh?'参考电源':'Reference'):(i===1?'40 / 40 / 40':f(state.p3_a_kw,0)+' / '+f(state.p3_b_kw,0)+' / '+f(state.p3_c_kw,0)));
      const demandLabel=w<500?(zh?'kW × 倍率':'kW × scale'):(zh?'各相 kW × 负荷倍率':'phase kW × demand');
      text(networkSvg,cx,256,i===0?'400 V LL':demandLabel);
      if(i===2)text(networkSvg,cx,278,'PV '+f(state.dg_kw,0)+' kW');
    });
  }
  function drawPhasors(){
    const w=canvas(phaseSvg,260,zh?'节点 3 三相电压相量':'Bus 3 three-phase voltage phasors');if(!w)return;
    if(!result.ok){text(phaseSvg,w/2,120,'—');return;}
    const cx=w/2,cy=116,radius=Math.min(82,w*.25);
    element(phaseSvg,'circle',{cx,cy,r:radius,stroke:'var(--bf-border)',fill:'none'});
    [0,-2*Math.PI/3,2*Math.PI/3].forEach(a=>element(phaseSvg,'line',{x1:cx,y1:cy,x2:cx+radius*Math.cos(a),y2:cy-radius*Math.sin(a),stroke:'var(--bf-muted)','stroke-dasharray':'3 4'}));
    result.buses[2].phases.forEach((phase,i)=>{
      const [re,im]=phase.u_pu,x=cx+radius*re,y=cy-radius*im;
      element(phaseSvg,'line',{x1:cx,y1:cy,x2:x,y2:y,stroke:colors[i],'stroke-width':2.5});marker(phaseSvg,x,y,i,colors[i]);
      const a=Math.atan2(im,re),length=radius*phase.vm_pu+15;
      text(phaseSvg,cx+length*Math.cos(a),cy-length*Math.sin(a)+4,'U'+'ABC'[i],'middle',colors[i]);
    });
    text(phaseSvg,w/2,231,'VUF = '+f(result.buses[2].components.vuf_pct,3)+'%');
    text(phaseSvg,w/2,251,'|U₀| / |U₁| = '+f(result.buses[2].components.zero_pct,3)+'%');
  }
  function drawProfile(svg,solution){
    const w=canvas(svg,285,labels.profile);if(!w)return;
    if(!solution?.ok){text(svg,w/2,130,'—');return;}
    const values=solution.buses.flatMap(bus=>bus.phases.map(p=>p.vm_pu));
    const lo=Math.min(.9,...values.map(v=>v-.025)),hi=Math.max(1.06,...values.map(v=>v+.025));
    const left=48,right=w-18,top=40,bottom=209;
    const y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top),x=i=>left+i*(right-left)/2;
    element(svg,'rect',{x:left,y:y(1.05),width:right-left,height:y(.95)-y(1.05),fill:'#eaf4ef'});
    for(let k=0;k<5;k++){const v=lo+(hi-lo)*k/4,yy=y(v);element(svg,'line',{x1:left,y1:yy,x2:right,y2:yy,stroke:'var(--bf-border)'});text(svg,left-8,yy+4,f(v,2),'end');}
    text(svg,left,18,labels.profile,'start');
    for(let phase=0;phase<3;phase++){
      const points=solution.buses.map((bus,i)=>[x(i),y(bus.phases[phase].vm_pu)]);
      element(svg,'polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:colors[phase],'stroke-width':1.8,'stroke-dasharray':['none','5 3','2 3'][phase]});
      points.forEach(p=>marker(svg,...p,phase,colors[phase]));
      text(svg,w*(phase+.5)/3,277,'ABC'[phase]+' '+f(solution.buses[2].phases[phase].vm_pu,4),'middle',colors[phase]);
    }
    [0,1,2].forEach(i=>text(svg,x(i),231,String(i+1)));
    text(svg,w/2,251,labels.bus+' / '+(zh?'末端电压↓':'end-bus values ↓'));
  }
  function drawLoading(){
    const w=canvas(loadingSvg,285,labels.loading);if(!w)return;
    if(!result.ok){text(loadingSvg,w/2,130,'—');return;}
    const left=55,right=w-43,scaleMax=Math.max(120,...result.branches.flatMap(e=>e.loading_pct).map(v=>v*1.12));
    const x=p=>left+p/scaleMax*(right-left);
    text(loadingSvg,left,18,labels.loading,'start');
    result.branches.forEach((branch,k)=>branch.loading_pct.forEach((value,phase)=>{
      const yy=40+k*100+phase*21;
      text(loadingSvg,left-8,yy+11,branch.id[0]+'–'+branch.id[1]+' '+'ABCN'[phase],'end');
      element(loadingSvg,'rect',{x:left,y:yy,width:right-left,height:13,fill:'#edf3f7'});
      element(loadingSvg,'rect',{x:left,y:yy,width:x(value)-left,height:13,fill:colors[phase]});
      text(loadingSvg,right+6,yy+11,f(value,0)+'%','start');
    }));
    element(loadingSvg,'line',{x1:x(100),y1:35,x2:x(100),y2:227,stroke:'var(--bf-muted)','stroke-dasharray':'3 3'});
    text(loadingSvg,left,251,'0','start');text(loadingSvg,x(100),251,'100');text(loadingSvg,right,274,'%','end');
  }
  function table(selector,rows){const body=root.querySelector(selector);body.replaceChildren();rows.forEach(row=>{const tr=document.createElement('tr');row.forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.appendChild(td);});body.appendChild(tr);});}
  function drawAll(){drawNetwork();drawPhasors();drawProfile(profileSvg,result);drawLoading();if(runner)runner.redraw();}
  function sync(){root.querySelectorAll('[data-key]').forEach(input=>{if(input.type==='checkbox')input.checked=state[input.dataset.key];else input.value=state[input.dataset.key];});}
  function update(){
    result=model.solve(state);root.dataset.result=JSON.stringify(result);root.dataset.case=JSON.stringify(state);
    root.querySelectorAll('input[type="range"]').forEach(input=>{
      const key=input.dataset.key,digits=['power_factor','slack_pu'].includes(key)?3:['load_scale','r_scale','x_scale','neutral_scale','mutual_ratio'].includes(key)?2:0;
      const value=f(state[key],digits)+' '+input.dataset.unit;root.querySelector('[data-value="'+key+'"]').textContent=value.trim();input.setAttribute('aria-valuetext',value.trim());
    });
    root.querySelector('[data-key="neutral_scale"]').disabled=state.neutral_mode==='ideal';
    const metric=(key,value)=>root.querySelector('[data-metric="'+key+'"]').textContent=value;
    metric('min',result.ok?f(Math.min(...result.buses.flatMap(b=>b.phases.map(p=>p.vm_pu))),4)+' pu':'—');
    metric('vuf',result.ok?f(result.buses[2].components.vuf_pct,3)+'%':'—');
    metric('neutral',result.ok?f(result.buses[2].neutral_v,2)+' V':'—');metric('loss',result.ok?f(result.loss_kw,3)+' kW':'—');
    const status=root.querySelector('[data-status]');status.dataset.state=!result.ok||result.violations.length?'warning':'safe';
    status.textContent=!result.ok?(result.reason==='island'?labels.bus+' '+result.islands.join(', ')+' '+labels.island:labels.fail):result.violations.length?labels.warning+result.violations.map(v=>v.kind==='voltage'?labels.bus+' '+v.bus+' '+v.phase.toUpperCase()+' '+labels.voltage:v.kind==='vuf'?labels.bus+' '+v.bus+' '+labels.vuf:labels.line+' '+v.line[0]+'–'+v.line[1]+' '+v.phase.toUpperCase()+' '+labels.current).join('; '):labels.safe;
    table('[data-phases]',result.ok?result.buses.flatMap(bus=>bus.phases.map(p=>[bus.id+' / '+p.phase.toUpperCase(),f(p.vm_pu,5),f(p.voltage_v,2),f(p.theta_deg,3),f(p.p_net_kw,3),f(p.q_net_kvar,3)])):[]);
    table('[data-sequences]',result.ok?result.buses.map(bus=>[bus.id,f(abs(bus.components.positive_pu),5),f(abs(bus.components.negative_pu),5),f(abs(bus.components.zero_pu),5),f(bus.components.vuf_pct,3),f(bus.neutral_v,3)]):[]);
    table('[data-branches]',result.ok?result.branches.map(e=>[e.id[0]+'–'+e.id[1],...e.current_a.map(i=>f(i,2)),f(e.loss_kw,4),f(e.neutral_loss_kw,4)]):[]);
    table('[data-iterations]',result.history.map(h=>[h.iteration,h.residual_pu.toExponential(2),f(h.min_vm_pu,6)]));
    root.querySelector('[data-power-balance]').textContent=result.ok?(zh?'参考电源 + 光伏 − 负荷 = 损耗：':'Reference + PV − load = loss: ')+f(result.slack_p_kw,4)+' + '+f(state.dg_kw,1)+' − '+f(result.total_load_kw,1)+' = '+f(result.loss_kw,4)+' kW. Qslack = '+f(result.slack_q_kvar,3)+' kvar.':'';
    if(runner)runner.markStale();drawAll();
  }
  root.querySelectorAll('[data-key]').forEach(input=>input.addEventListener('input',()=>{state[input.dataset.key]=input.type==='checkbox'?input.checked:input.tagName==='SELECT'?input.value:Number(input.value);root.querySelector('#uf-preset').value='custom';update();}));
  root.querySelector('#uf-preset').addEventListener('change',event=>{if(event.target.value==='custom')return;state={...model.defaults,...presets[event.target.value]};sync();update();});
  root.querySelector('[data-reset]').addEventListener('click',()=>{state={...model.defaults};root.querySelector('#uf-preset').value='baseline';sync();update();});
  const sample = window.PowerFlowCodeExamples.sample('unbalanced', zh);
  runner=window.CoursePythonRunner({root:document.getElementById('unbalanced-code'),snapshot:()=>state,zh,sample,filename:'unbalanced_experiment.py',drawResult:drawProfile,
    acceptResult:r=>r?.ok&&Array.isArray(r.buses)&&r.buses.length===3&&r.buses.every(b=>Array.isArray(b.phases)&&b.phases.length===3&&b.phases.every(p=>Number.isFinite(p.vm_pu)&&p.vm_pu>0&&p.vm_pu<5))});
  document.querySelector('.uf-quiz').addEventListener('submit',event=>{
    event.preventDefault();const checked=event.currentTarget.querySelector('input:checked'),feedback=event.currentTarget.querySelector('[data-quiz-feedback]');
    feedback.textContent=!checked?(zh?'请先选择答案。':'Select an answer first.'):checked.value==='voltage'?(zh?'正确。理想中性线使中性点电压为零，但不平衡的相电流仍通过它返回。':'Correct. An ideal neutral fixes neutral voltage at zero; unequal phase currents still return through it.'):(zh?'再想一想：零阻抗不等于零电流，中性线也没有被断开。':'Try again: zero impedance does not mean zero current, and the neutral is still connected.');
  });
  const lesson=document.querySelector('.unbalanced-lesson');
  lesson.querySelectorAll('[data-math]').forEach(node=>{if(window.katex)window.katex.render(node.dataset.math,node,{displayMode:true,throwOnError:false,strict:'ignore'});else node.textContent=node.dataset.math;});
  update();if(typeof ResizeObserver!=='undefined')new ResizeObserver(drawAll).observe(root);else window.addEventListener('resize',drawAll);
})();
