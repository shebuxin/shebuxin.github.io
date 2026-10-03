(function () {
  "use strict";
  const root = document.getElementById("balanced-lab"), model = window.BalancedPowerFlow;
  if (!root || !model) return;
  const zh = root.dataset.lang === "zh";
  const lesson = document.querySelector(".balanced-lesson");
  const networkSvg = root.querySelector(".bf-network"), profileSvg = root.querySelector(".bf-profile"), loadingSvg = root.querySelector(".bf-loading");
  const phaseSvg = document.querySelector(".bf-phasors");
  const codeRoot = document.getElementById("balanced-code"), editor = document.getElementById("bf-python-editor"), solverEditor = document.getElementById("bf-solver-editor");
  const codeStatus = codeRoot.querySelector("[data-code-status]"), consoleOutput = codeRoot.querySelector("[data-console]"), codeFigure = codeRoot.querySelector(".bf-code-result"), codeSvg = codeRoot.querySelector(".bf-code-profile");
  const runButton = codeRoot.querySelector("[data-run]"), stopButton = codeRoot.querySelector("[data-stop]");
  const ns = "http://www.w3.org/2000/svg";
  const labels = zh ? { bus:"节点", line:"线路", open:"断开", voltage:"电压越限", current:"电流越限", island:"与参考节点断开，单平衡节点模型无法求解。", fail:"牛顿迭代未收敛；这不证明物理系统不存在解。", safe:"已收敛，满足当前教学电压与电流限值。", converge:"已收敛，但存在越限：", source:"参考电源", load:"负荷", deg:"°", loading:"负载率 (%)", profile:"电压 |V| (pu)", ready:"Python 已运行。", stale:"滑块已改变；再次运行以更新代码结果。", starting:"正在加载 Python 环境…", running:"正在运行 Python…", stopped:"已停止；可以再次运行。", error:"运行失败：", noresult:"代码未提供有效电压结果；请检查 result。", select:"请选择一个答案。", correct:"正确：三相幅值相等且相差 120°；不同节点仍可能有不同电压。", wrong:"再想一想：平衡约束的是同一节点的三相关系，并不排除无功或沿线电压下降。" } : { bus:"Bus", line:"Line", open:"Open", voltage:"voltage", current:"current", island:"disconnected from the reference; no single-slack solution.", fail:"Newton iteration did not converge; this does not prove physical infeasibility.", safe:"Converged; within the current teaching voltage and current limits.", converge:"Converged with limit violations: ", source:"Reference source", load:"Load", deg:"°", loading:"Loading (%)", profile:"Voltage |V| (pu)", ready:"Python run completed.", stale:"Sliders changed; run again to update the code result.", starting:"Loading the Python environment…", running:"Running Python…", stopped:"Stopped. You can run again.", error:"Run failed: ", noresult:"No valid voltage result was supplied; check result.", select:"Select an answer first.", correct:"Correct: equal phase magnitudes and 120° separation. Different buses can still have different voltages.", wrong:"Try again: balance describes the three phases at a bus, and does not exclude reactive power or feeder voltage drop." };
  let state = { ...model.defaults }, result, codeResult = null, codeSnapshot = null, worker = null, runId = 0, timer = null, running = false;
  const f = (v, digits = 2) => (Math.abs(v) < 1e-8 ? 0 : v).toFixed(digits);
  const edgeName = e => e.id[0] + "–" + e.id[1];
  const presets = { baseline:{}, heavy:{load_scale:2}, lowpf:{power_factor:.8}, solar:{load_scale:.65,dg_kw:320}, weak:{r_scale:2,x_scale:1.5} };
  const sample = '# case is a fresh snapshot of the sliders.\n# Uncomment to add reactive support:\n# case["q_support_kvar"] = 60\n\nresult = solve(case)\nif result["ok"]:\n    for bus in result["buses"]:\n        print(f\'Bus {bus["id"]}: {bus["vm_pu"]:.5f} pu, \'\n              f\'{bus["theta_deg"]:.4f} deg\')\n    print(f\'Loss: {result["loss_kw"]:.4f} kW\')\n    print(f\'Slack: {result["slack_p_kw"]:.4f} kW\')\nelse:\n    print("No converged result:", result["reason"])\n';
  editor.value = sample;
  runButton.setAttribute("aria-keyshortcuts", "Control+Enter Meta+Enter");
  const sourcePromise = fetch(root.dataset.source).then(response => { if (!response.ok) throw new Error("Solver source could not be loaded"); return response.text(); }).then(source => { solverEditor.value = source; return source; });
  sourcePromise.catch(error => { codeStatus.textContent = labels.error + error.message; codeStatus.dataset.state = "error"; });

  function el(svg, tag, attributes = {}) { const node = document.createElementNS(ns, tag); Object.entries(attributes).forEach(([k,v]) => node.setAttribute(k,v)); svg.appendChild(node); return node; }
  function text(svg,x,y,value,anchor="middle") { const t=el(svg,"text",{x,y,"text-anchor":anchor}); t.textContent=value; return t; }
  function canvas(svg,height,title) { const width=svg.getBoundingClientRect().width; if (!width) return 0; svg.setAttribute("viewBox",`0 0 ${width} ${height}`); svg.setAttribute("height",height); svg.replaceChildren(); el(svg,"title").textContent=title; return width; }

  function drawNetwork() {
    const w=canvas(networkSvg,245,zh?"三节点 AC 潮流与电压":"Three-bus AC flows and voltages"); if(!w) return;
    const points=[[w*.14,115],[w*.5,115],[w*.86,115]];
    result.branches.forEach(e=>{
      const a=points[e.from === undefined ? Number(e.id[0])-1 : e.from], b=points[e.to === undefined ? Number(e.id[1])-1 : e.to];
      const isTie=e.id==="13", color=!e.active||!result.ok?"var(--bf-border)":e.loading_pct>100?"var(--bf-danger)":"var(--bf-green)";
      const attrs={stroke:color,"stroke-width":!e.active||!result.ok?1.5:2+Math.min(10,e.current_a/70),fill:"none","stroke-dasharray":e.active?"none":"5 5"};
      if(isTie) el(networkSvg,"path",{...attrs,d:`M ${a[0]} ${a[1]-19} Q ${w/2} -12 ${b[0]} ${b[1]-19}`});
      else el(networkSvg,"line",{...attrs,x1:a[0]+23,y1:115,x2:b[0]-23,y2:115});
      const mx=(a[0]+b[0])/2, my=isTie?42:115;
      if(result.ok&&e.active&&Math.abs(e.p_from_kw)>.01){const direction=Math.sign(e.p_from_kw);el(networkSvg,"polygon",{points:`${mx+direction*8},${my} ${mx-direction*6},${my-5} ${mx-direction*6},${my+5}`,fill:"var(--bf-surface)",stroke:color,"stroke-width":1.5});}
      const ly=isTie?15:78;
      text(networkSvg,mx,ly,labels.line+" "+edgeName(e));
      text(networkSvg,mx,ly+18,!e.active?labels.open:result.ok?f(Math.abs(e.p_from_kw),1)+" kW":"—");
    });
    points.forEach((p,i)=>{
      const bus=result.ok?result.buses[i]:null, violation=bus&&(bus.vm_pu<.95-1e-9||bus.vm_pu>1.05+1e-9);
      el(networkSvg,"circle",{cx:p[0],cy:p[1],r:22,fill:i===0?"#e7eefb":"var(--bf-surface)",stroke:violation?"var(--bf-danger)":"var(--bf-border)","stroke-width":1.5});
      text(networkSvg,p[0],p[1]+4,String(i+1));
      text(networkSvg,p[0],158,bus?f(bus.vm_pu,4)+" pu":"—");
      text(networkSvg,p[0],178,bus?f(bus.theta_deg,2)+"°":"—");
      text(networkSvg,p[0],205,i===0?(zh?"参考节点":"Slack"):(i===1?f(120*state.load_scale,0):f(180*state.load_scale,0))+" kW");
      if(i===2) text(networkSvg,p[0],224,"DG "+f(state.dg_kw,0)+" kW");
    });
  }

  function drawPhases() {
    const w=canvas(phaseSvg,230,zh?"节点 3 的平衡三相电压相量":"Balanced phase-voltage phasors at bus 3"); if(!w) return;
    if(!result.ok){text(phaseSvg,w/2,110,"—");return;}
    const cx=w/2, cy=112, radius=Math.min(78,w*.27), bus=result.buses[2], angle=bus.theta_deg*Math.PI/180;
    el(phaseSvg,"circle",{cx,cy,r:radius,stroke:"var(--bf-border)",fill:"none"});
    el(phaseSvg,"line",{x1:cx-radius-10,y1:cy,x2:cx+radius+10,y2:cy,stroke:"var(--bf-border)"});
    el(phaseSvg,"line",{x1:cx,y1:cy-radius-10,x2:cx,y2:cy+radius+10,stroke:"var(--bf-border)"});
    [angle,angle-2*Math.PI/3,angle+2*Math.PI/3].forEach((a,i)=>{
      const length=radius*bus.vm_pu, x=cx+length*Math.cos(a), y=cy-length*Math.sin(a), color=["var(--bf-blue)","var(--bf-green)","var(--bf-orange)"][i];
      el(phaseSvg,"line",{x1:cx,y1:cy,x2:x,y2:y,stroke:color,"stroke-width":2.5});
      el(phaseSvg,"circle",{cx:x,cy:y,r:3,fill:color});
      text(phaseSvg,cx+(length+17)*Math.cos(a),cy-(length+17)*Math.sin(a)+4,["Vₐ","Vᵦ","V𝒸"][i]);
    });
    text(phaseSvg,w/2,220,"|Vₐ| = |Vᵦ| = |V𝒸| = "+f(bus.vm_pu,4)+" pu");
  }

  function drawProfile(svg,solution) {
    const w=canvas(svg,245,labels.profile); if(!w) return;
    if(!solution||!solution.ok){text(svg,w/2,120,"—");return;}
    const left=50,right=w-20,top=36,bottom=197;
    const values=solution.buses.map(b=>b.vm_pu), lo=Math.min(.93,...values.map(v=>v-.02)), hi=Math.max(1.07,...values.map(v=>v+.02));
    const y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top), x=i=>left+i*(right-left)/2;
    el(svg,"rect",{x:left,y:y(1.05),width:right-left,height:y(.95)-y(1.05),fill:"#eaf4ef"});
    for(let k=0;k<=4;k++){const v=lo+(hi-lo)*k/4, yy=y(v);el(svg,"line",{x1:left,y1:yy,x2:right,y2:yy,stroke:"var(--bf-border)","stroke-width":1});text(svg,left-7,yy+4,f(v,2),"end");}
    text(svg,left,17,labels.profile,"start");
    el(svg,"polyline",{points:values.map((v,i)=>x(i)+","+y(v)).join(" "),stroke:"var(--bf-blue)","stroke-width":2.5,fill:"none"});
    solution.buses.forEach((b,i)=>{const circle=el(svg,"circle",{cx:x(i),cy:y(b.vm_pu),r:4,fill:"var(--bf-blue)"});el(circle,"title").textContent=labels.bus+" "+b.id+": "+f(b.vm_pu,5)+" pu";text(svg,x(i),y(b.vm_pu)-11,f(b.vm_pu,4),i===0?"start":i===2?"end":"middle");text(svg,x(i),222,String(b.id));});
    text(svg,(left+right)/2,242,labels.bus);
  }

  function drawLoading() {
    const w=canvas(loadingSvg,245,labels.loading);if(!w) return;
    if(!result.ok){text(loadingSvg,w/2,120,"—");return;}
    const left=44,right=w-55,max=Math.max(120,...result.branches.map(e=>e.loading_pct*1.15)), scale=v=>left+v/max*(right-left);
    text(loadingSvg,left,17,labels.loading,"start");
    result.branches.forEach((e,i)=>{const y=50+i*53; text(loadingSvg,left-8,y+15,edgeName(e),"end");el(loadingSvg,"rect",{x:left,y,width:right-left,height:22,fill:"#eef3f7"});if(e.active)el(loadingSvg,"rect",{x:left,y,width:Math.max(0,scale(e.loading_pct)-left),height:22,fill:e.loading_pct>100?"var(--bf-danger)":"var(--bf-green)"});text(loadingSvg,right+6,y+15,e.active?f(e.loading_pct,0)+"%":labels.open,"start");});
    el(loadingSvg,"line",{x1:scale(100),y1:40,x2:scale(100),y2:190,stroke:"var(--bf-muted)","stroke-dasharray":"3 3"});
    text(loadingSvg,left,222,"0","start");text(loadingSvg,scale(100),222,"100");text(loadingSvg,right,242,"%","end");
  }
  function table(selector,rows){const tbody=root.querySelector(selector);tbody.replaceChildren();rows.forEach(row=>{const tr=document.createElement("tr");row.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.appendChild(td);});tbody.appendChild(tr);});}
  function drawAll(){drawNetwork();drawPhases();drawProfile(profileSvg,result);drawLoading();if(codeResult)drawProfile(codeSvg,codeResult);}
  function sync(){root.querySelectorAll("[data-key]").forEach(input=>{if(input.type==="checkbox")input.checked=state[input.dataset.key];else input.value=state[input.dataset.key];});}
  function update(){
    result=model.solve(state);root.dataset.result=JSON.stringify(result);root.dataset.case=JSON.stringify(state);
    root.querySelectorAll('input[type="range"]').forEach(input=>{const key=input.dataset.key;const digits=["power_factor","slack_pu"].includes(key)?3:key.endsWith("scale")?2:0;const value=f(state[key],digits)+" "+input.dataset.unit;root.querySelector('[data-value="'+key+'"]').textContent=value.trim();input.setAttribute("aria-valuetext",value.trim());});
    root.querySelector('[data-key="open13"]').disabled=state.topology==="radial";
    root.querySelector('[data-metric="min"]').textContent=result.ok?f(Math.min(...result.buses.map(b=>b.vm_pu)),4)+" pu":"—";
    root.querySelector('[data-metric="loss"]').textContent=result.ok?f(result.loss_kw,3)+" kW":"—";
    root.querySelector('[data-metric="slack"]').textContent=result.ok?f(result.slack_p_kw,1)+" kW / "+f(result.slack_q_kvar,1)+" kvar":"—";
    const status=root.querySelector("[data-status]");status.dataset.state=!result.ok||result.violations.length?"warning":"safe";
    status.textContent=!result.ok?(result.reason==="island"?labels.bus+" "+result.islands.join(", ")+" "+labels.island:labels.fail):result.violations.length?labels.converge+result.violations.map(v=>(v.kind==="voltage"?labels.bus+" "+v.id+" "+labels.voltage:labels.line+" "+v.id[0]+"–"+v.id[1]+" "+labels.current)).join("; "):labels.safe;
    table("[data-buses]",result.ok?result.buses.map(b=>[b.id,f(b.vm_pu,5),f(b.theta_deg,4),f(b.p_kw,3),f(b.q_kvar,3)]):[]);
    table("[data-branches]",result.ok?result.branches.map(e=>[edgeName(e),e.active?f(e.p_from_kw,2):labels.open,f(e.current_a,2),f(e.loss_kw,4)]):[]);
    table("[data-iterations]",result.history.map(h=>[h.iteration,h.residual_pu.toExponential(2),f(h.vm_pu[1],6),f(h.vm_pu[2],6)]));
    if(codeResult&&!running)codeStatus.textContent=labels.stale;
    drawAll();
  }
  root.querySelectorAll("[data-key]").forEach(input=>input.addEventListener("input",()=>{state[input.dataset.key]=input.type==="checkbox"?input.checked:input.tagName==="SELECT"?input.value:Number(input.value);root.querySelector("#bf-preset").value="custom";update();}));
  root.querySelector("#bf-preset").addEventListener("change",event=>{if(event.target.value==="custom")return;state={...model.defaults,...presets[event.target.value]};sync();update();});
  root.querySelector("[data-reset]").addEventListener("click",()=>{state={...model.defaults};root.querySelector("#bf-preset").value="baseline";sync();update();});

  function finish(){running=false;clearTimeout(timer);timer=null;runButton.disabled=false;stopButton.disabled=true;}
  function terminate(message){runId++;if(worker)worker.terminate();worker=null;finish();codeResult=null;codeFigure.hidden=true;codeStatus.textContent=message;}
  function makeWorker(){
    worker=new Worker(root.dataset.worker,{type:"module"});
    worker.onmessage=event=>{
      const data=event.data;if(data.id!==runId)return;
      if(data.type==="loading"){codeStatus.textContent=labels.starting;return;}
      finish();consoleOutput.textContent=data.output||"";
      if(data.type==="error"){codeStatus.dataset.state="error";codeStatus.textContent=labels.error;consoleOutput.textContent+=(data.error||"");codeResult=null;codeFigure.hidden=true;return;}
      const valid=data.result&&data.result.ok&&Array.isArray(data.result.buses)&&data.result.buses.length===3&&data.result.buses.every(b=>Number.isFinite(b.vm_pu)&&b.vm_pu>0&&b.vm_pu<5);
      codeRoot.dataset.result=JSON.stringify(data.result);
      codeStatus.dataset.state="ready";codeStatus.textContent=JSON.stringify(codeSnapshot)===JSON.stringify(state)?labels.ready:labels.stale;
      if(valid){codeResult=data.result;codeFigure.hidden=false;drawProfile(codeSvg,codeResult);}
      else {codeResult=null;codeFigure.hidden=true;if(!data.output)consoleOutput.textContent=labels.noresult;}
    };
    worker.onerror=event=>{const message=event.message||"Could not load Python";terminate(labels.error+message);codeStatus.dataset.state="error";};
  }
  async function run(){
    if(running)return;
    running=true;runButton.disabled=true;stopButton.disabled=false;codeStatus.dataset.state="running";codeStatus.textContent=worker?labels.running:labels.starting;consoleOutput.textContent="";codeResult=null;codeFigure.hidden=true;delete codeRoot.dataset.result;
    const id=++runId, snapshot={...state};codeSnapshot=snapshot;
    timer=setTimeout(()=>terminate(zh?"运行超时，已停止。可以重试。":"Run timed out and was stopped. You can retry."),90000);
    try{await sourcePromise;if(!running||id!==runId)return;if(!worker)makeWorker();worker.postMessage({id,source:solverEditor.value,code:editor.value,parameters:snapshot});}
    catch(error){terminate(labels.error+error.message);codeStatus.dataset.state="error";}
  }
  runButton.addEventListener("click",run);stopButton.addEventListener("click",()=>terminate(labels.stopped));
  editor.addEventListener("keydown",event=>{if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();run();}});
  codeRoot.querySelector("[data-code-reset]").addEventListener("click",()=>{editor.value=sample;});
  codeRoot.querySelector("[data-solver-reset]").addEventListener("click",async()=>{try{solverEditor.value=await sourcePromise;}catch(error){codeStatus.textContent=labels.error+error.message;}});
  codeRoot.querySelector("[data-code-download]").addEventListener("click",async()=>{try{await sourcePromise;const file='# Experiment snapshot\ncase = __import__("json").loads('+JSON.stringify(JSON.stringify(state))+')\n\n'+solverEditor.value+'\n\n# Experiment code\n'+editor.value;const url=URL.createObjectURL(new Blob([file],{type:"text/x-python"}));const a=document.createElement("a");a.href=url;a.download="balanced_experiment.py";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){codeStatus.textContent=labels.error+error.message;}});
  document.querySelector(".bf-quiz").addEventListener("submit",event=>{event.preventDefault();const checked=event.currentTarget.querySelector("input:checked"),feedback=event.currentTarget.querySelector("[data-quiz-feedback]");feedback.textContent=!checked?labels.select:checked.value==="phase"?labels.correct:labels.wrong;});
  window.addEventListener("pagehide",()=>{if(worker)worker.terminate();clearTimeout(timer);});
  if(window.katex)lesson.querySelectorAll("[data-math]").forEach(node=>window.katex.render(node.dataset.math,node,{displayMode:!node.hasAttribute("data-inline"),throwOnError:false,strict:"ignore"}));
  else lesson.querySelectorAll("[data-math]").forEach(node=>{node.textContent=node.dataset.math;});
  update();
  if(typeof ResizeObserver!=="undefined")new ResizeObserver(drawAll).observe(root);else window.addEventListener("resize",drawAll);
})();
