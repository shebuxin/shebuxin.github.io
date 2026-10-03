import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.mjs";

let runtime;
self.onmessage = async event => {
  const { id, source, code, parameters } = event.data;
  let namespace;
  let output = "";
  const append = text => { if (output.length < 24000) output += text + "\n"; };
  try {
    if (!runtime) {
      self.postMessage({ id, type: "loading" });
      runtime = await loadPyodide();
    }
    runtime.setStdout({ batched: append });
    runtime.setStderr({ batched: append });
    namespace = runtime.runPython("dict(__name__='course_lesson')");
    // Fresh namespaces prevent a previous result from surviving a failed run.
    runtime.globals.set("_course_case_json", JSON.stringify(parameters));
    const caseObject = runtime.runPython("__import__('json').loads(_course_case_json)");
    namespace.set("case", caseObject);
    caseObject.destroy();
    await runtime.runPythonAsync(source, { globals: namespace });
    await runtime.runPythonAsync(code, { globals: namespace });
    const encoded = runtime.runPython("__import__('json').dumps(globals().get('result'), allow_nan=False)", { globals: namespace });
    self.postMessage({ id, type: "result", output, result: JSON.parse(encoded) });
  } catch (error) {
    self.postMessage({ id, type: "error", output, error: String(error.message || error) });
  } finally {
    if (namespace) namespace.destroy();
    if (runtime) runtime.globals.delete("_course_case_json");
  }
};
