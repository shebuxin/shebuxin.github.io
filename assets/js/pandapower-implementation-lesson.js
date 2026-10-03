/* UI only: every computed operating point comes from real pandapower in Python. */
(function () {
  "use strict";
  const root=document.getElementById('pandapower-lab');if(!root)return;
  const zh=root.dataset.lang==='zh',ns='http://www.w3.org/2000/svg';
  const defaults={mode:'balanced',algorithm:'nr',load_scale:1,p2_kw:120,p3_a_kw:90,p3_b_kw:55,p3_c_kw:35,pf:.95,dg_kw:50,dg_phase:'balanced',vm_pu:1,z_scale:1,zero_ratio:3,limit_a:600,tie:false,trip12:false,trip23:false,trip13:false};
  const presets={baseline:{},unbalanced:{mode:'three_phase'},equal:{mode:'three_phase',p3_a_kw:60,p3_b_kw:60,p3_c_kw:60},solar:{mode:'three_phase',dg_phase:'a'},meshed:{tie:true}};
  const colors=['#ae4934','#24755e','#416eb4'];
  const labels=zh?{bus:'节点',line:'线路',open:'断开',none:'无',yes:'是',no:'否',start:'启动 pandapower 实验',run:'重新计算',running:'正在运行真实 pandapower…',idle:'参数已就绪，点击启动以计算。',stopped:'运行环境已停止；点击启动可重新加载。',timeout:'运行超时，环境已停止。可重试或下载 Notebook 在本地运行。',error:'运行失败，请查看错误详情。',safe:'已收敛，所有节点供电并满足当前教学限值。',warning:'已收敛，存在：',voltage:'电压越限',current:'线路电流越限',unbalance:'VUF 越限',unsupplied:'未供电节点',fail:'迭代未收敛；这不能证明系统不存在物理解。',island:'所有负荷节点都与电源断开；未运行空负荷三相求解。',ready:'pandapower 已就绪。',copied:'已放入下方编辑器；点击运行 Python 以执行。',profile:'电压 (pu)',loading:'电流负载率 (%)'}:
    {bus:'Bus',line:'Line',open:'Open',none:'None',yes:'Yes',no:'No',start:'Start pandapower lab',run:'Recalculate',running:'Running real pandapower…',idle:'Parameters are ready. Start the lab to calculate.',stopped:'Runtime stopped. Start again to reload it.',timeout:'Runtime timed out and stopped. Retry or download the notebook to run locally.',error:'Run failed; see error details.',safe:'Converged; all buses supplied and within the teaching limits.',warning:'Converged with: ',voltage:'voltage violations',current:'line overcurrent',unbalance:'VUF violations',unsupplied:'unsupplied buses',fail:'The iteration did not converge; this does not prove physical infeasibility.',island:'All load buses are disconnected from the source; the empty three-phase solve was skipped.',ready:'pandapower is ready.',copied:'Copied into the editor below. Press Run Python to execute.',profile:'Voltage (pu)',loading:'Current loading (%)'};
  const loadingLabel=stage=>(zh?{python:'正在下载并初始化 Python…',scientific:'正在加载 NumPy、SciPy、pandas 等科学计算库…',pandapower:'正在安装 pandapower 3.2.1…'}:{python:'Downloading and initializing Python…',scientific:'Loading NumPy, SciPy, pandas, and scientific packages…',pandapower:'Installing pandapower 3.2.1…'})[stage]||labels.running;
  const find=s=>root.querySelector(s),status=find('[data-status]');
  let state={...defaults},result=null,worker=null,id=0,busy=false,enabled=false,debounce,timer,desired=null,runner;
  const source=fetch(root.dataset.source).then(r=>{if(!r.ok)throw new Error('Model source unavailable');return r.text();});
  source.catch(e=>{status.textContent=labels.error;find('[data-lab-console]').textContent=e.message;});
  const f=(n,d=3)=>Number.isFinite(n)?(Math.abs(n)<1e-8?0:n).toFixed(d):'—';
  const table=(selector,rows)=>{const body=find(selector);body.replaceChildren();rows.forEach(values=>{const tr=document.createElement('tr');values.forEach(v=>{const td=document.createElement('td');td.textContent=String(v);tr.appendChild(td);});body.appendChild(tr);});};
  function el(svg,tag,attrs={}){const node=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));svg.appendChild(node);return node;}
  function text(svg,x,y,value,anchor='middle',color){const n=el(svg,'text',{x,y,'text-anchor':anchor});n.textContent=String(value);if(color)n.style.fill=color;return n;}
  function canvas(svg,w,h,title){svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.replaceChildren();el(svg,'title').textContent=title;}
  function drawNetwork(){
    const svg=find('.pp-network'),w=svg.getBoundingClientRect().width||700;
    canvas(svg,w,290,zh?'馈线参数与计算结果':'Feeder parameters and calculated results');
    const coords=[[w*.14,95],[w*.5,95],[w*.86,95]],active=[!state.trip12,!state.trip23,state.tie&&!state.trip13];
    [[0,1],[1,2],[0,2]].forEach(([a,b],k)=>{
      const line=result?.ok?result.lines[k]:null,color=!active[k]?'#bcc8d1':line?.loading_pct>100?'#af2831':'#27785f';
      if(k===2)el(svg,'path',{d:`M${coords[0][0]} 121 Q${w*.5} 340 ${coords[2][0]} 121`,fill:'none',stroke:color,'stroke-width':3,'stroke-dasharray':active[k]?'none':'5 5'});
      else el(svg,'line',{x1:coords[a][0]+28,y1:95,x2:coords[b][0]-28,y2:95,stroke:color,'stroke-width':3,'stroke-dasharray':active[k]?'none':'5 5'});
      const x=k===2?w*.5:(coords[a][0]+coords[b][0])/2,y=k===2?252:40;
      text(svg,x,y,labels.line+' '+(a+1)+'–'+(b+1));
      const solved=active[k]&&line&&Number.isFinite(line.p_from_kw);
      text(svg,x,y+20,!active[k]?labels.open:solved?f(line.p_from_kw,1)+' kW'+(w>=550?' · '+f(line.loading_pct,1)+'%':''):'—');
      if(solved&&w<550&&k!==2)text(svg,x,y+36,f(line.loading_pct,1)+'%');
      if(solved&&Math.abs(line.p_from_kw)>1e-6){const cy=k===2?230:95,d=10*Math.sign(line.p_from_kw);el(svg,'polygon',{points:`${x+d},${cy} ${x-d/2},${cy-5} ${x-d/2},${cy+5}`,fill:'#fff',stroke:color,'stroke-width':1.5});}
    });
    coords.forEach(([x,y],i)=>{
      const b=result?.ok?result.buses[i]:null;
      el(svg,'circle',{cx:x,cy:y,r:26,fill:i===0?'#dbe8fa':b&&!b.supplied?'#ffefeb':'#fff',stroke:'#aebdca','stroke-width':1.5});text(svg,x,y+4,i+1);
      text(svg,x,145,i===0?'400 V LL':f((i===1?state.p2_kw:state.p3_a_kw+state.p3_b_kw+state.p3_c_kw)*state.load_scale,0)+' kW');
      if(b){b.vm_pu.forEach((v,p)=>text(svg,x,167+p*18,(b.vm_pu.length>1?'ABC'[p]+' ':'')+f(v,4)+' pu','middle',colors[p]));}
      else text(svg,x,171,'—');
      if(i===2)text(svg,x,229,'PV '+f(state.dg_kw,0)+' kW');
    });
  }
  function drawProfile(svg,r){
    canvas(svg,430,260,labels.profile);
    if(!r?.ok||!Array.isArray(r.buses)){text(svg,215,125,'—');return;}
    const values=r.buses.flatMap(b=>b.vm_pu).filter(Number.isFinite);
    const lo=Math.min(.93,...values)-.012,hi=Math.max(1.06,...values)+.012,y=v=>205-(v-lo)/(hi-lo)*150;
    el(svg,'rect',{x:48,y:y(1.05),width:352,height:y(.95)-y(1.05),fill:'#eaf4ef'});
    for(let k=0;k<=4;k++){const v=lo+(hi-lo)*k/4;el(svg,'line',{x1:48,x2:400,y1:y(v),y2:y(v),stroke:'#e2e8ed'});text(svg,40,y(v)+4,f(v,3),'end');}
    const x=i=>r.buses.length<2?225:65+i*310/(r.buses.length-1);
    r.buses.forEach((b,i)=>text(svg,x(i),229,String(b.id+1)));
    text(svg,228,252,labels.bus);text(svg,50,20,labels.profile,'start');
    [.95,1.05].forEach(v=>el(svg,'line',{x1:48,x2:400,y1:y(v),y2:y(v),stroke:'#758575','stroke-dasharray':'4 4'}));
    const count=r.mode==='three_phase'?3:1;
    for(let p=0;p<count;p++){
      let segment=[];const flush=()=>{if(segment.length)el(svg,'polyline',{points:segment.join(' '),stroke:colors[p],fill:'none','stroke-width':2,'stroke-dasharray':['none','5 2','2 2'][p]});segment=[];};
      r.buses.forEach((b,i)=>{const v=b.vm_pu[p];if(!Number.isFinite(v)){flush();return;}segment.push(`${x(i)},${y(v)}`);el(svg,'circle',{cx:x(i),cy:y(v),r:3.4,fill:colors[p]});});flush();
      text(svg,300+p*35,20,count===1?'V':'ABC'[p],'middle',colors[p]);
    }
  }
  function drawLoading(){
    const svg=find('.pp-loading');canvas(svg,430,260,labels.loading);
    if(!result?.ok){text(svg,215,125,'—');return;}
    const max=Math.max(120,result.max_loading*1.1),x=v=>95+v/max*290;
    result.lines.forEach((line,i)=>{const y=60+i*55;el(svg,'rect',{x:95,y:y-10,width:290,height:18,fill:'#eef2f5'});el(svg,'rect',{x:95,y:y-10,width:Math.max(0,x(line.loading_pct||0)-95),height:18,fill:line.loading_pct>100?'#af2831':'#27785f'});text(svg,85,y+3,line.name.replace('Line ',''),'end');text(svg,95,y+25,f(line.loading_pct,1)+'%','start');});
    el(svg,'line',{x1:x(100),x2:x(100),y1:35,y2:205,stroke:'#b76819','stroke-dasharray':'4 3'});text(svg,x(100),22,'100%');text(svg,235,251,labels.loading);
  }
  function render(){
    const metric=(k,v)=>find('[data-metric="'+k+'"]').textContent=v;
    metric('min',result?.ok?f(result.min_voltage,4)+' pu':'—');metric('loss',result?.ok?f(result.loss_kw,3)+' kW':'—');metric('slack',result?.ok?f(result.slack_kw,3)+' kW':'—');metric('loading',result?.ok?f(result.max_loading,1)+'%':'—');metric('vuf',result?.ok&&result.mode==='three_phase'?f(result.max_vuf,3)+'%':'—');metric('island',result?.unsupplied?.length?result.unsupplied.map(i=>i+1).join(', '):result?.ok?labels.none:'—');
    table('[data-buses]',result?.ok?result.buses.map(b=>[b.id+1,f(b.vm_pu[0],5),f(b.vm_pu[1],5),f(b.vm_pu[2],5),result.mode==='three_phase'?f(b.vuf_pct,3):'—',b.supplied?labels.yes:labels.no]):[]);
    table('[data-lines]',result?.ok?result.lines.map(l=>[l.name.replace('Line ',''),f(l.p_from_kw,3),f(l.loss_kw,4),...Array.from({length:3},(_,i)=>f(l.current_a[i],2)),f(l.loading_pct,2)]):[]);
    find('[data-balance]').textContent=result?.ok?(zh?'供电部分功率平衡残差：':'Power-balance residual for the supplied network: ')+result.balance_error_kw.toExponential(2)+' kW. '+(zh?'限值：电压 0.95–1.05 pu、电流负载率 100%、三相 VUF 2%，仅用于教学。':'Teaching limits: 0.95–1.05 pu voltage, 100% current loading, and 2% three-phase VUF.') : '';
    drawNetwork();drawProfile(find('.pp-profile'),result);drawLoading();
  }
  function generatedCode(){
    const c=state,num=v=>Number(v.toFixed(10)),three=c.mode==='three_phase',q=Math.tan(Math.acos(c.pf));
    const code=['import json','import pandapower as pp',`case = json.loads(${JSON.stringify(JSON.stringify(c))})`,'net = pp.create_empty_network(sn_mva=1.0, f_hz=60)',
      'b1, b2, b3 = [pp.create_bus(net, vn_kv=0.4, name=f"Bus {i+1}") for i in range(3)]',`pp.create_ext_grid(net, b1, vm_pu=${c.vm_pu}, s_sc_max_mva=1000, s_sc_min_mva=1000, rx_max=0.1, rx_min=0.1, r0x0_max=0.1, x0x_max=1.0)`];
    [[1,2,.012,.008,!c.trip12],[2,3,.008,.006,!c.trip23],[1,3,.022,.014,c.tie&&!c.trip13]].forEach(([a,b,r,x,active])=>code.push(`pp.create_line_from_parameters(net, b${a}, b${b}, length_km=1,\n    r_ohm_per_km=${num(r*c.z_scale)}, x_ohm_per_km=${num(x*c.z_scale)},\n    c_nf_per_km=0, max_i_ka=${c.limit_a/1000}, name="Line ${a}-${b}",\n    r0_ohm_per_km=${num(r*c.z_scale*c.zero_ratio)}, x0_ohm_per_km=${num(x*c.z_scale*c.zero_ratio)},\n    c0_nf_per_km=0, in_service=${active?'True':'False'})`));
    const phases=[c.p3_a_kw,c.p3_b_kw,c.p3_c_kw];
    if(!three){
      [c.p2_kw,phases.reduce((a,b)=>a+b,0)].forEach((kw,i)=>code.push(`pp.create_load(net, b${i+2}, p_mw=${num(kw*c.load_scale/1000)}, q_mvar=${num(kw*c.load_scale*q/1000)})`));
      code.push(`pp.create_sgen(net, b3, p_mw=${c.dg_kw/1000}, q_mvar=0)`,`pp.runpp(net, algorithm="${c.algorithm}", numba=False, init="flat",\n    calculate_voltage_angles=True, voltage_depend_loads=False,\n    max_iteration=100, tolerance_mva=1e-9, check_connectivity=True)`,'print(net.res_bus)','print(net.res_line)');
    }else{
      [[c.p2_kw/3,c.p2_kw/3,c.p2_kw/3],phases].forEach((powers,i)=>code.push(`pp.create_asymmetric_load(net, b${i+2}, type="wye",\n    ${powers.map((kw,p)=>`p_${'abc'[p]}_mw=${num(kw*c.load_scale/1000)}, q_${'abc'[p]}_mvar=${num(kw*c.load_scale*q/1000)}`).join(',\n    ')})`));
      code.push(`pp.create_asymmetric_sgen(net, b3, type="wye",\n    ${Array.from('abc',p=>`p_${p}_mw=${num(c.dg_kw/1000*(c.dg_phase==='balanced'?1/3:c.dg_phase===p?1:0))}`).join(', ')})`,'pp.runpp_3ph(net, numba=False, init="flat", max_iteration=100,\n    tolerance_mva=1e-9, check_connectivity=True)','print(net.res_bus_3ph)','print(net.res_line_3ph)');
    }
    code.push('result = collect_results(net, case)');return code.join('\n')+'\n';
  }
  function sync(){
    root.querySelectorAll('[data-key]').forEach(input=>{const k=input.dataset.key;if(input.type==='checkbox')input.checked=state[k];else input.value=state[k];
      if(input.type==='range'){const digits=['pf','vm_pu','load_scale','z_scale','zero_ratio'].includes(k)?(k==='vm_pu'?3:2):0,value=f(state[k],digits)+' '+input.dataset.unit;find('[data-value="'+k+'"]').textContent=value.trim();input.setAttribute('aria-valuetext',value.trim());}
    });
    find('[data-key="algorithm"]').disabled=state.mode==='three_phase';find('[data-key="dg_phase"]').disabled=state.mode==='balanced';find('[data-key="zero_ratio"]').disabled=state.mode==='balanced';
    find('[data-model-note]').textContent=state.mode==='balanced'?(zh?'平衡模型把节点 3 的 A/B/C 负荷相加，作为三相总功率；相间分配、光伏接入相和零序阻抗不参与求解。':'The balanced model sums bus 3 A/B/C demands into a three-phase total. Phase allocation, PV connection phase, and zero-sequence impedance do not enter the solve.'):(zh?'三相模型逐相输入功率，使用序阻抗与大地回路；不计算上一章的独立有限阻抗中性线。节点 2 的总负荷仍三相均分。':'The three-phase model uses phase powers, sequence impedances, and earth return. It does not compute the preceding chapter’s separate finite-impedance neutral. Bus 2 demand stays equally divided.');
    find('[data-generated]').textContent=generatedCode();
  }
  function stop(message){enabled=false;busy=false;desired=null;id++;clearTimeout(timer);clearTimeout(debounce);if(worker)worker.terminate();worker=null;result=null;delete root.dataset.result;find('[data-start]').disabled=false;find('[data-start]').textContent=labels.start;find('[data-stop]').disabled=true;status.textContent=message;status.dataset.state='idle';render();}
  function finish(data,caseUsed){
    busy=false;clearTimeout(timer);find('[data-start]').disabled=false;
    if(!enabled)return;
    if(JSON.stringify(caseUsed)!==JSON.stringify(desired)){dispatch();return;}
    find('[data-lab-console]').textContent=(data.output||'')+(data.error||'');
    if(data.type==='error'){result=null;status.textContent=labels.error;status.dataset.state='warning';render();return;}
    result=data.result;root.dataset.result=JSON.stringify(result);status.dataset.state=result?.ok&&!result.violations.length?'safe':'warning';
    status.textContent=result?.ok?(result.violations.length?labels.warning+result.violations.map(k=>labels[k]).join('; '):labels.safe):result?.reason==='island'?labels.island:labels.fail;render();
  }
  async function dispatch(){
    if(!enabled||busy)return;busy=true;find('[data-start]').disabled=true;status.dataset.state='loading';status.textContent=worker?labels.running:loadingLabel('python');
    const runId=++id,caseUsed={...desired};timer=setTimeout(()=>stop(labels.timeout),240000);
    try {
      const solver=await source;if(!enabled||runId!==id)return;
      if(!worker){worker=new Worker(root.dataset.worker,{type:'module'});worker.onerror=e=>{stop(labels.error);status.dataset.state='warning';find('[data-lab-console]').textContent=e.message||'Worker could not load';};}
      worker.onmessage=e=>{if(e.data.id!==runId)return;if(e.data.type==='loading'){status.textContent=loadingLabel(e.data.message);return;}finish(e.data,caseUsed);};
      worker.postMessage({id:runId,parameters:caseUsed,source:solver,code:'result = solve(case)\n'});
    }catch(e){stop(labels.error);status.dataset.state='warning';find('[data-lab-console]').textContent=String(e.message||e);}
  }
  function changed(){
    sync();result=null;delete root.dataset.result;render();if(runner)runner.markStale();
    desired={...state};if(enabled){status.textContent=labels.running;status.dataset.state='loading';clearTimeout(debounce);debounce=setTimeout(dispatch,300);}else{status.textContent=labels.idle;status.dataset.state='idle';}
  }
  root.querySelectorAll('[data-key]').forEach(input=>input.addEventListener('input',()=>{state[input.dataset.key]=input.type==='checkbox'?input.checked:input.tagName==='SELECT'?input.value:Number(input.value);find('#pp-preset').value='custom';changed();}));
  find('#pp-preset').addEventListener('change',e=>{if(e.target.value==='custom')return;state={...defaults,...presets[e.target.value]};changed();});
  find('[data-reset]').addEventListener('click',()=>{state={...defaults};find('#pp-preset').value='baseline';changed();});
  find('[data-start]').addEventListener('click',()=>{enabled=true;desired={...state};find('[data-start]').textContent=labels.run;find('[data-stop]').disabled=false;dispatch();});
  find('[data-stop]').addEventListener('click',()=>stop(labels.stopped));
  find('[data-copy-code]').addEventListener('click',()=>{document.querySelector('#pandapower-code [data-experiment-editor]').value=generatedCode();find('[data-copy-status]').textContent=labels.copied;});
  const sample = window.PowerFlowCodeExamples.sample('pandapower', zh);
  runner=window.CoursePythonRunner({root:document.getElementById('pandapower-code'),snapshot:()=>state,zh,sample,timeoutMs:240000,loadingLabel,filename:'pandapower_experiment.py',drawResult:drawProfile,
    acceptResult:r=>Boolean(r?.ok&&Array.isArray(r.buses)&&r.buses.length>0&&r.buses.every(b=>Array.isArray(b.vm_pu)&&b.vm_pu.length>0&&b.vm_pu.every(v=>v===null||(Number.isFinite(v)&&v>0&&v<5))))});
  document.querySelector('.pp-quiz').addEventListener('submit',e=>{e.preventDefault();const selected=e.currentTarget.querySelector('input:checked'),feedback=e.currentTarget.querySelector('[data-quiz-feedback]');feedback.textContent=!selected?(zh?'请先选择答案。':'Select an answer first.'):selected.value==='supply'?(zh?'正确。连通性、供电范围与运行限值都要检查；收敛仅说明求解器找到了供电部分的解。':'Correct. Check connectivity, supply, and operating limits; convergence only describes the solved supplied network.'):(zh?'再想一想：孤岛负荷可能被求解器排除，converged 仍可以为 True。':'Try again: an islanded load may be excluded while converged remains True.');});
  document.querySelectorAll('.pandapower-lesson [data-math]').forEach(node=>{if(window.katex)window.katex.render(node.dataset.math,node,{displayMode:true,throwOnError:false,strict:'ignore'});else node.textContent=node.dataset.math;});
  window.addEventListener('pagehide',()=>{if(worker)worker.terminate();clearTimeout(timer);clearTimeout(debounce);});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(drawNetwork).observe(root);else window.addEventListener('resize',drawNetwork);
  sync();render();
})();
