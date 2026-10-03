/* Educational balanced three-phase AC power flow. Series impedances, constant PQ. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BalancedPowerFlow = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const defaults = Object.freeze({ load_scale: 1, power_factor: .95, dg_kw: 50, q_support_kvar: 0, slack_pu: 1, r_scale: 1, x_scale: 1, current_limit_a: 450, topology: "radial", open12: false, open23: false, open13: false });
  const base = Object.freeze({ mva: 1, kv: .4, z_ohm: .16, current_a: 1000 / (Math.sqrt(3) * .4) });
  function network(options = {}) {
    const s = { ...defaults, ...options };
    for (const key of ["load_scale", "power_factor", "dg_kw", "q_support_kvar", "slack_pu", "r_scale", "x_scale", "current_limit_a"]) if (!Number.isFinite(s[key])) throw new RangeError("Non-finite parameter: " + key);
    if (s.load_scale < 0 || s.dg_kw < 0 || s.power_factor <= 0 || s.power_factor > 1 || s.slack_pu <= 0 || s.r_scale <= 0 || s.x_scale <= 0 || s.current_limit_a <= 0) throw new RangeError("Invalid operating parameters");
    if (!["radial", "meshed"].includes(s.topology)) throw new RangeError("Unknown topology");
    const edges = [
      { id: "12", from: 0, to: 1, r: .012, x: .008, active: !s.open12 },
      { id: "23", from: 1, to: 2, r: .008, x: .006, active: !s.open23 },
      { id: "13", from: 0, to: 2, r: .022, x: .014, active: s.topology === "meshed" && !s.open13 }
    ];
    const g = Array.from({ length: 3 }, () => [0, 0, 0]), b = g.map(row => [...row]);
    edges.forEach(e => {
      e.r_pu = e.r * s.r_scale / base.z_ohm; e.x_pu = e.x * s.x_scale / base.z_ohm;
      e.g = e.r_pu / (e.r_pu ** 2 + e.x_pu ** 2); e.b = -e.x_pu / (e.r_pu ** 2 + e.x_pu ** 2);
      if (e.active) for (const matrix of [g, b]) {
        const y = matrix === g ? e.g : e.b;
        matrix[e.from][e.from] += y; matrix[e.to][e.to] += y;
        matrix[e.from][e.to] -= y; matrix[e.to][e.from] -= y;
      }
    });
    const qRatio = Math.tan(Math.acos(s.power_factor));
    const p = [0, -.12 * s.load_scale, (.001 * s.dg_kw) - .18 * s.load_scale];
    const q = [0, -.12 * s.load_scale * qRatio, (.001 * s.q_support_kvar) - .18 * s.load_scale * qRatio];
    return { s, edges, g, b, p, q };
  }
  function injections(net, vm, theta) {
    const p = [0, 0, 0], q = [0, 0, 0];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const d = theta[i] - theta[j], scale = vm[i] * vm[j];
      p[i] += scale * (net.g[i][j] * Math.cos(d) + net.b[i][j] * Math.sin(d));
      q[i] += scale * (net.g[i][j] * Math.sin(d) - net.b[i][j] * Math.cos(d));
    }
    return { p, q };
  }
  function jacobian(net, vm, theta, calculated = injections(net, vm, theta)) {
    const J = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    for (let ii = 0; ii < 2; ii++) for (let jj = 0; jj < 2; jj++) {
      const i = ii + 1, j = jj + 1, G = net.g[i][j], B = net.b[i][j], d = theta[i] - theta[j];
      if (i === j) {
        J[ii][jj] = -calculated.q[i] - B * vm[i] ** 2;
        J[ii][jj + 2] = calculated.p[i] / vm[i] + G * vm[i];
        J[ii + 2][jj] = calculated.p[i] - G * vm[i] ** 2;
        J[ii + 2][jj + 2] = calculated.q[i] / vm[i] - B * vm[i];
      } else {
        J[ii][jj] = vm[i] * vm[j] * (G * Math.sin(d) - B * Math.cos(d));
        J[ii][jj + 2] = vm[i] * (G * Math.cos(d) + B * Math.sin(d));
        J[ii + 2][jj] = -vm[i] * vm[j] * (G * Math.cos(d) + B * Math.sin(d));
        J[ii + 2][jj + 2] = vm[i] * (G * Math.sin(d) - B * Math.cos(d));
      }
    }
    return J;
  }
  function linearSolve(matrix, rhs) {
    const a = matrix.map((row, i) => [...row, rhs[i]]), n = rhs.length;
    for (let k = 0; k < n; k++) {
      let pivot = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
      if (Math.abs(a[pivot][k]) < 1e-12) throw new Error("Singular Jacobian");
      [a[k], a[pivot]] = [a[pivot], a[k]];
      for (let i = k + 1; i < n; i++) {
        const factor = a[i][k] / a[k][k];
        for (let j = k; j <= n; j++) a[i][j] -= factor * a[k][j];
      }
    }
    const answer = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) answer[i] = (a[i][n] - a[i].slice(i + 1, n).reduce((sum, value, j) => sum + value * answer[i + 1 + j], 0)) / a[i][i];
    return answer;
  }
  function mismatch(net, vm, theta) {
    const c = injections(net, vm, theta);
    return [net.p[1] - c.p[1], net.p[2] - c.p[2], net.q[1] - c.q[1], net.q[2] - c.q[2]];
  }
  const norm = values => Math.max(...values.map(Math.abs));
  function solve(options = {}) {
    const net = network(options), s = net.s, seen = new Set([0]);
    for (let pass = 0; pass < 3; pass++) net.edges.forEach(e => { if (e.active && (seen.has(e.from) || seen.has(e.to))) { seen.add(e.from); seen.add(e.to); } });
    if (seen.size !== 3) return { ok: false, reason: "island", islands: [1, 2].filter(i => !seen.has(i)).map(i => i + 1), history: [], branches: net.edges };
    let vm = [s.slack_pu, s.slack_pu, s.slack_pu], theta = [0, 0, 0];
    const history = [];
    let converged = false;
    for (let k = 0; k <= 30; k++) {
      const delta = mismatch(net, vm, theta), residual = norm(delta);
      history.push({ iteration: k, residual_pu: residual, vm_pu: [...vm], theta_rad: [...theta] });
      if (residual < 1e-10) { converged = true; break; }
      if (k === 30) break;
      let step;
      try { step = linearSolve(jacobian(net, vm, theta), delta); } catch (_) { break; }
      let accepted = false;
      for (let alpha = 1; alpha >= 1 / 128; alpha /= 2) {
        const trialTheta = [0, theta[1] + alpha * step[0], theta[2] + alpha * step[1]];
        const trialVm = [s.slack_pu, vm[1] + alpha * step[2], vm[2] + alpha * step[3]];
        if (trialVm[1] > .1 && trialVm[2] > .1 && norm(mismatch(net, trialVm, trialTheta)) < residual) {
          theta = trialTheta; vm = trialVm; accepted = true; break;
        }
      }
      if (!accepted) break;
    }
    if (!converged) return { ok: false, reason: "nonconvergence", history, branches: net.edges };
    const calculated = injections(net, vm, theta);
    const voltages = vm.map((v, i) => [v * Math.cos(theta[i]), v * Math.sin(theta[i])]);
    const branches = net.edges.map(e => {
      if (!e.active) return { ...e, p_from_kw: 0, q_from_kvar: 0, p_to_kw: 0, q_to_kvar: 0, current_a: 0, loading_pct: 0, loss_kw: 0 };
      const dr = voltages[e.from][0] - voltages[e.to][0], di = voltages[e.from][1] - voltages[e.to][1];
      const ir = e.g * dr - e.b * di, im = e.b * dr + e.g * di;
      const power = index => [(voltages[index][0] * ir + voltages[index][1] * im) * 1000, (voltages[index][1] * ir - voltages[index][0] * im) * 1000];
      const from = power(e.from), to = power(e.to), current = Math.hypot(ir, im) * base.current_a;
      return { ...e, p_from_kw: from[0], q_from_kvar: from[1], p_to_kw: -to[0], q_to_kvar: -to[1], current_a: current, loading_pct: current / s.current_limit_a * 100, loss_kw: from[0] - to[0] };
    });
    const buses = vm.map((v, i) => ({ id: i + 1, vm_pu: v, vll_kv: v * base.kv, theta_deg: theta[i] * 180 / Math.PI, p_kw: calculated.p[i] * 1000, q_kvar: calculated.q[i] * 1000 }));
    const violations = [];
    buses.forEach(bus => { if (bus.vm_pu < .95 - 1e-9 || bus.vm_pu > 1.05 + 1e-9) violations.push({ kind: "voltage", id: bus.id }); });
    branches.forEach(e => { if (e.active && e.loading_pct > 100 + 1e-7) violations.push({ kind: "current", id: e.id }); });
    return { ok: true, buses, branches, loss_kw: branches.reduce((sum, e) => sum + e.loss_kw, 0), slack_p_kw: buses[0].p_kw, slack_q_kvar: buses[0].q_kvar, history, residual_pu: history[history.length - 1].residual_pu, violations, y_bus: net.g.map((row, i) => row.map((g, j) => [g, net.b[i][j]])) };
  }
  return Object.freeze({ defaults, base, network, injections, jacobian, solve });
});
