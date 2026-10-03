"""IBR course teaching models; Python standard library only.

Adapted conventions/control laws from PINN-IBR, reviewed 2026-10-03.
These are independently authored teaching realizations, not ibrsim models.
Network: balanced nominal-frequency algebraic impedances. GFL: ideal current
actuator + SRF PLL (4 states); droop: ideal voltage source + PQ filters (3);
VSM: adds rotor speed (4). Parallel: both branches share one PCC (7).
Switch: explicit GFL -> VSM reset, with voltage and frequency matching.
LCL: separate open-loop averaged six-state electrical plant in seconds.
No switching ripple, DC dynamics, saturation, faults, or protection.
"""
import math
import cmath

WB = 2 * math.pi * 50
NAMES = {"gfl": ["delta", "xi_pll", "id", "iq"],
         "droop": ["delta", "Pf", "Qf"],
         "vsm": ["delta", "omega", "Pf", "Qf"]}


def bounded(value, low, high, name):
    value = float(value)
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{name} must be finite and in [{low}, {high}]")
    return value


def settings(case):
    mode = case.get("mode", "droop")
    if mode not in ("frame", "lcl", "gfl", "droop", "vsm", "parallel", "switch", "compare"):
        raise ValueError("Unknown model mode")
    event = case.get("event", "p")
    if event not in ("p", "q", "v", "f"):
        raise ValueError("Unknown disturbance")
    limit = .01 if mode == "lcl" else .5 if event == "f" else .08
    return dict(mode=mode, event=event,
                step=bounded(case.get("step", .005 if mode == "lcl" else .03), -limit, limit, "step"),
                scr=bounded(case.get("scr", 5), 2, 10, "SCR"),
                mp=bounded(case.get("mp", .02), .005, .04, "m_p"),
                inertia=bounded(case.get("inertia", 4), .5, 8, "M"),
                bandwidth=bounded(case.get("bandwidth", 2), .5, 5, "PLL bandwidth"),
                angle=bounded(case.get("angle", 20), -180, 180, "frame angle"),
                dt=bounded(case.get("dt", .0005), .0001, .001, "time step"),
                duration=bounded(case.get("duration", 4), 4, 20, "duration"))


def rk4(rhs, x, h):
    a = rhs(x)
    b = rhs([v + h * d / 2 for v, d in zip(x, a)])
    c = rhs([v + h * d / 2 for v, d in zip(x, b)])
    d = rhs([v + h * e for v, e in zip(x, c)])
    return [v + h * (aa + 2 * bb + 2 * cc + dd) / 6
            for v, aa, bb, cc, dd in zip(x, a, b, c, d)]


def high_voltage_power_flow(s, z):
    """V = 1 + Z conj(S/V), choosing the high-voltage root."""
    a, b = (z * s.conjugate()).real, (z * s.conjugate()).imag
    discriminant = 1 + 4 * a - 4 * b * b
    if discriminant <= 0:
        raise ValueError("No qualified high-voltage equilibrium")
    magnitude_squared = (1 + 2 * a + math.sqrt(discriminant)) / 2
    return complex(magnitude_squared - a, b)


class TeachingCase:
    def __init__(self, kind, cfg):
        self.cfg = cfg
        self.kinds = ["gfl", "droop"] if kind == "parallel" else ["gfl" if kind == "switch" else kind]
        self.zg = complex(1, 10) / (cfg["scr"] * math.sqrt(101))
        self.zf = complex(.00625, .1)
        self.e0, self.commands, self.slices, self.x0 = [], [], [], []
        voltage = high_voltage_power_flow(complex(.6, 0), self.zg)
        current = complex(.6 / len(self.kinds), 0).conjugate() / voltage.conjugate()
        for family in self.kinds:
            start = len(self.x0)
            if family == "gfl":
                local = current * cmath.exp(-1j * cmath.phase(voltage))
                state = [cmath.phase(voltage), 0, local.real, local.imag]
                self.e0.append(1.)
                self.commands.append([.6 / len(self.kinds), 0.])
            else:
                source = voltage + self.zf * current
                state = [cmath.phase(source), .6 / len(self.kinds), 0]
                if family == "vsm":
                    state.insert(1, 1.)
                self.e0.append(1.)
                self.commands.append([.6 / len(self.kinds), (abs(source) - 1) / .0325])
            self.x0.extend(state)
            self.slices.append((start, len(self.x0)))

    def evaluate(self, x, after=False):
        cfg = self.cfg
        step = cfg["step"] if after else 0
        voltage_grid = 1 + (step if cfg["event"] == "v" else 0)
        omega_grid = 1 + (step / 50 if cfg["event"] == "f" else 0)
        dp = step / len(self.kinds) if cfg["event"] == "p" else 0
        dq = step / len(self.kinds) if cfg["event"] == "q" else 0
        forcing, denominator, entries = complex(voltage_grid), complex(1), []
        for j, (family, (start, stop)) in enumerate(zip(self.kinds, self.slices)):
            xb = x[start:stop]
            if family == "gfl":
                value = complex(xb[2], xb[3]) * cmath.exp(1j * xb[0])
                forcing += self.zg * value
            else:
                qf = xb[3] if family == "vsm" else xb[2]
                amplitude = self.e0[j] - .0325 * (qf - self.commands[j][1] - dq)
                if not .5 < amplitude < 1.5:
                    raise ValueError("Voltage source left the teaching model domain")
                value = amplitude * cmath.exp(1j * xb[0])
                forcing += self.zg * value / self.zf
                denominator += self.zg / self.zf
            entries.append(value)
        voltage = forcing / denominator
        if not .5 < abs(voltage) < 1.5:
            raise ValueError("PCC voltage left the teaching model domain")
        derivatives, currents, powers, omegas = [], [], [], []
        for j, (family, (start, stop), value) in enumerate(zip(self.kinds, self.slices, entries)):
            xb = x[start:stop]
            current = value if family == "gfl" else (value - voltage) / self.zf
            s = voltage * current.conjugate()
            p_ref, q_ref = self.commands[j][0] + dp, self.commands[j][1] + dq
            if family == "gfl":
                local = voltage * cmath.exp(-1j * xb[0])
                error = local.imag / abs(voltage)
                wn = 2 * math.pi * cfg["bandwidth"]
                omega = 1 + 2 * .707 * wn / WB * error + wn * wn / WB * xb[1]
                ref = complex(p_ref, -q_ref) / local.conjugate()
                derivative = [WB * (omega - omega_grid), error,
                              (ref.real - xb[2]) / .02, (ref.imag - xb[3]) / .02]
            elif family == "droop":
                omega = 1 - cfg["mp"] * (xb[1] - p_ref)
                derivative = [WB * (omega - omega_grid), (s.real - xb[1]) / .1, (s.imag - xb[2]) / .05]
            else:
                omega = xb[1]
                derivative = [WB * (omega - omega_grid),
                              (p_ref - xb[2] - (omega - 1) / cfg["mp"]) / cfg["inertia"],
                              (s.real - xb[2]) / .1, (s.imag - xb[3]) / .05]
            derivatives.extend(derivative)
            currents.append(current)
            powers.append(s)
            omegas.append(omega)
        current = sum(currents)
        total = voltage * current.conjugate()
        residual = abs(voltage - voltage_grid - self.zg * current)
        return dict(dx=derivatives, voltage=voltage, currents=currents, powers=powers,
                    p=total.real, q=total.imag, v=abs(voltage), frequency=50 * omegas[0],
                    residual=residual, omega=omegas[0])

    def reset_to_vsm(self, x):
        before = self.evaluate(x, True)
        source = before["voltage"] + self.zf * before["currents"][0]
        s, omega = before["powers"][0], before["omega"]
        dp = self.cfg["step"] if self.cfg["event"] == "p" else 0
        dq = self.cfg["step"] if self.cfg["event"] == "q" else 0
        self.commands[0][0] = s.real + (omega - 1) / self.cfg["mp"] - dp
        self.e0[0] = abs(source) + .0325 * (s.imag - self.commands[0][1] - dq)
        self.kinds[0] = "vsm"
        reset = [cmath.phase(source), omega, s.real, s.imag]
        after = self.evaluate(reset, True)
        error = max(abs(after["voltage"] - before["voltage"]), abs(after["p"] - before["p"]),
                    abs(after["q"] - before["q"]), abs(after["omega"] - omega))
        return reset, error


def controller_run(kind, cfg):
    model = TeachingCase(kind, cfg)
    x = model.x0[:]
    initial_residual = max(map(abs, model.evaluate(x)["dx"]))
    time, traces = [], {key: [] for key in ("p", "q", "v", "frequency")}
    if kind == "parallel":
        traces.update(p_gfl=[], p_gfm=[])
    network_residual, reset_error = 0., None
    # Events land exactly on step boundaries; each segment has frozen inputs.
    segments = [(0., 1., False), (1., 2. if kind == "switch" else cfg["duration"], True)]
    if kind == "switch":
        segments.append((2., cfg["duration"], True))
    for segment, (start, stop, after) in enumerate(segments):
        if kind == "switch" and segment == 2:
            x, reset_error = model.reset_to_vsm(x)
        count = math.ceil((stop - start) / cfg["dt"])
        h = (stop - start) / count
        stride = max(1, round(.01 / h))
        for k in range(count + 1):
            if k % stride == 0 or k == count:
                e = model.evaluate(x, after)
                network_residual = max(network_residual, e["residual"])
                time.append(stop if k == count else start + k * h)
                for key in ("p", "q", "v", "frequency"):
                    traces[key].append(e[key])
                if kind == "parallel":
                    traces["p_gfl"].append(e["powers"][0].real)
                    traces["p_gfm"].append(e["powers"][1].real)
            if k < count:
                x = rk4(lambda state: model.evaluate(state, after)["dx"], x, h)
    manifest = [f"{family}.{name}" for family in model.kinds for name in NAMES[family]]
    return dict(time=time, traces=traces, mode=kind, state_count=len(x), state_names=manifest,
                initial_residual=initial_residual, network_residual=network_residual,
                reset_error=reset_error, final_commands=model.commands,
                scope="nominal-frequency algebraic network; ideal current/voltage realization")


def frame_run(cfg):
    offset = cfg["angle"] * math.pi / 180
    time = [k / 10000 for k in range(401)]
    traces = {key: [] for key in ("va", "vb", "vc", "vd", "vq", "p", "q")}
    residual = 0.
    for t in time:
        phases = [WB * t + shift for shift in (0, -2 * math.pi / 3, 2 * math.pi / 3)]
        va = [math.sqrt(2 / 3) * math.cos(p) for p in phases]
        ia = [math.sqrt(2 / 3) * .6 * math.cos(p - math.pi / 6) for p in phases]
        vd = sum(math.sqrt(2 / 3) * math.cos(p + offset) * a for p, a in zip(phases, va))
        vq = sum(-math.sqrt(2 / 3) * math.sin(p + offset) * a for p, a in zip(phases, va))
        id_ = sum(math.sqrt(2 / 3) * math.cos(p + offset) * a for p, a in zip(phases, ia))
        iq = sum(-math.sqrt(2 / 3) * math.sin(p + offset) * a for p, a in zip(phases, ia))
        p, q = vd * id_ + vq * iq, vq * id_ - vd * iq
        residual = max(residual, abs(p - sum(v * i for v, i in zip(va, ia))))
        for key, value in zip(traces, [*va, vd, vq, p, q]):
            traces[key].append(value)
    return dict(time=time, traces=traces, mode="frame", state_count=0, initial_residual=residual,
                network_residual=0., reset_error=None, scope="balanced power-invariant Park transform")


def lcl_run(cfg):
    r1, ell1, cf = .00625, 8.4375e-5, .0008
    zg = complex(1, 10) / (cfg["scr"] * math.sqrt(101))
    r2, ell2 = .00625 + zg.real, (.1 + zg.imag) / WB
    i2 = complex(.6)
    vc = 1 + complex(r2, WB * ell2) * i2
    i1 = i2 + 1j * WB * cf * vc
    u = vc + complex(r1, WB * ell1) * i1
    x = [i1.real, i1.imag, vc.real, vc.imag, i2.real, i2.imag]
    def evaluate(state, after):
        a, v, b = complex(*state[:2]), complex(*state[2:4]), complex(*state[4:])
        command = u + (cfg["step"] if after else 0)
        da = (command - v - r1 * a) / ell1 - 1j * WB * a
        dv = (a - b) / cf - 1j * WB * v
        db = (v - 1 - r2 * b) / ell2 - 1j * WB * b
        denergy = ell1 * (a.conjugate() * da).real + cf * (v.conjugate() * dv).real + ell2 * (b.conjugate() * db).real
        balance = (command * a.conjugate()).real - b.real - r1 * abs(a)**2 - r2 * abs(b)**2
        return [da.real, da.imag, dv.real, dv.imag, db.real, db.imag], abs(denergy - balance)
    initial = max(map(abs, evaluate(x, False)[0]))
    time, traces, residual = [], {key: [] for key in ("i2d", "vcd", "vcq")}, 0.
    for start, stop, after in [(0., .01, False), (.01, .03, True)]:
        count = round((stop - start) / .000002)
        h = (stop - start) / count
        for k in range(count + 1):
            if k % 25 == 0 or k == count:
                time.append(stop if k == count else start + k * h)
                for key, value in zip(traces, [x[4], x[2], x[3]]):
                    traces[key].append(value)
                residual = max(residual, evaluate(x, after)[1])
            if k < count:
                x = rk4(lambda state: evaluate(state, after)[0], x, h)
    return dict(time=time, traces=traces, mode="lcl", state_count=6, initial_residual=initial,
                network_residual=residual, reset_error=None, scope="open-loop six-state averaged LCL; energy balance audit")


def solve(case):
    cfg = settings(case)
    if cfg["mode"] == "frame":
        result = frame_run(cfg)
    elif cfg["mode"] == "lcl":
        result = lcl_run(cfg)
    elif cfg["mode"] == "compare":
        runs = {kind: controller_run(kind, cfg) for kind in ("gfl", "droop", "vsm", "parallel")}
        first = runs["gfl"]
        result = dict(time=first["time"], traces={kind: run["traces"]["p"] for kind, run in runs.items()},
                      mode="compare", state_count=0, initial_residual=max(r["initial_residual"] for r in runs.values()),
                      network_residual=max(r["network_residual"] for r in runs.values()), reset_error=None,
                      runs={kind: {k: v for k, v in run.items() if k not in ("time", "traces")} for kind, run in runs.items()},
                      scope=first["scope"])
    else:
        result = controller_run(cfg["mode"], cfg)
    result["case"] = cfg
    return result


if __name__ == "__main__" and "case" not in globals():
    import json
    result = solve({"mode": "compare", "step": .03})
    print(json.dumps({key: value for key, value in result.items() if key not in ("time", "traces")}, indent=2))
