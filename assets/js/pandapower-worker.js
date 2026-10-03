import {loadPyodide} from "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.mjs";

let runtime;
let ready;
async function initialize(id) {
  const stage=message=>self.postMessage({id,type:"loading",message});
  stage("python");
  runtime=await loadPyodide();
  stage("scientific");
  await runtime.loadPackage(["numpy","scipy","pandas","networkx","packaging","tqdm","lxml","micropip"]);
  stage("pandapower");
  await runtime.runPythonAsync("import micropip\nawait micropip.install('packaging==25.0', reinstall=True)\nawait micropip.install(['deepdiff==8.6.1', 'geojson==3.2.0', 'typing_extensions==4.15.0', 'pandapower==3.2.1'])\nimport pandapower as pp\n");
}
self.onmessage=async event=>{
  const {id,source,code,parameters}=event.data;
  let namespace,output="";
  const append=text=>{if(output.length<24000)output+=text+"\n";};
  try {
    if(!ready)ready=initialize(id).catch(error=>{ready=null;throw error;});
    await ready;
    runtime.setStdout({batched:append});runtime.setStderr({batched:append});
    namespace=runtime.runPython("dict(__name__='pandapower_lesson')");
    runtime.globals.set("_pp_case_json",JSON.stringify(parameters));
    const pyCase=runtime.runPython("__import__('json').loads(_pp_case_json)");
    namespace.set("case",pyCase);pyCase.destroy();
    await runtime.runPythonAsync(source,{globals:namespace});
    await runtime.runPythonAsync(code,{globals:namespace});
    const encoded=runtime.runPython("__import__('json').dumps(globals().get('result'),allow_nan=False)",{globals:namespace});
    self.postMessage({id,type:"result",result:JSON.parse(encoded),output,version:"3.2.1"});
  }catch(error){self.postMessage({id,type:"error",error:String(error.message||error),output});}
  finally {if(namespace)namespace.destroy();if(runtime)runtime.globals.delete("_pp_case_json");}
};
