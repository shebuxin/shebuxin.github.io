(function () {
  "use strict";
  const lab = document.querySelector('[data-ibr-lab]');
  if (!lab) return;
  const zh = lab.dataset.lang === 'zh', find = s => lab.querySelector(s);
  const status = find('[data-lab-status]'), run = find('[data-lab-run]'), stop = find('[data-lab-stop]');
  const controls = [...lab.querySelectorAll('[data-param]')], plot = find('[data-plot]');
  const defaults = {mode:lab.dataset.mode,event:'p',step:lab.dataset.mode==='lcl'?.005:.03,scr:5,mp:.02,inertia:4,bandwidth:2,angle:20,dt:.0005,duration:4};
  let result=null, worker=null, id=0, timer=null, running=false, python=null;
  const source = fetch(lab.dataset.source).then(r=>{if(!r.ok)throw Error('Solver unavailable');return r.text();});
  source.catch(()=>{});
  function snapshot() {const c={...defaults};controls.forEach(el=>c[el.dataset.param]=el.tagName==='SELECT'?el.value:Number(el.value));return c;}
  function stepLabel() {
    const label=find('[data-step-label]'),step=find('[data-param="step"]');
    if(!step)return;
    const f=snapshot().event==='f';
    step.min=f?'-.5':lab.dataset.mode==='lcl'?'-.01':'-.08';step.max=f?'.5':lab.dataset.mode==='lcl'?'.01':'.08';step.step=f?'.05':'.005';
    label.textContent=lab.dataset.mode==='lcl'?(zh?'变流器 d 轴电压阶跃 (pu)':'Converter d-voltage step (pu)'):(zh?'阶跃幅值':'Step size')+(f?' (Hz)':' (pu)');
  }
  function apply(c) {controls.forEach(el=>el.value=c[el.dataset.param]);stepLabel();}
  apply(defaults);
  function stale() {status.textContent=zh?'参数已改变；点击运行以更新曲线。':'Controls changed; run to update the plot.';status.dataset.state='stale';if(python)python.markStale();}
  controls.forEach(el=>el.addEventListener('input',()=>{if(el.dataset.param==='event'){find('[data-param="step"]').value={p:.03,q:.01,v:-.01,f:.1}[el.value];stepLabel();}stale();}));
  const colors=['#17648f','#ce6c21','#438453','#925d9e'];
  const labelMap={p:'P',q:'Q',v:'|V PCC|',frequency:zh?'内部 / PLL 频率':'Internal / PLL frequency',grid_frequency:zh?'电网频率':'Grid frequency',gfl:'GFL · 4',droop:'Droop · 3',vsm:'VSM · 4',parallel:'Parallel · 7',p_gfl:'GFL',p_gfm:'GFM',i2d:'i₂d',vcd:'v_cd',vcq:'v_cq',vd:'v_d',vq:'v_q',va:'v_a',vb:'v_b',vc:'v_c'};
  function valid(r) {return r&&Array.isArray(r.time)&&r.time.length>1&&r.time.length<=5000&&r.time.at(-1)>0&&r.time.every((v,i)=>Number.isFinite(v)&&(!i||v>=r.time[i-1]))&&r.traces&&Object.keys(r.traces).length>0&&Object.values(r.traces).every(a=>Array.isArray(a)&&a.length===r.time.length&&a.every(Number.isFinite));}
  function series(r,selection) {
    const groups={abc:['va','vb','vc'],dq:['vd','vq'],power:['p','q'],lcl:['i2d','vcd','vcq'],compare:['gfl','droop','vsm','parallel'],branch:['p','p_gfl','p_gfm']};
    const keys=groups[selection]||[selection];
    const data=keys.filter(k=>r.traces[k]).map(k=>({key:k,values:r.traces[k]}));
    if(selection==='frequency'&&r.traces.frequency){const c=r.case||snapshot();data.push({key:'grid_frequency',values:r.time.map(t=>50+(t>=1&&c.event==='f'?c.step:0))});}
    return data;
  }
  const ns='http://www.w3.org/2000/svg';
  function element(tag,attrs,text) {const e=document.createElementNS(ns,tag);Object.entries(attrs||{}).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;return e;}
  function fmt(n) {return Math.abs(n)>0&&Math.abs(n)<.00001?n.toExponential(2):Number(n.toPrecision(6)).toString();}
  function draw(svg,r,selection=plot.value) {
    let data=series(r,selection);if(!data.length)data=series(r,r.mode==='frame'?'dq':r.mode==='lcl'?'lcl':r.mode==='compare'?'compare':'p');
    if(!data.length)data=Object.entries(r.traces).slice(0,4).map(([key,values])=>({key,values}));
    svg.replaceChildren();svg.setAttribute('viewBox','0 0 800 320');
    const all=data.flatMap(d=>d.values), lo=Math.min(...all),hi=Math.max(...all),pad=Math.max((hi-lo)*.15,.0005);
    const ymin=lo-pad,ymax=hi+pad,xmax=r.time[r.time.length-1];
    const X=t=>64+t/xmax*712,Y=v=>270-(v-ymin)/(ymax-ymin)*234;
    for(let i=0;i<=4;i++){const y=36+i*234/4,v=ymax-i*(ymax-ymin)/4;svg.append(element('line',{x1:64,x2:776,y1:y,y2:y,stroke:'#dce5eb'}),element('text',{x:56,y:y+4,'text-anchor':'end',class:'ibr-tick'},fmt(v)));}
    for(let i=0;i<=4;i++){const t=i*xmax/4;svg.append(element('text',{x:X(t),y:292,'text-anchor':'middle',class:'ibr-tick'},fmt(t)));}
    svg.append(element('text',{x:420,y:314,'text-anchor':'middle',class:'ibr-axis'},'t (s)'),element('text',{x:64,y:21,class:'ibr-axis'},selection==='frequency'?'Hz':'pu'));
    if(r.mode!=='frame'){
      const events=r.mode==='lcl'?[.01]:r.mode==='switch'?[1,2]:[1];
      events.forEach(t=>{svg.append(element('line',{x1:X(t),x2:X(t),y1:36,y2:270,stroke:'#8296a3','stroke-dasharray':'4 4'}));});
    }
    data.forEach((d,i)=>{const path=d.values.map((v,k)=>(k?'L':'M')+X(r.time[k]).toFixed(2)+','+Y(v).toFixed(2)).join(' ');svg.append(element('path',{d:path,fill:'none',stroke:colors[i%colors.length],'stroke-width':2.4,'stroke-linejoin':'round'}));});
    svg.append(element('title',{},(zh?'动态响应：':'Dynamic response: ')+data.map(d=>labelMap[d.key]||d.key).join(', ')));
    return data;
  }
  function render(r) {
    const data=draw(find('[data-lab-chart]'),r);
    const legend=find('[data-lab-legend]');legend.replaceChildren();
    data.forEach((d,i)=>{const e=document.createElement('span');e.textContent=labelMap[d.key]||d.key;e.style.setProperty('--trace-color',colors[i]);legend.append(e);});
    const c=r.case;find('[data-chart-caption]').textContent=r.mode==='frame'?(zh?'坐标偏差：':'Frame offset: ')+c.angle+'°':(zh?'当前曲线参数：':'Parameters used in this plot: ')+'SCR '+c.scr+', '+c.event+' '+c.step+(c.event==='f'?' Hz':' pu')+', mₚ '+c.mp+', M '+c.inertia+' s';
    const auditName=r.mode==='lcl'?(zh?'能量变化率':'Energy-rate identity'):(zh?'网络残差':'Network residual');
    find('[data-audit-summary]').textContent=(zh?'状态数：':'State count: ')+(r.mode==='compare'?'4 / 3 / 4 / 7':r.state_count)+'. '+(zh?'初始残差：':'Initial residual: ')+fmt(r.initial_residual)+'. '+auditName+': '+fmt(r.network_residual)+(r.reset_error!==null?'. '+(zh?'切换连续性残差：':'Switch continuity residual: ')+fmt(r.reset_error):'');
    find('[data-audit-commands]').textContent=JSON.stringify(r.runs||{state_names:r.state_names,commands:r.final_commands},null,2);
    const table=document.createElement('table'),head=document.createElement('tr');['t (s)',...data.map(d=>labelMap[d.key]||d.key)].forEach(s=>{const th=document.createElement('th');th.textContent=s;head.append(th);});const thead=document.createElement('thead');thead.append(head);table.append(thead);const tbody=document.createElement('tbody');
    const indices=new Set([0,r.time.length-1]);for(let i=1;i<r.time.length;i++)if(r.time[i]===r.time[i-1]){indices.add(i-1);indices.add(i);}for(let i=1;i<=4;i++)indices.add(Math.round((r.time.length-1)*i/5));
    [...indices].sort((a,b)=>a-b).forEach(i=>{const tr=document.createElement('tr');[r.time[i],...data.map(d=>d.values[i])].forEach(v=>{const td=document.createElement('td');td.textContent=fmt(v);tr.append(td);});tbody.append(tr);});table.append(tbody);find('[data-sample-table]').replaceChildren(table);
  }
  plot.addEventListener('change',()=>{if(result)render(result);if(python)python.redraw();});
  function finish() {clearTimeout(timer);running=false;run.disabled=false;stop.disabled=true;}
  function terminate(message) {id++;if(worker)worker.terminate();worker=null;finish();status.textContent=message;}
  async function compute() {
    if(running)return;
    if(!controls.every(c=>c.checkValidity())){controls.find(c=>!c.checkValidity()).reportValidity();return;}
    const c=snapshot(),runId=++id;running=true;run.disabled=true;stop.disabled=false;status.dataset.state='running';status.textContent=zh?'正在计算，首次运行需加载 Python…':'Computing; the first run loads Python…';
    timer=setTimeout(()=>terminate(zh?'运行超时；可重试或检查代码。':'Timed out; retry or inspect the code.'),90000);
    try {
      const text=await source;if(!running||id!==runId)return;
      if(!worker){worker=new Worker(lab.dataset.worker,{type:'module'});worker.onmessage=e=>{
        const d=e.data;if(d.id!==id)return;if(d.type==='loading'){status.textContent=zh?'正在加载 Python 环境…':'Loading the Python environment…';return;}
        finish();if(d.type==='error'){status.dataset.state='error';status.textContent=(zh?'计算失败：':'Computation failed: ')+d.error;return;}
        if(!valid(d.result)){status.dataset.state='error';status.textContent=zh?'结果格式无效。':'Invalid result format.';return;}
        result=d.result;lab.dataset.result=JSON.stringify(result);render(result);status.dataset.state='ready';status.textContent=JSON.stringify(snapshot())===JSON.stringify(result.case)?(zh?'计算完成。':'Computation complete.'):(zh?'计算完成；参数已改变，请重新运行。':'Computed; controls have since changed. Run again.');
      };worker.onerror=e=>{terminate((zh?'Python 加载失败：':'Python failed to load: ')+(e.message||''));status.dataset.state='error';};}
      worker.postMessage({id:runId,source:text,code:'result = solve(case)',parameters:c});
    } catch(e) {terminate((zh?'计算失败：':'Computation failed: ')+e.message);status.dataset.state='error';}
  }
  run.addEventListener('click',compute);stop.addEventListener('click',()=>terminate(zh?'已停止；可以重新运行。':'Stopped; you can run again.'));
  run.disabled=false;
  let baseline=null;
  find('[data-lab-reset]').addEventListener('click',()=>{if(running)terminate('');apply(defaults);if(baseline){result=baseline;lab.dataset.result=JSON.stringify(result);render(result);status.textContent=zh?'已恢复预计算基准。':'Precomputed baseline restored.';status.dataset.state='baseline';}if(python)python.markStale();});
  find('[data-lab-download]').addEventListener('click',()=>{if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ibr-'+result.mode+'-result.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  fetch(lab.dataset.baselines).then(r=>{if(!r.ok)throw Error('Baseline unavailable');return r.json();}).then(data=>{baseline=data[lab.dataset.mode];if(!valid(baseline))throw Error('Invalid baseline');if(!result&&!running){result=baseline;lab.dataset.result=JSON.stringify(result);render(result);status.textContent=zh?'已显示预计算基准。修改参数后点击运行。':'Precomputed baseline shown. Change parameters and run.';status.dataset.state='baseline';}}).catch(e=>{if(!result&&!running)status.textContent=(zh?'基准读取失败；仍可运行仿真。':'Baseline unavailable; you can still run the simulation. ')+e.message;});
  const codeRoot=document.getElementById('ibr-python');
  if(codeRoot&&window.CoursePythonRunner)python=window.CoursePythonRunner({root:codeRoot,snapshot,zh,filename:'ibr-'+lab.dataset.mode+'-experiment.py',sample:'result = solve(case)\nprint("mode:", result["mode"])\nprint("initial residual:", result["initial_residual"])\nprint("network / energy residual:", result["network_residual"])\nprint("switch reset error:", result["reset_error"])\nprint("final samples:", {k: v[-1] for k, v in result["traces"].items()})',acceptResult:valid,drawResult:(svg,r)=>draw(svg,r),invalidLabel:zh?'result 需包含有限数值的 time 与同长度 traces。':'result must contain finite time and matching traces.'});
  document.querySelectorAll('[data-math]').forEach(e=>{if(window.katex)try{window.katex.render(e.dataset.math,e,{displayMode:true,throwOnError:true});}catch(error){e.dataset.mathError=error.message;}});
  const quiz=document.querySelector('[data-quiz]');
  if(quiz)quiz.addEventListener('submit',e=>{e.preventDefault();const selected=quiz.querySelector('input:checked'),feedback=quiz.querySelector('[data-quiz-feedback]');if(!selected){feedback.textContent=zh?'请先选择一个答案。':'Choose an answer first.';return;}const correct=selected.value===quiz.dataset.answer;feedback.textContent=correct?(zh?'正确。展开解释，核对推理。':'Correct. Open the explanation to check your reasoning.'):(zh?'再想一想。展开解释后可以重新作答。':'Try again. You can open the explanation and revise your answer.');feedback.dataset.correct=correct;quiz.querySelector('[data-worked-answer]').hidden=false;});
  window.addEventListener('pagehide',()=>{if(worker)worker.terminate();clearTimeout(timer);});
})();
