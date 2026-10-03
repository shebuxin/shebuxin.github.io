const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const model = require('../assets/js/balanced-power-flow-model.js');

function close(actual, expected, tolerance = 1e-7) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`);
}
const scenarios = [
  {}, { load_scale: 2 }, { power_factor: .8 }, { q_support_kvar: 60, load_scale: 2 },
  { load_scale: .65, dg_kw: 320 }, { r_scale: 2, x_scale: 1.5 },
  { slack_pu: 1.06 }, { load_scale: 0, dg_kw: 0 },
  { topology: 'meshed' }, { topology: 'meshed', open12: true },
  { topology: 'meshed', open23: true }, { topology: 'meshed', open13: true },
  { open12: true }, { open23: true }, { topology: 'meshed', open12: true, open13: true },
  { load_scale: 20 }
];

// Independent complex arithmetic and radial backward/forward sweep, rather
// than another Newton implementation. Positive sDemand denotes consumption.
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const multiply = (a, b) => [a[0]*b[0] - a[1]*b[1], a[0]*b[1] + a[1]*b[0]];
const divide = (a, b) => {
  const d = b[0]**2 + b[1]**2;
  return [(a[0]*b[0] + a[1]*b[1])/d, (a[1]*b[0] - a[0]*b[1])/d];
};
const conjugate = a => [a[0], -a[1]];
function sweep(options) {
  const s = { ...model.defaults, ...options };
  const ratio = Math.sqrt(1 - s.power_factor**2) / s.power_factor;
  const demands = [[.12*s.load_scale, .12*s.load_scale*ratio],
    [.18*s.load_scale - s.dg_kw/1000, .18*s.load_scale*ratio - s.q_support_kvar/1000]];
  const z12 = [.012*s.r_scale/.16, .008*s.x_scale/.16];
  const z23 = [.008*s.r_scale/.16, .006*s.x_scale/.16];
  const v1 = [s.slack_pu, 0];
  let v2 = [...v1], v3 = [...v1];
  for (let k = 0; k < 1000; k++) {
    const i3 = conjugate(divide(demands[1], v3));
    const i2 = conjugate(divide(demands[0], v2));
    const next2 = subtract(v1, multiply(z12, add(i2, i3)));
    const next3 = subtract(next2, multiply(z23, i3));
    const error = Math.max(Math.hypot(...subtract(v2, next2)), Math.hypot(...subtract(v3, next3)));
    v2 = next2; v3 = next3;
    if (error < 1e-13) return [v1, v2, v3];
  }
  throw new Error('Reference sweep did not converge');
}

test('analytic Jacobian agrees with central differences away from flat start', () => {
  for (const topology of ['radial', 'meshed']) {
    const net = model.network({ topology, r_scale: 1.3, x_scale: .8 });
    const vm = [1.02, .96, .93], theta = [0, -.03, .016];
    const jac = model.jacobian(net, vm, theta), epsilon = 1e-6;
    const evaluate = (v, t) => {
      const { p, q } = model.injections(net, v, t);
      return [p[1], p[2], q[1], q[2]];
    };
    for (let column = 0; column < 4; column++) {
      const va = [...vm], vb = [...vm], ta = [...theta], tb = [...theta];
      if (column < 2) { ta[column+1] += epsilon; tb[column+1] -= epsilon; }
      else { va[column-1] += epsilon; vb[column-1] -= epsilon; }
      const a = evaluate(va, ta), b = evaluate(vb, tb);
      for (let row = 0; row < 4; row++) close(jac[row][column], (a[row]-b[row])/(2*epsilon), 2e-8);
    }
  }
});

test('radial Newton voltages match an independent backward/forward sweep', () => {
  for (const options of scenarios.slice(0, 8)) {
    const reference = sweep(options), result = model.solve(options);
    assert.equal(result.ok, true);
    result.buses.forEach((bus, i) => {
      close(bus.vm_pu, Math.hypot(...reference[i]), 2e-9);
      close(bus.theta_deg, Math.atan2(reference[i][1], reference[i][0])*180/Math.PI, 2e-8);
    });
  }
});

test('connected operating points satisfy nodal P/Q, branch balance and three-phase I²R loss', () => {
  const cases = [...scenarios.slice(0, 12)];
  for (let k = 0; k < 48; k++) cases.push({
    load_scale: .4 + (k%7)*.3, power_factor: .8 + (k%5)*.045,
    dg_kw: (k%9)*45, q_support_kvar: -60+(k%7)*30,
    slack_pu: .96 + (k%5)*.025, r_scale: .5+(k%4)*.5,
    x_scale: .5+(k%3)*.6, topology: k%2 ? 'meshed' : 'radial'
  });
  for (const options of cases) {
    const net = model.network(options), result = model.solve(options);
    assert.equal(result.ok, true, JSON.stringify(options));
    assert.ok(result.residual_pu < 1e-10);
    for (let i = 1; i < 3; i++) {
      close(result.buses[i].p_kw, net.p[i]*1000, 1e-6);
      close(result.buses[i].q_kvar, net.q[i]*1000, 1e-6);
    }
    const p = [0,0,0], q = [0,0,0];
    for (const line of result.branches) {
      p[line.from] += line.p_from_kw; p[line.to] += line.p_to_kw;
      q[line.from] += line.q_from_kvar; q[line.to] += line.q_to_kvar;
      close(line.loss_kw, line.p_from_kw+line.p_to_kw);
      close(line.loss_kw, 3*line.current_a**2*line.r*net.s.r_scale/1000, 1e-7);
      assert.ok(line.loss_kw >= -1e-8);
    }
    result.buses.forEach((bus, i) => { close(bus.p_kw, p[i]); close(bus.q_kvar, q[i]); });
    close(result.slack_p_kw + net.s.dg_kw - 300*net.s.load_scale, result.loss_kw, 1e-6);
    close(result.buses.reduce((total,bus)=>total+bus.p_kw,0), result.loss_kw, 1e-7);
    for (let i = 0; i < 3; i++) { close(net.g[i].reduce((a,b)=>a+b,0),0); close(net.b[i].reduce((a,b)=>a+b,0),0); }
  }
});

test('no load has no loss; reverse generation and reactive support change the physical solution', () => {
  const noLoad = model.solve({ load_scale: 0, dg_kw: 0, slack_pu: 1.02 });
  noLoad.buses.forEach(bus=>{close(bus.vm_pu,1.02);close(bus.theta_deg,0);});
  close(noLoad.loss_kw,0);
  const solar = model.solve({ load_scale: .65, dg_kw: 320 });
  assert.ok(solar.slack_p_kw < 0 && solar.branches[1].p_from_kw < 0);
  const heavy = model.solve({ load_scale: 2 });
  const support = model.solve({ load_scale: 2, q_support_kvar: 60 });
  assert.ok(support.buses[2].vm_pu > heavy.buses[2].vm_pu);
  assert.ok(support.loss_kw < heavy.loss_kw);
  const tighter = model.solve({ current_limit_a: 200 });
  const baseline = model.solve();
  close(tighter.buses[2].vm_pu,baseline.buses[2].vm_pu);
  assert.ok(tighter.violations.some(v=>v.kind==='current'));
});

test('outages identify islands; nonconvergence is explicit and invalid values are rejected', () => {
  assert.deepEqual(model.solve({open12:true}).islands,[2,3]);
  assert.deepEqual(model.solve({open23:true}).islands,[3]);
  assert.equal(model.solve({topology:'meshed',open12:true}).ok,true);
  assert.equal(model.solve({topology:'meshed',open12:true,open13:true}).reason,'island');
  const failure = model.solve({load_scale:20});
  assert.equal(failure.ok,false);
  assert.equal(failure.reason,'nonconvergence');
  assert.ok(failure.history.every(h=>Number.isFinite(h.residual_pu)));
  for (const options of [{power_factor:0},{power_factor:1.1},{load_scale:-1},{slack_pu:0},{r_scale:0},{dg_kw:NaN},{topology:'unknown'}]) assert.throws(()=>model.solve(options),RangeError);
});

test('downloadable Python solver agrees with JavaScript across operating points and outages', () => {
  const python = spawnSync(process.env.PYTHON || 'python3', ['-c',
    'import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location("lesson",sys.argv[1])\nm=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(m)\nprint(json.dumps([m.solve(case) for case in json.load(sys.stdin)],allow_nan=False))',
    path.resolve(__dirname,'../assets/code/balanced_power_flow.py')],
    {input:JSON.stringify(scenarios),encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(python.status,0,python.stderr || String(python.error));
  JSON.parse(python.stdout).forEach((reference,i)=>{
    const result=model.solve(scenarios[i]);
    assert.equal(reference.ok,result.ok);
    if(!result.ok) { assert.equal(reference.reason,result.reason); assert.deepEqual(reference.islands,result.islands); return; }
    for(const key of ['loss_kw','slack_p_kw','slack_q_kvar']) close(reference[key],result[key],2e-7);
    reference.buses.forEach((bus,j)=>{for(const key of ['vm_pu','theta_deg','p_kw','q_kvar'])close(bus[key],result.buses[j][key],2e-7);});
    reference.branches.forEach((line,j)=>{for(const key of ['current_a','p_from_kw','q_from_kvar','loss_kw'])close(line[key],result.branches[j][key],2e-7);});
    assert.deepEqual(reference.violations,result.violations);
  });
});
