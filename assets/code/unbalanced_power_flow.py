"""Three-bus, four-wire radial AC power flow, using only the standard library.

Loads and generation are per-phase constant PQ, connected phase-to-neutral.
The source neutral is grounded; there are no downstream earth-return paths.
Series matrices include phase-phase mutual reactance and an explicit neutral.
All voltage phasors are RMS. Per-phase power base = total three-phase base / 3.
"""
import cmath
import math

DEFAULTS = dict(load_scale=1., p3_a_kw=90., p3_b_kw=55., p3_c_kw=35.,
                power_factor=.95, dg_kw=50., dg_phase="balanced", slack_pu=1.,
                r_scale=1., x_scale=1., neutral_mode="finite", neutral_scale=1.,
                mutual_ratio=.2, current_limit_a=600., neutral_limit_a=250.,
                open12=False, open23=False)
BASE_MVA, BASE_KV = 1., .4
PHASE_KW = BASE_MVA * 1000 / 3
PHASE_V = BASE_KV * 1000 / math.sqrt(3)
Z_BASE = BASE_KV**2 / BASE_MVA
I_BASE = PHASE_KW * 1000 / PHASE_V


def local(voltage):
    """[Va,Vb,Vc,Vn] in pu -> local phase-to-neutral [Ua,Ub,Uc]."""
    return [v - voltage[3] for v in voltage[:3]]


def sequence(phases):
    """Three complex phasors -> zero/positive/negative sequence and VUF.

    Ratios are None when positive sequence is below 1e-12 pu; the transform
    itself still works, including for pure zero/negative sequence or zero input.
    """
    a = cmath.rect(1., 2 * math.pi / 3)
    zero = sum(phases) / 3
    positive = (phases[0] + a * phases[1] + a**2 * phases[2]) / 3
    negative = (phases[0] + a**2 * phases[1] + a * phases[2]) / 3
    denominator = abs(positive) if abs(positive) > 1e-12 else None
    return dict(zero_pu=[zero.real, zero.imag],
                positive_pu=[positive.real, positive.imag],
                negative_pu=[negative.real, negative.imag],
                vuf_pct=100 * abs(negative) / denominator if denominator else None,
                zero_pct=100 * abs(zero) / denominator if denominator else None)


def phase_components(components):
    """A-phase sequence coefficients -> zero/positive/negative at A, B, C.

    Each stored [real, imaginary] pair is a complex phasor in pu.
    ABC convention: positive is [U1, a²U1, aU1]; negative is [U2, aU2, a²U2].
    """
    a = cmath.rect(1., 2 * math.pi / 3)
    zero = complex(*components["zero_pu"])
    positive = complex(*components["positive_pu"])
    negative = complex(*components["negative_pu"])
    return [[zero, positive, negative],
            [zero, a**2 * positive, a * negative],
            [zero, a * positive, a**2 * negative]]


def reconstruct_sequence(components):
    """Inverse transform: sum the three complex contributions for each phase."""
    return [sum(contributions) for contributions in phase_components(components)]


def network(options=None):
    """Validate the case, convert phase demands to pu, and build 4x4 Z matrices.

    Return settings, source, physical P/Q loads, pu net demands, and branches.
    Internally, bus IDs 1/2/3 are list indices 0/1/2; conductors are A/B/C/N.
    """
    s = {**DEFAULTS, **(options or {})}
    keys = ("load_scale", "p3_a_kw", "p3_b_kw", "p3_c_kw", "power_factor", "dg_kw",
            "slack_pu", "r_scale", "x_scale", "neutral_scale", "mutual_ratio",
            "current_limit_a", "neutral_limit_a")
    for key in keys:
        if not isinstance(s[key], (int, float)) or not math.isfinite(s[key]):
            raise ValueError("Non-finite parameter: " + key)
    if (min(s[k] for k in ("load_scale", "p3_a_kw", "p3_b_kw", "p3_c_kw", "dg_kw", "neutral_scale")) < 0
            or not 0 < s["power_factor"] <= 1 or not 0 <= s["mutual_ratio"] < 1
            or min(s[k] for k in ("slack_pu", "r_scale", "x_scale", "current_limit_a", "neutral_limit_a")) <= 0):
        raise ValueError("Invalid operating parameters")
    if s["neutral_mode"] not in ("finite", "ideal") or s["dg_phase"] not in ("balanced", "a", "b", "c"):
        raise ValueError("Unknown connection setting")
    source = [cmath.rect(s["slack_pu"], angle) for angle in (0, -2*math.pi/3, 2*math.pi/3)] + [0j]
    p_load = [[p * s["load_scale"] for p in row] for row in
              ([0., 0., 0.], [40., 40., 40.], [s["p3_a_kw"], s["p3_b_kw"], s["p3_c_kw"]])]
    q_load = [[p * math.tan(math.acos(s["power_factor"])) for p in row] for row in p_load]
    generation = [s["dg_kw"]/3 if s["dg_phase"] == "balanced" else
                  s["dg_kw"] if s["dg_phase"] == "abc"[i] else 0. for i in range(3)]
    demand = [[complex(p - (generation[i] if bus == 2 else 0), q_load[bus][i]) / PHASE_KW
               for i, p in enumerate(row)] for bus, row in enumerate(p_load)]
    edges = [dict(id="12", f=0, t=1, r=.012, x=.008, rn=.018, xn=.006, active=not s["open12"]),
             dict(id="23", f=1, t=2, r=.008, x=.006, rn=.012, xn=.004, active=not s["open23"])]
    for edge in edges:
        nr = 0. if s["neutral_mode"] == "ideal" else s["neutral_scale"]
        z = [[0j] * 4 for _ in range(4)]
        for i in range(3):
            for j in range(3):
                z[i][j] = (complex(edge["r"]*s["r_scale"], edge["x"]*s["x_scale"]) if i == j
                           else complex(0., edge["x"]*s["x_scale"]*s["mutual_ratio"])) / Z_BASE
        z[3][3] = complex(edge["rn"]*s["r_scale"], edge["xn"]*s["x_scale"]) * nr / Z_BASE
        edge["z"] = z
    return s, source, p_load, q_load, demand, edges


def sweep(demand, edges, source, voltage):
    """One backward-current / forward-voltage pass with an explicit neutral."""
    loads = []
    for bus, v in enumerate(voltage):
        u = local(v)
        if min(map(abs, u)) < .05:
            raise ArithmeticError("Very low phase voltage")
        phases = [(demand[bus][i] / phase).conjugate() for i, phase in enumerate(u)]
        loads.append(phases + [-sum(phases)])
    # Backward: I12 supplies buses 2 + 3; I23 supplies bus 3 (four conductors).
    currents = [[a+b for a, b in zip(loads[1], loads[2])], loads[2]]
    next_v = [source[:]]
    # Forward: V_to = V_from - Z * I, including local neutral voltage.
    for edge, current in zip(edges, currents):
        next_v.append([next_v[edge["f"]][c] - sum(edge["z"][c][j]*current[j] for j in range(4)) for c in range(4)])
    return next_v, currents


def solve(options=None):
    """case -> damped four-wire sweep -> per-phase result dictionary.

    Check ok before reading buses. ok reports convergence; violations lists
    voltage, VUF, phase-current and neutral-current limit violations separately.
    """
    s, source, p_load, q_load, demand, edges = network(options)
    if s["open12"] or s["open23"]:
        return dict(ok=False, reason="island", islands=[2, 3] if s["open12"] else [3], history=[])
    voltage, history = [source[:] for _ in range(3)], []
    converged = False
    for k in range(201):
        try:
            next_v, currents = sweep(demand, edges, source, voltage)
        except ArithmeticError:
            break
        residual = max(abs(next_v[i][c]-voltage[i][c]) for i in range(3) for c in range(4))
        minimum = min(abs(u) for v in voltage for u in local(v))
        history.append(dict(iteration=k, residual_pu=residual, min_vm_pu=minimum))
        if not math.isfinite(residual) or minimum < .1:
            break
        if residual < 1e-10:
            converged = True
            break
        if k == 200:
            break
        voltage = [[voltage[i][c]+.65*(next_v[i][c]-voltage[i][c]) for c in range(4)] for i in range(3)]
    if not converged:
        return dict(ok=False, reason="nonconvergence", history=history)
    buses = []
    for bus, v in enumerate(voltage):
        phases = [dict(phase="abc"[i], u_pu=[u.real, u.imag], vm_pu=abs(u), voltage_v=abs(u)*PHASE_V,
                       theta_deg=math.degrees(cmath.phase(u)), p_load_kw=p_load[bus][i], q_load_kvar=q_load[bus][i],
                       p_net_kw=demand[bus][i].real*PHASE_KW, q_net_kvar=demand[bus][i].imag*PHASE_KW)
                  for i, u in enumerate(local(v))]
        buses.append(dict(id=bus+1, conductors_pu=[[u.real, u.imag] for u in v], phases=phases,
                          neutral_v=abs(v[3])*PHASE_V, components=sequence(local(v))))
    branches = []
    for edge, current in zip(edges, currents):
        sf = sum(v*i.conjugate() for v, i in zip(voltage[edge["f"]], current))*PHASE_KW
        st = -sum(v*i.conjugate() for v, i in zip(voltage[edge["t"]], current))*PHASE_KW
        ia = [abs(i)*I_BASE for i in current]
        branches.append(dict(id=edge["id"], active=True, currents_pu=[[i.real, i.imag] for i in current], current_a=ia,
                             p_from_kw=sf.real, q_from_kvar=sf.imag, p_to_kw=st.real, q_to_kvar=st.imag,
                             loss_kw=sf.real+st.real, neutral_loss_kw=abs(current[3])**2*edge["z"][3][3].real*PHASE_KW,
                             loading_pct=[100*i/(s["neutral_limit_a"] if c == 3 else s["current_limit_a"]) for c, i in enumerate(ia)]))
    violations = []
    for bus in buses:
        violations.extend(dict(kind="voltage", bus=bus["id"], phase=p["phase"]) for p in bus["phases"] if p["vm_pu"] < .95-1e-9 or p["vm_pu"] > 1.05+1e-9)
        if bus["components"]["vuf_pct"] > 2+1e-7:
            violations.append(dict(kind="vuf", bus=bus["id"]))
    for branch in branches:
        violations.extend(dict(kind="current", line=branch["id"], phase="abcn"[c]) for c, value in enumerate(branch["loading_pct"]) if value > 100+1e-7)
    return dict(ok=True, buses=buses, branches=branches, history=history, residual_pu=residual,
                loss_kw=sum(e["loss_kw"] for e in branches), neutral_loss_kw=sum(e["neutral_loss_kw"] for e in branches),
                slack_p_kw=branches[0]["p_from_kw"], slack_q_kvar=branches[0]["q_from_kvar"], violations=violations,
                total_load_kw=sum(sum(row) for row in p_load))


if __name__ == "__main__" and "case" not in globals():
    result = solve()
    for phase in result["buses"][2]["phases"]:
        print(f'Bus 3 phase {phase["phase"]}: {phase["vm_pu"]:.5f} pu, {phase["voltage_v"]:.2f} V')
    print(f'VUF: {result["buses"][2]["components"]["vuf_pct"]:.4f}%')
    print(f'Total loss: {result["loss_kw"]:.4f} kW')
