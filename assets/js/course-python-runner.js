/* Reusable browser-only Python panel for interactive course chapters. */
(function () {
  "use strict";
  window.CoursePythonRunner = function (options) {
    const {root,snapshot,drawResult,acceptResult,sample,zh,filename}=options;
    const find=selector=>root.querySelector(selector);
    const editor=find('[data-experiment-editor]'),solver=find('[data-solver-editor]');
    const runButton=find('[data-run]'),stopButton=find('[data-stop]'),status=find('[data-code-status]'),output=find('[data-console]');
    const figure=find('.bf-code-result'),svg=figure.querySelector('svg');
    const labels=zh?{loading:'正在加载 Python 环境…',running:'正在运行 Python…',ready:'Python 已运行。',stale:'参数已改变；再次运行以更新代码结果。',stop:'已停止，可以重新运行。',timeout:'运行超时，已停止。',error:'运行失败：',invalid:'没有可绘制的收敛解；请查看输出并检查 result。'}:
      {loading:'Loading the Python environment…',running:'Running Python…',ready:'Python run completed.',stale:'Parameters changed; run again to update the code result.',stop:'Stopped. You can run again.',timeout:'Run timed out and was stopped.',error:'Run failed: ',invalid:'No converged solution to plot; check the output and result.'};
    let worker=null,id=0,running=false,timer=null,lastResult=null,lastCase=null;
    editor.value=sample;
    const source=fetch(root.dataset.source).then(response=>{if(!response.ok)throw new Error('Solver source unavailable');return response.text();}).then(text=>{solver.value=text;return text;});
    source.catch(error=>{status.textContent=labels.error+error.message;status.dataset.state='error';});
    function finish(){running=false;clearTimeout(timer);timer=null;runButton.disabled=false;stopButton.disabled=true;}
    function terminate(message){id++;if(worker)worker.terminate();worker=null;finish();lastResult=null;figure.hidden=true;delete root.dataset.result;status.textContent=message;status.dataset.state='stopped';}
    function createWorker(){
      worker=new Worker(root.dataset.worker,{type:'module'});
      worker.onmessage=event=>{
        const data=event.data;if(data.id!==id)return;
        if(data.type==='loading'){status.textContent=options.loadingLabel?options.loadingLabel(data.message):labels.loading;return;}
        finish();output.textContent=data.output||'';
        if(data.type==='error'){status.dataset.state='error';status.textContent=labels.error;output.textContent+=data.error||'';return;}
        root.dataset.result=JSON.stringify(data.result);
        status.dataset.state='ready';status.textContent=JSON.stringify(lastCase)===JSON.stringify(snapshot())?labels.ready:labels.stale;
        if(acceptResult(data.result)){lastResult=data.result;figure.hidden=false;drawResult(svg,lastResult);}
        else {status.textContent=options.invalidLabel||labels.invalid;figure.hidden=true;}
      };
      worker.onerror=event=>{terminate(labels.error+(event.message||'Python could not load'));status.dataset.state='error';};
    }
    async function run(){
      if(running)return;
      running=true;runButton.disabled=true;stopButton.disabled=false;status.dataset.state='running';status.textContent=worker?labels.running:labels.loading;
      output.textContent='';figure.hidden=true;lastResult=null;delete root.dataset.result;
      const runId=++id;lastCase={...snapshot()};
      timer=setTimeout(()=>terminate(labels.timeout),options.timeoutMs||90000);
      try {await source;if(!running||runId!==id)return;if(!worker)createWorker();worker.postMessage({id:runId,source:solver.value,code:editor.value,parameters:lastCase});}
      catch(error){terminate(labels.error+error.message);status.dataset.state='error';}
    }
    runButton.addEventListener('click',run);stopButton.addEventListener('click',()=>terminate(labels.stop));
    runButton.setAttribute('aria-keyshortcuts','Control+Enter Meta+Enter');
    editor.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();run();}});
    find('[data-code-reset]').addEventListener('click',()=>{editor.value=sample;});
    find('[data-solver-reset]').addEventListener('click',async()=>{try{solver.value=await source;}catch(error){status.textContent=labels.error+error.message;}});
    find('[data-code-download]').addEventListener('click',async()=>{
      try {
        await source;
        const content='# Experiment snapshot\ncase = __import__("json").loads('+JSON.stringify(JSON.stringify(snapshot()))+')\n\n'+solver.value+'\n\n# Experiment code\n'+editor.value;
        const url=URL.createObjectURL(new Blob([content],{type:'text/x-python'})),anchor=document.createElement('a');
        anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(error){status.textContent=labels.error+error.message;}
    });
    window.addEventListener('pagehide',()=>{if(worker)worker.terminate();clearTimeout(timer);});
    return {markStale(){if(lastResult&&!running)status.textContent=labels.stale;},redraw(){if(lastResult)drawResult(svg,lastResult);}};
  };
})();
