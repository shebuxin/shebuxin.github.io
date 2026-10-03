const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { sample, showCase } = require('../assets/js/power-flow-code-examples.js');

// Execute the real source and editable entry program in the same fresh namespace,
// as the browser worker does. This also checks downloaded, combined experiments.
function runExamples(kind, cases) {
  const source = path.resolve(__dirname, '../assets/code/' +
    (kind === 'pandapower' ? 'pandapower_implementation' : kind + '_power_flow') + '.py');
  const experiments = [false, true].flatMap(zh => cases.map(options => ({ code: sample(kind, zh), options })));
  const python = spawnSync(process.env.PYTHON || 'python3', ['-c', `
import contextlib, io, json, pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
answers = []
for experiment in json.load(sys.stdin):
    # Execute once to access defaults, then run with a case exactly like the worker.
    model = {"__name__": "course_lesson"}
    exec(source, model)
    defaults = model.get("DEFAULTS", model.get("DEFAULT_CASE"))
    case = dict(defaults, **experiment["options"])
    before = dict(case)
    scope = {"__name__": "course_lesson", "case": case}
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        exec(source + "\\n" + experiment["code"], scope)
    assert scope["case"] == before, "main must not mutate the slider input snapshot"
    result = scope["result"]
    if result["ok"]:
        assert result == model["solve"](before), "main must return the solved operating point"
    answers.append({"result": result, "output": output.getvalue()})
print(json.dumps(answers, allow_nan=False))
`, source], { input: JSON.stringify(experiments), encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, maxBuffer: 4e6 });
  assert.equal(python.status, 0, python.stderr || String(python.error));
  return JSON.parse(python.stdout);
}

test('bilingual balanced entry programs run the real solver and handle islanded inputs', () => {
  const answers = runExamples('balanced', [{}, { load_scale: 2, q_support_kvar: 60 }, { open12: true }]);
  answers.forEach(({ result, output }, i) => {
    if (i % 3 === 2) { assert.equal(result.reason, 'island'); assert.match(output, /No converged solution/); }
    else { assert.equal(result.ok, true); assert.match(output, /Bus 3:/); assert.match(output, /Total loss:/); }
  });
});

test('bilingual four-wire entry programs report phase, VUF and neutral results', () => {
  const answers = runExamples('unbalanced', [{}, { p3_a_kw: 60, p3_b_kw: 60, p3_c_kw: 60 }, { open23: true }]);
  answers.forEach(({ result, output }, i) => {
    if (i % 3 === 2) assert.equal(result.reason, 'island');
    else { assert.equal(result.ok, true); assert.match(output, /A:.*pu/); assert.match(output, /VUF:/); assert.match(output, /Neutral shift:/); }
  });
});

test('bilingual pandapower entry programs build/run/read both modes and handle disconnected loads', () => {
  const answers = runExamples('pandapower', [{}, { mode: 'three_phase' }, { trip12: true }]);
  answers.forEach(({ result, output }, i) => {
    if (i % 3 === 2) { assert.equal(result.reason, 'island'); assert.match(output, /No load bus/); }
    else { assert.equal(result.ok, true); assert.match(output, /Within teaching limits:/); assert.match(output, /Total loss/); }
  });
});

test('the visible case is valid Python including boolean topology switches', () => {
  const preview = {};
  showCase({ querySelector: () => preview }, { load_scale: 1.25, topology: 'meshed', open12: true, open23: false });
  const python = spawnSync(process.env.PYTHON || 'python3', ['-c',
    'import json,sys\nscope={}\nexec(sys.stdin.read(),scope)\nprint(json.dumps(scope["case"]))'],
    { input: preview.textContent, encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), { load_scale: 1.25, topology: 'meshed', open12: true, open23: false });
});
