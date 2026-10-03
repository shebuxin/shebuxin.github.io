"""Balanced three-phase AC power flow. Pure Python; no third-party packages.

All P/Q values are three-phase totals. Positive net injections supply the network.
The per-phase series impedances are converted using V_LL,base**2 / S_3phase,base.
Bus 1 is slack; buses 2 and 3 are constant PQ (including the fixed-PQ inverter).
"""
import cmath
import math

DEFAULTS = dict(load_scale=1., power_factor=.95, dg_kw=50., q_support_kvar=0.,
                slack_pu=1., r_scale=1., x_scale=1., current_limit_a=450.,
                topology="radial", open12=False, open23=False, open13=False)
BASE_MVA, BASE_KV = 1., .4
Z_BASE = BASE_KV**2 / BASE_MVA
I_BASE = BASE_MVA * 1000 / (math.sqrt(3) * BASE_KV)


def network(options=None):
    s = {**DEFAULTS, **(options or {})}
    for key in ("load_scale", "power_factor", "dg_kw", "q_support_kvar", "slack_pu", "r_scale", "x_scale", "current_limit_a"):
        if not isinstance(s[key], (int, float)) or not math.isfinite(s[key]):
            raise ValueError("Non-finite parameter: " + key)
    if (s["load_scale"] < 0 or s["dg_kw"] < 0 or not 0 < s["power_factor"] <= 1
            or min(s["slack_pu"], s["r_scale"], s["x_scale"], s["current_limit_a"]) <= 0):
        raise ValueError("Invalid operating parameters")
    if s["topology"] not in ("radial", "meshed"):
        raise ValueError("Unknown topology")
    edges = [dict(id="12", f=0, t=1, r=.012, x=.008, active=not s["open12"]),
             dict(id="23", f=1, t=2, r=.008, x=.006, active=not s["open23"]),
             dict(id="13", f=0, t=2, r=.022, x=.014,
                  active=s["topology"] == "meshed" and not s["open13"])]
    y = [[0j for _ in range(3)] for _ in range(3)]
    for e in edges:
        e["z"] = complex(e["r"] * s["r_scale"], e["x"] * s["x_scale"]) / Z_BASE
        if e["active"]:
            adm = 1 / e["z"]
            i, j = e["f"], e["t"]
            y[i][i] += adm; y[j][j] += adm
            y[i][j] -= adm; y[j][i] -= adm
    q_ratio = math.tan(math.acos(s["power_factor"]))
    p = [0., -.12 * s["load_scale"], .001 * s["dg_kw"] - .18 * s["load_scale"]]
    q = [0., -.12 * s["load_scale"] * q_ratio,
         .001 * s["q_support_kvar"] - .18 * s["load_scale"] * q_ratio]
    return s, edges, y, p, q


def injections(y, vm, theta):
    v = [cmath.rect(m, a) for m, a in zip(vm, theta)]
    power = [v[i] * sum(y[i][j] * v[j] for j in range(3)).conjugate() for i in range(3)]
    return [s.real for s in power], [s.imag for s in power]


def jacobian(y, vm, theta):
    p, q = injections(y, vm, theta)
    jmat = [[0.] * 4 for _ in range(4)]
    for ii, i in enumerate((1, 2)):
        for jj, j in enumerate((1, 2)):
            g, b = y[i][j].real, y[i][j].imag
            d = theta[i] - theta[j]
            if i == j:
                h = -q[i] - b * vm[i]**2
                n = p[i] / vm[i] + g * vm[i]
                m = p[i] - g * vm[i]**2
                l = q[i] / vm[i] - b * vm[i]
            else:
                h = vm[i] * vm[j] * (g * math.sin(d) - b * math.cos(d))
                n = vm[i] * (g * math.cos(d) + b * math.sin(d))
                m = -vm[i] * vm[j] * (g * math.cos(d) + b * math.sin(d))
                l = vm[i] * (g * math.sin(d) - b * math.cos(d))
            jmat[ii][jj], jmat[ii][jj+2] = h, n
            jmat[ii+2][jj], jmat[ii+2][jj+2] = m, l
    return jmat


def linear_solve(matrix, rhs):
    a = [list(row) + [value] for row, value in zip(matrix, rhs)]
    n = len(rhs)
    for k in range(n):
        pivot = max(range(k, n), key=lambda i: abs(a[i][k]))
        if abs(a[pivot][k]) < 1e-12:
            raise ArithmeticError("Singular Jacobian")
        a[k], a[pivot] = a[pivot], a[k]
        for i in range(k+1, n):
            factor = a[i][k] / a[k][k]
            for j in range(k, n+1):
                a[i][j] -= factor * a[k][j]
    answer = [0.] * n
    for i in range(n-1, -1, -1):
        answer[i] = (a[i][n] - sum(a[i][j] * answer[j] for j in range(i+1, n))) / a[i][i]
    return answer


def solve(options=None):
    s, edges, y, p_spec, q_spec = network(options)
    seen = {0}
    for _ in range(3):
        for e in edges:
            if e["active"] and (e["f"] in seen or e["t"] in seen):
                seen.update((e["f"], e["t"]))
    if len(seen) != 3:
        return dict(ok=False, reason="island", islands=[i+1 for i in (1, 2) if i not in seen], history=[])
    vm, theta, history = [s["slack_pu"]] * 3, [0.] * 3, []

    def mismatch(magnitude, angle):
        p, q = injections(y, magnitude, angle)
        return [p_spec[1]-p[1], p_spec[2]-p[2], q_spec[1]-q[1], q_spec[2]-q[2]]

    for k in range(31):
        delta = mismatch(vm, theta)
        residual = max(map(abs, delta))
        history.append(dict(iteration=k, residual_pu=residual, vm_pu=vm[:], theta_rad=theta[:]))
        if residual < 1e-10:
            break
        if k == 30:
            return dict(ok=False, reason="nonconvergence", history=history)
        try:
            step = linear_solve(jacobian(y, vm, theta), delta)
        except ArithmeticError:
            return dict(ok=False, reason="nonconvergence", history=history)
        accepted, alpha = False, 1.
        while alpha >= 1/128:
            trial_t = [0., theta[1]+alpha*step[0], theta[2]+alpha*step[1]]
            trial_v = [s["slack_pu"], vm[1]+alpha*step[2], vm[2]+alpha*step[3]]
            if min(trial_v[1:]) > .1 and max(map(abs, mismatch(trial_v, trial_t))) < residual:
                vm, theta, accepted = trial_v, trial_t, True
                break
            alpha /= 2
        if not accepted:
            return dict(ok=False, reason="nonconvergence", history=history)
    p, q = injections(y, vm, theta)
    v = [cmath.rect(m, a) for m, a in zip(vm, theta)]
    branches = []
    for e in edges:
        i, j = e["f"], e["t"]
        current = (v[i] - v[j]) / e["z"] if e["active"] else 0j
        sf = v[i] * current.conjugate() * 1000
        st = -v[j] * current.conjugate() * 1000
        ia = abs(current) * I_BASE
        branches.append(dict(id=e["id"], active=e["active"], p_from_kw=sf.real,
                             q_from_kvar=sf.imag, p_to_kw=st.real, q_to_kvar=st.imag,
                             current_a=ia, loading_pct=ia/s["current_limit_a"]*100,
                             loss_kw=sf.real+st.real))
    buses = [dict(id=i+1, vm_pu=vm[i], vll_kv=vm[i]*BASE_KV,
                  theta_deg=math.degrees(theta[i]), p_kw=p[i]*1000, q_kvar=q[i]*1000)
             for i in range(3)]
    violations = [dict(kind="voltage", id=b["id"]) for b in buses if b["vm_pu"] < .95-1e-9 or b["vm_pu"] > 1.05+1e-9]
    violations += [dict(kind="current", id=e["id"]) for e in branches if e["active"] and e["loading_pct"] > 100+1e-7]
    return dict(ok=True, buses=buses, branches=branches,
                loss_kw=sum(e["loss_kw"] for e in branches), slack_p_kw=p[0]*1000,
                slack_q_kvar=q[0]*1000, residual_pu=residual, history=history,
                violations=violations,
                y_bus=[[[value.real, value.imag] for value in row] for row in y])


if __name__ == "__main__" and "case" not in globals():
    result = solve()
    for bus in result["buses"]:
        print(f'Bus {bus["id"]}: {bus["vm_pu"]:.5f} pu, {bus["theta_deg"]:.4f} deg')
    print(f'Total loss: {result["loss_kw"]:.4f} kW')
