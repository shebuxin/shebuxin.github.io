(function(){
  'use strict';
  const model=window.ECE685StageModel,root=document.querySelector('[data-stage-module]');
  if(!model||!root)return;
  const zh=document.documentElement.lang.startsWith('zh'),words=(cn,en)=>zh?cn:en;
  const practiceId=root.dataset.practiceLecture;
  const key='ece685-lecture-practice-v1';
  const known=new Set([...document.querySelectorAll('[data-reviewed-dot]')].map(el=>el.dataset.reviewedDot));
  let passed=[],canSave=true;
  try{const data=JSON.parse(localStorage.getItem(key));if(Array.isArray(data))passed=[...new Set(data.filter(id=>known.has(id)))];}catch(_){canSave=false;}
  function progress(){
    const badge=root.querySelector('[data-stage-module-passed]');
    if(badge)badge.hidden=!passed.includes(practiceId);
  }
  progress();
  window.addEventListener('storage',event=>{if(event.key!==key&&event.key!==null)return;try{const d=JSON.parse(event.newValue);passed=Array.isArray(d)?d.filter(id=>known.has(id)):[];}catch(_){passed=[];}progress();});
  const find=s=>root.querySelector(s),all=s=>[...root.querySelectorAll(s)];
  const config=JSON.parse(find('[data-stage-config]').textContent),kind=root.dataset.stageModule;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,d=3)=>n===null?words('未定义 / 无唯一值','Undefined / no unique value'):(Math.abs(n)<.5*10**-d?0:n).toLocaleString(zh?'zh-CN':'en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  const text=b=>b[zh?'zh':'en'];
  const colors=['#67359b','#087e75','#c26713','#306bb2','#bd4469','#566476'];
  let state={...model.defaults[kind]},result,runner,numericPassed=false,quizPassed=false;
  all('[data-stage-math]').forEach(el=>{if(window.katex)window.katex.render(el.dataset.stageMath,el,{displayMode:true,throwOnError:false});});

  function chart(svg,p){
    const allX=p.curves.flatMap(c=>c.x||p.x),xMin=Math.min(...allX),xMax=Math.max(...allX),flat=p.curves.flatMap(c=>c.values);
    let low=Math.min(0,...flat),high=Math.max(0,...flat);if(high===low)high=low+1;
    const pad=(high-low)*.08;high+=pad;if(low<0)low-=pad;
    const x=v=>62+(v-xMin)/(xMax-xMin||1)*506,y=v=>263-(v-low)/(high-low)*217;
    const number=v=>Math.abs(v)>=1e5?(v/1e3).toFixed(0)+'k':Math.abs(v)>=100?fmt(v,0):fmt(v,2);
    const grid=[0,.25,.5,.75,1].map(a=>{const v=low+a*(high-low),t=xMin+a*(xMax-xMin);return `<path d="M62 ${y(v)}H568" class="stage-grid"/><text x="54" y="${y(v)+4}" text-anchor="end">${esc(number(v))}</text><text x="${x(t)}" y="284" text-anchor="middle">${esc(number(t))}</text>`;}).join('');
    const paths=p.curves.map((c,index)=>{
      const xs=c.x||p.x,step=c.step===undefined?p.step:c.step;
      const d=c.values.map((v,i)=>i===0?`M${x(xs[i])} ${y(v)}`:step?`H${x(xs[i])}V${y(v)}`:`L${x(xs[i])} ${y(v)}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${c.color||colors[index%colors.length]}" stroke-width="2.6" ${c.dash?'stroke-dasharray="7 4"':''}/>`;
    }).join('');
    svg.setAttribute('viewBox','0 0 600 320');
    svg.innerHTML=`<title>${esc(p.y_unit)} ${words('随','versus')} ${esc(p.x_unit)}</title><g class="stage-svg-text">${grid}<text x="62" y="24">${esc(p.y_unit)}</text><text x="568" y="310" text-anchor="end">${esc(p.x_unit)}</text></g><path d="M62 46V263H568" class="stage-axis"/>${paths}`;
  }
  function legend(el,p){el.textContent=p.curves.map((c,i)=>`${i+1}. ${c.name}`).join(' · ');}
  function box(x,y,width,height,title,lines){return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="9" fill="#f7f2fc" stroke="#d7c9e4"/><text x="${x+12}" y="${y+24}" class="stage-svg-title">${esc(title)}</text>${lines.map((line,i)=>`<text x="${x+12}" y="${y+48+i*22}" class="stage-svg-text">${esc(line)}</text>`).join('')}`;}
  function diagram(svg,r){
    const m=r.metrics,p=r.parameters;let body='';
    const label=(x,y,s)=>`<text x="${x}" y="${y}" text-anchor="middle" class="stage-svg-text">${esc(s)}</text>`;
    const connector='<path d="M180 100H220 M380 100H420" stroke="#9581aa" stroke-width="2" marker-end="url(#stage-arrow)"/>';
    if(kind==='overview'){
      body=`<path d="M65 92H540 M300 72V112 M490 72V112 M490 92V175" class="stage-axis"/><circle cx="65" cy="92" r="23" fill="#fff" stroke="#67359b" stroke-width="2"/><path d="M50 92q8-20 15 0t15 0" fill="none" stroke="#67359b" stroke-width="2"/><circle cx="167" cy="92" r="18" fill="#fff" stroke="#67359b" stroke-width="2"/><circle cx="186" cy="92" r="18" fill="#fff" stroke="#67359b" stroke-width="2"/><path d="M528 74l18 18-18 18 M479 175h22 M479 183h22" stroke="#087e75" fill="none" stroke-width="3"/>`+label(65,40,words('发电机','Generator'))+label(180,40,words('变压器','Transformer'))+label(345,40,words('输电线路','Transmission'))+label(540,40,words('负荷','Load'))+label(65,140,fmt(m.generator_mw)+' MW')+label(65,164,fmt(m.generator_mvar)+' Mvar')+label(345,140,fmt(p.transmission_kv,0)+' kV')+label(345,164,fmt(m.transmission_current_a)+' A')+label(490,216,'Qc = '+fmt(p.shunt_mvar)+' Mvar')+label(540,140,fmt(p.load_mw)+' MW');
    }else if(kind==='generation'){
      body=box(20,25,180,175,words('日负荷 / 备用','Daily load / reserve'),[fmt(m.energy_mwh,0)+' MWh',fmt(m.daily_peak_mw,0)+' MW peak',fmt(m.capacity_gap_mw)+' MW gap'])+
        box(220,25,160,175,words('年度净负荷组合','Annual net-load mix'),['CC: '+m.cc_units+' × 543 MW','GT: '+m.gt_units_load+' × 211 MW','PRM: +'+m.extra_gt_prm+' GT'])+
        box(400,25,180,175,words('容量信用核查','Capacity credit check'),[fmt(m.mix_accredited_mw,0)+' MW',words('目标 ','Target ')+fmt(m.annual_target_mw,0)+' MW',words('按可信容量核对','Use accredited capacity')]);
    }else if(kind==='single-phase'){
      const scale=Math.min(210/(Math.abs(m.p_w)||1),85/(Math.abs(m.q_var)||1)),x=75+m.p_w*scale,y=130-m.q_var*scale;
      body=`<path d="M40 130H345 M75 15V235" class="stage-axis"/><path d="M75 130H${x}V${y}" fill="none" stroke="#c26713" stroke-width="3"/><path d="M75 130L${x} ${y}" stroke="#67359b" stroke-width="3"/>`+label(185,160,'P = '+fmt(m.p_w)+' W')+label(190,22,'Q = '+fmt(m.q_var)+' var')+label(250,202,'|S| = '+fmt(m.s_va)+' VA')+
        box(375,40,205,160,words('并联补偿','Shunt correction'),['Qc = '+fmt(m.capacitor_var)+' var','C = '+fmt(m.capacitance_uf)+' μF','Inew = '+fmt(m.current_after_a)+' A']);
    }else if(kind==='three-phase'){
      const bound=r.phasors.Va.rms,scale=87/(bound||1),vector=(z,color,name)=>`<path d="M165 125L${165+z.re*scale} ${125-z.im*scale}" stroke="${color}" stroke-width="3" marker-end="url(#stage-arrow)"/>`+label(165+z.re*scale*1.17,125-z.im*scale*1.17,name);
      body='<path d="M35 125H305 M165 15V235" class="stage-axis"/>'+vector(r.phasors.Va,colors[0],'Va')+vector(r.phasors.Vb,colors[1],'Vb')+vector(r.phasors.Vc,colors[2],'Vc')+
        box(340,25,240,180,p.connection==='wye'?'Y':'Δ',['Vbranch = '+fmt(m.branch_voltage)+' V','Ibranch = '+fmt(m.branch_current_a)+' A','Iline = '+fmt(m.line_current_a)+' A','VAB: '+fmt(r.phasors.Vab.angle_deg)+'°']);
    }else if(kind==='transformers'){
      body=box(20,20,175,180,'H: '+(p.h_connection==='wye'?'Y':'Δ'),['VLL = '+fmt(p.h_kv)+' kV','Vw = '+fmt(m.h_winding_kv)+' kV','IL = '+fmt(m.h_line_a)+' A'])+
        box(215,55,165,120,'a = '+fmt(p.turns_ratio),[words('绕组比','Winding ratio'),words('线比 ','Line ratio ')+fmt(m.line_ratio)])+
        box(400,20,180,180,'L: '+(p.l_connection==='wye'?'Y':'Δ'),['VLL = '+fmt(m.l_line_kv)+' kV','Vw = '+fmt(m.l_winding_kv)+' kV','IL = '+fmt(m.l_line_a)+' A'])+connector+label(300,232,words('相移方向需要端子与同名端约定','Phase displacement requires terminal/dot conventions'));
    }else if(kind==='transformer-banks'){
      const theta=m.delta_lh_deg*Math.PI/180;
      body='<path d="M35 125H305 M165 20V230" class="stage-axis"/>'+`<path d="M165 125H250 M165 125L${165+85*Math.cos(theta)} ${125-85*Math.sin(theta)}" fill="none" stroke="#67359b" stroke-width="3" marker-end="url(#stage-arrow)"/>`+
        label(225,75,'VAB,H: 0°')+label(165,222,'Vab,L: '+fmt(m.delta_lh_deg,0)+'°')+
        box(330,20,255,180,(p.h_connection==='wye'?'Y':'Δ')+' – '+(p.l_connection==='wye'?'Y':'Δ'),['a = '+fmt(p.turns_ratio),'kLL = '+fmt(m.line_ratio),'LV line = '+fmt(m.l_line_kv)+' kV','LV coil = '+fmt(m.l_winding_kv)+' kV']);
    }else if(kind==='transformer-network'){
      body=box(15,25,180,175,words('高压端口','HV terminal'),['vH = 1∠0° pu','Zpu = '+fmt(m.z_pu_re)+' + j'+fmt(m.z_pu_im),'IH = '+fmt(m.h_line_a)+' A'])+
        box(215,45,165,145,'tHL = τ exp(j30°)',['τ = '+fmt(p.tap),'a = '+fmt(m.winding_ratio),words('固定电压基准','Fixed voltage bases')])+
        box(400,25,185,175,words('低压端口','LV terminal'),[fmt(m.l_line_kv)+' kV',fmt(m.l_angle_deg)+'°','IL = '+fmt(m.l_line_a)+' A'])+connector;
    }else if(kind==='per-unit'){
      body=box(15,25,180,175,words('高压基准','HV bases'),[fmt(p.v_base_h_kv)+' kV',fmt(m.z_base_h_ohm)+' Ω','Zref = '+fmt(m.referred_z_re_ohm)+' Ω'])+
        box(215,45,165,145,'Sb = '+fmt(p.s_base_mva,0)+' MVA',['a = '+fmt(p.turns_ratio),'Re(Zpu) = '+fmt(m.z_pu_re,5),'Im(Zpu) = '+fmt(m.z_pu_im,5)])+
        box(400,25,185,175,words('低压基准与还原','LV bases / recovery'),[fmt(m.v_base_l_kv)+' kV',fmt(m.z_base_l_ohm,4)+' Ω','Zreal = '+fmt(m.recovered_z_re_ohm)+' Ω'])+connector;
    }
    svg.setAttribute('viewBox','0 0 600 250');svg.innerHTML=`<title>${esc(text(config.title))}</title><defs><marker id="stage-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#67359b"/></marker></defs>${body}`;
  }
  function render(){
    all('[data-stage-param]').forEach(input=>{if(document.activeElement!==input)input.value=state[input.dataset.stageParam];});
    all('[data-stage-value]').forEach(el=>{const c=config.controls.find(c=>c.key===el.dataset.stageValue);el.textContent=fmt(state[c.key],c.step<1?(String(c.step).split('.')[1]||'').length:0)+' '+c.unit;});
    try{
      result=model.solve(kind,state);find('.stage-live-results').hidden=false;find('[data-stage-status]').dataset.state='ready';
      find('[data-stage-status]').textContent=words('当前输入已计算。先解释变化，再展开中间量核查。','Calculated. Explain the change, then inspect intermediate values and checks.');
      config.metrics.forEach(m=>{find(`[data-stage-metric="${m.key}"]`).textContent=fmt(result.metrics[m.key],m.digits)+(result.metrics[m.key]===null?'':' '+m.unit);});
      diagram(find('[data-stage-diagram]'),result);
      all('[data-stage-plot]').forEach(svg=>{const i=Number(svg.dataset.stagePlot),p=result.plots[i];svg.closest('figure').hidden=!p;if(p){chart(svg,p);legend(find(`[data-stage-legend="${i}"]`),p);}});
      const rows=Object.entries(result.metrics).map(([name,value])=>`${name} = ${value===null?'undefined':Number(value).toPrecision(9)}`);
      if(result.phasors)Object.entries(result.phasors).forEach(([name,z])=>rows.push(`${name} = ${fmt(z.re)} + j(${fmt(z.im)}) ; |·| = ${fmt(z.rms)} ; angle = ${fmt(z.angle_deg)}°`));
      rows.push('\n'+words('数值核查','Numerical checks'));
      Object.entries(result.checks).forEach(([name,value])=>rows.push(`${name} = ${Number(value).toExponential(3)}`));
      if(result.annual)rows.push('\n'+words('L04 年曲线边界 h','L04 annual curve boundaries h')+': '+result.annual.hours.join(', '),'net load MW: '+result.annual.net_load.join(', '));
      find('[data-stage-checks]').textContent=rows.join('\n');
      if(runner){runner.markStale();runner.redraw();}
    }catch(error){result=null;find('.stage-live-results').hidden=true;find('[data-stage-status]').dataset.state='error';find('[data-stage-status]').textContent=words('输入尚不相容，请核对读数：','Inconsistent inputs; check the readings: ')+error.message;if(runner){runner.markStale();runner.redraw();}}
  }
  all('[data-stage-param]').forEach(input=>input.addEventListener('input',()=>{
    if(input.value===''){state[input.dataset.stageParam]=null;result=null;find('[data-stage-status]').textContent=words('请输入完整数值。','Enter a complete number.');find('.stage-live-results').hidden=true;if(runner){runner.markStale();runner.redraw();}return;}
    state[input.dataset.stageParam]=input.tagName==='SELECT'?input.value:Number(input.value);render();
  }));
  find('[data-stage-reset]').addEventListener('click',()=>{state={...model.defaults[kind]};all('[data-stage-param]').forEach(input=>{input.value=state[input.dataset.stageParam];});render();});
  render();

  function validResult(r){
    if(!r||r.module!==kind||!r.metrics||!r.parameters||!Array.isArray(r.plots)||!r.plots.length)return false;
    if(!config.metrics.every(m=>r.metrics[m.key]===null||Number.isFinite(r.metrics[m.key])))return false;
    return r.plots.every(p=>Array.isArray(p.x)&&p.x.length>=2&&p.x.length<=10000&&p.x.every((v,i)=>Number.isFinite(v)&&(i===0||v>p.x[i-1]))&&
      Array.isArray(p.curves)&&p.curves.length>0&&p.curves.length<=8&&p.curves.every(c=>Array.isArray(c.values)&&c.values.length===p.x.length&&c.values.every(Number.isFinite))&&typeof p.x_unit==='string'&&typeof p.y_unit==='string');
  }
  const baseline=`# ${practiceId} companion model: ${kind}. case contains a fresh control snapshot.\n# Edit an input before solve(case), then inspect the checks.\nresult = solve(case)\nimport json\nprint(json.dumps(result["metrics"], indent=2, ensure_ascii=False))\nprint("Numerical checks:", result["checks"])`;
  const scan=`# Vary one parameter; retain the original control case.\nscan_case = dict(case)\nfor value in ${JSON.stringify(config.code_values)}:\n    scan_case["${config.code_key}"] = value\n    result = solve(scan_case)\n    print("${config.code_key} =", value)\n    print(result["metrics"])\n    print("Checks:", result["checks"])\n# The figure shows the last scanned case, alongside current controls.`;
  if(window.CoursePythonRunner){
    const codeRoot=find('#stage-python'),summary=find('[data-stage-code-summary]');
    runner=window.CoursePythonRunner({root:codeRoot,snapshot:()=>({module:kind,...state}),sample:baseline,zh,filename:'ece685_'+kind+'_experiment.py',acceptResult:validResult,
      invalidLabel:words('没有当前模块的可绘制结果。请检查 result = solve(case) 与图形数组。','No plottable result for this module. Check result = solve(case) and the plot arrays.'),
      drawResult(svg,r){
        const py=r.plots[0],ref=result&&result.plots[0],compatible=ref&&py.x_unit===ref.x_unit&&py.y_unit===ref.y_unit;
        // Keep each original time grid; do not extrapolate a shorter Python run.
        const curves=py.curves.map((c,i)=>({...c,x:py.x,step:py.step,color:colors[i],name:'Python: '+c.name}));
        if(compatible)ref.curves.forEach((c,i)=>curves.push({...c,x:ref.x,step:ref.step,color:colors[i],dash:true,name:'reference: '+c.name}));
        const combined={x:py.x,x_unit:py.x_unit,y_unit:py.y_unit,curves};
        chart(svg,combined);summary.hidden=false;
        const differences=Object.keys(model.defaults[kind]).filter(k=>r.parameters[k]!==state[k]).map(k=>k+'='+r.parameters[k]);
        summary.textContent=words('实线：上次 Python；同色虚线：当前参考。','Solid: last Python run; same-color dashed: current reference.')+' '+
          (!compatible?(ref?words('单位不同，图中只绘制 Python 结果。','Units differ; this plot shows only Python. '):words('当前输入未产生有效参考，图中只绘制 Python 结果。','Current inputs have no valid reference; this plot shows only Python. ')):'')+
          config.metrics.slice(0,3).map(m=>text(m.label)+' = '+fmt(r.metrics[m.key],m.digits)+' '+m.unit).join(' · ')+' '+
          words('输入差异：','Input differences: ')+(differences.length?differences.join(', '):words('无','none'));
      }});
    new MutationObserver(()=>{summary.hidden=codeRoot.querySelector('.bf-code-result').hidden;}).observe(codeRoot.querySelector('.bf-code-result'),{attributes:true,attributeFilter:['hidden']});
    function edited(){const status=codeRoot.querySelector('[data-code-status]');if(status.dataset.state!=='running'){status.dataset.state='edited';status.textContent=words('代码已改变；再次运行以更新结果。','Code changed; run again to update the result.');}}
    all('[data-stage-code-example]').forEach(button=>button.addEventListener('click',()=>{codeRoot.querySelector('[data-experiment-editor]').value=button.dataset.stageCodeExample==='scan'?scan:baseline;edited();}));
    ['[data-experiment-editor]','[data-solver-editor]'].forEach(s=>codeRoot.querySelector(s).addEventListener('input',edited));
    ['[data-code-reset]','[data-solver-reset]'].forEach(s=>codeRoot.querySelector(s).addEventListener('click',edited));
  }
  function completion(){
    if(!numericPassed||!quizPassed)return;
    if(!passed.includes(practiceId)){passed.push(practiceId);try{localStorage.setItem(key,JSON.stringify(passed));}catch(_){canSave=false;}}
    progress();find('[data-stage-completion]').textContent=words('数值与理解检查均已通过。继续解释模型假设与代码改动，再进入下一讲。','Numerical and understanding checks passed. Explain the assumptions and code edit, then continue to the next lecture.')+
      (!canSave?words(' 当前浏览器无法保存记录。',' This browser cannot save the record.'):'');
  }
  function feedback(form,message,correct){const el=form.querySelector('[data-stage-feedback]');el.textContent=message;el.dataset.correct=String(correct);}
  const expected=model.solve(kind).metrics;
  find('[data-stage-practice]').addEventListener('submit',event=>{
    event.preventDefault();const form=event.currentTarget,data=new FormData(form);let count=0;
    config.practice.forEach(item=>{const raw=data.get(item.key),value=Number(raw),ok=raw!==null&&raw.trim()!==''&&Number.isFinite(value)&&Math.abs(value-expected[item.key])<=item.tolerance+1e-12;if(ok)count++;
      form.querySelector(`[name="${item.key}"]`).setAttribute('aria-invalid',String(!ok));
      find(`[data-stage-answer-feedback="${item.key}"]`).textContent=ok?words('正确','Correct'):text(item.hint);});
    numericPassed=count===config.practice.length;feedback(form,`${count} / ${config.practice.length} `+words('正确。','correct. ')+(numericPassed?words('再完成理解检查。','Complete the understanding check.'):words('按提示修正；分步解答已解锁。','Revise using the hints; worked steps are available.')),numericPassed);
    find('[data-stage-solution]').hidden=false;completion();
  });
  find('[data-stage-quiz]').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget,value=new FormData(form).get('stage-quiz');quizPassed=value===config.quiz.correct;feedback(form,text(config.quiz.feedback[Number(value)]),quizPassed);completion();});
})();
