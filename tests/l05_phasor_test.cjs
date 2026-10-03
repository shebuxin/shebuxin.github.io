const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const model = require('../assets/js/l05-phasor-model.js');
const near = (actual,expected,tolerance=1e-9) => assert.ok(Math.abs(actual-expected)<=tolerance, `${actual} != ${expected}`);

test('source CE-2A and CE-2D values, RMS convention, and phase relation',()=>{
  const a=model.solve();
  near(a.vs.re,103.92304845413264); near(a.vs.im,60);
  near(a.vx.re,20); near(a.vx.im,-34.64101615137754);
  near(a.total.rms,Math.sqrt(16000)); near(a.total.angle_deg,11.56505117707799);
  near(a.total.peak,Math.sqrt(32000)); near(a.phase_difference_deg,50);
  near(a.frequency_hz,377/(2*Math.PI));
  const d=model.solve(model.practice);
  near(d.total.re,93.02583156247212); near(d.total.im,-90.19101818641045);
  near(d.total.rms,129.56938334109202); near(d.total.angle_deg,-44.113564701737324);
  near(d.total.peak,183.2387791892909);
});

test('alignment, cancellation, quadrants, and equivalent angles',()=>{
  const aligned=model.solve({vx_angle_deg:30});
  near(aligned.total.rms,160); near(aligned.total.angle_deg,30);
  for (const phase of [-180,-90,0,90,180,270,540]) {
    const r=model.solve({vs_rms:10,vs_angle_deg:phase,vx_rms:0});
    near(model.wrap(r.total.angle_deg-phase),0);
  }
  const opposed=model.solve({vx_rms:120,vx_angle_deg:-150});
  assert.equal(opposed.total.rms,0); assert.equal(opposed.total.angle_deg,null);
  assert.ok(opposed.waveform.total_v.every(v=>Math.abs(v)<1e-10));
  const zero=model.solve({vs_rms:0,vx_rms:0});
  assert.equal(zero.total.angle_deg,null); assert.equal(zero.phase_difference_deg,null);
  const wrapping=model.solve({vs_angle_deg:170,current_angle_deg:-170});
  near(wrapping.phase_difference_deg,-20);
});

test('frequency changes time scale while preserving phasors and normalized samples',()=>{
  const a=model.solve(), b=model.solve({omega:2*377});
  assert.deepEqual(a.total,b.total); near(a.period_ms,2*b.period_ms);
  for (let i=0;i<a.waveform.t_ms.length;i++) {
    near(a.waveform.t_ms[i],2*b.waveform.t_ms[i]);
    near(a.waveform.total_v[i],b.waveform.total_v[i]);
  }
});

test('independent midpoint integration and direct time sum agree with the resultant',()=>{
  const cases=[{},model.practice,{vs_rms:37,vs_angle_deg:151,vx_rms:81,vx_angle_deg:-47,omega:300},
    {vs_rms:0,vx_rms:62,vx_angle_deg:123,omega:500},{vs_rms:120,vx_rms:120,vx_angle_deg:-150}];
  for (const c of cases) {
    const r=model.solve(c), p=r.parameters, period=2*Math.PI/p.omega;
    let squares=0;
    for (let i=0;i<2048;i++) {
      const t=period*(i+0.5)/2048;
      const direct=Math.SQRT2*(p.vs_rms*Math.cos(p.omega*t+p.vs_angle_deg*Math.PI/180)+
        p.vx_rms*Math.cos(p.omega*t+p.vx_angle_deg*Math.PI/180));
      squares+=direct*direct;
      const rebuilt=r.total.angle_deg===null?0:r.total.peak*Math.cos(p.omega*t+r.total.angle_deg*Math.PI/180);
      near(direct,rebuilt,1e-10);
    }
    near(Math.sqrt(squares/2048),r.total.rms,1e-10);
    near(r.numerical_rms,r.total.rms,1e-10);
    assert.ok(r.reconstruction_error_max<1e-10);
  }
});

test('invalid magnitudes, frequencies, and nonnumeric input are rejected',()=>{
  for (const c of [{vs_rms:-1},{vx_rms:-1},{omega:0},{omega:-50},{vs_angle_deg:NaN},{vx_rms:Infinity},{vs_rms:'120'},{omega:true}]) {
    assert.throws(()=>model.solve(c));
  }
});

test('editable Python model matches JavaScript, including all waveform samples',()=>{
  const cases=[{},model.practice,{vx_angle_deg:30},{vx_rms:120,vx_angle_deg:-150},
    {vs_rms:0,vx_rms:0},{vs_rms:13,vs_angle_deg:173,vx_rms:88,vx_angle_deg:-179,omega:450,current_angle_deg:170}];
  const program=`import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("l05", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
cases = json.load(sys.stdin)
print(json.dumps([module.solve(c) for c in cases], allow_nan=False))
for bad in ({"vs_rms": -1}, {"omega": 0}, {"omega": True}, {"vs_rms": "120"}):
    try:
        module.solve(bad)
    except ValueError:
        pass
    else:
        raise AssertionError("invalid case accepted")
`;
  const py=spawnSync(process.env.PYTHON||'python3',['-c',program,path.resolve(__dirname,'../assets/code/l05_phasors.py')],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:2*1024*1024});
  assert.equal(py.status,0,py.stderr);
  const python=JSON.parse(py.stdout);
  function compare(a,b) {
    if (typeof a==='number') near(a,b,1e-9);
    else if (a===null) assert.equal(b,null);
    else if (Array.isArray(a)) {assert.equal(a.length,b.length);a.forEach((v,i)=>compare(v,b[i]));}
    else {assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());Object.keys(a).forEach(key=>compare(a[key],b[key]));}
  }
  cases.forEach((c,i)=>compare(model.solve(c),python[i]));
});
