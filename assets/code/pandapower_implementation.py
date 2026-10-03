"""Real pandapower examples for the interactive teaching chapter (3.2.1).

Run locally: python -m pip install -r requirements-pandapower.txt
            python pandapower_implementation.py
The three-phase model uses sequence impedances and earth return, not the
explicit finite-neutral four-wire model of the preceding chapter.
"""
import json
import math
import pandapower as pp

DEFAULT_CASE = dict(mode="balanced", algorithm="nr", load_scale=1.0,
                    p2_kw=120.0, p3_a_kw=90.0, p3_b_kw=55.0, p3_c_kw=35.0,
                    pf=0.95, dg_kw=50.0, dg_phase="balanced", vm_pu=1.0,
                    z_scale=1.0, zero_ratio=3.0, limit_a=600.0,
                    tie=False, trip12=False, trip23=False, trip13=False)


def settings(case=None):
    c = dict(DEFAULT_CASE, **(case or {}))
    if c["mode"] not in ("balanced", "three_phase"):
        raise ValueError("mode must be balanced or three_phase")
    if c["algorithm"] not in ("nr", "bfsw"):
        raise ValueError("algorithm must be nr or bfsw")
    if c["dg_phase"] not in ("balanced", "a", "b", "c"):
        raise ValueError("dg_phase must be balanced, a, b, or c")
    for key in ("load_scale", "p2_kw", "p3_a_kw", "p3_b_kw", "p3_c_kw", "dg_kw"):
        if not math.isfinite(float(c[key])) or c[key] < 0:
            raise ValueError(key + " must be finite and nonnegative")
    for key in ("z_scale", "zero_ratio", "limit_a", "vm_pu"):
        if not math.isfinite(float(c[key])) or c[key] <= 0:
            raise ValueError(key + " must be finite and positive")
    if not 0 < c["pf"] <= 1:
        raise ValueError("pf must be in (0, 1]")
    return c


def build_network(case=None):
    """Build in physical units: kV, MW, Mvar, ohm/km, km, kA."""
    c = settings(case)
    net = pp.create_empty_network(sn_mva=1.0, f_hz=60.0)
    buses = [pp.create_bus(net, vn_kv=0.4, name=f"Bus {i+1}") for i in range(3)]
    # Positive-sequence slack; 0/2-sequence source impedances follow these
    # illustrative short-circuit parameters, not a physical cable spec.
    pp.create_ext_grid(net, buses[0], vm_pu=c["vm_pu"], va_degree=0,
                       s_sc_max_mva=1000, s_sc_min_mva=1000,
                       rx_max=0.1, rx_min=0.1, r0x0_max=0.1, x0x_max=1.0)
    branches = [(0, 1, .012, .008, not c["trip12"]),
                (1, 2, .008, .006, not c["trip23"]),
                (0, 2, .022, .014, c["tie"] and not c["trip13"])]
    for a, b, r, x, active in branches:
        # Length = 1 km is an equivalent parameterization: length * r/km
        # reproduces the previous balanced chapter's total branch resistance.
        r, x = r * c["z_scale"], x * c["z_scale"]
        pp.create_line_from_parameters(
            net, buses[a], buses[b], length_km=1.0,
            r_ohm_per_km=r, x_ohm_per_km=x, c_nf_per_km=0,
            max_i_ka=c["limit_a"] / 1000, name=f"Line {a+1}-{b+1}",
            in_service=bool(active), r0_ohm_per_km=r*c["zero_ratio"],
            x0_ohm_per_km=x*c["zero_ratio"], c0_nf_per_km=0)
    q_ratio = math.tan(math.acos(c["pf"]))
    phases = [c[f"p3_{phase}_kw"] for phase in "abc"]
    if c["mode"] == "balanced":
        for bus, kw in ((buses[1], c["p2_kw"]), (buses[2], sum(phases))):
            p = kw * c["load_scale"] / 1000
            pp.create_load(net, bus, p_mw=p, q_mvar=p*q_ratio)
        # sgen is fixed PQ; it is not a voltage-controlled PV bus.
        pp.create_sgen(net, buses[2], p_mw=c["dg_kw"]/1000, q_mvar=0)
    else:
        for bus, powers in ((buses[1], [c["p2_kw"]/3]*3), (buses[2], phases)):
            kwargs = {}
            for phase, kw in zip("abc", powers):
                p = kw * c["load_scale"] / 1000
                kwargs[f"p_{phase}_mw"] = p
                kwargs[f"q_{phase}_mvar"] = p*q_ratio
            pp.create_asymmetric_load(net, bus, type="wye", **kwargs)
        generation = [c["dg_kw"]/3]*3 if c["dg_phase"] == "balanced" else [
            c["dg_kw"] if phase == c["dg_phase"] else 0 for phase in "abc"]
        pp.create_asymmetric_sgen(net, buses[2], type="wye",
                                 **{f"p_{p}_mw": kw/1000 for p, kw in zip("abc", generation)})
    return net


def run_network(net, case=None):
    c = settings(case)
    kwargs = dict(numba=False, init="flat", max_iteration=100,
                  tolerance_mva=1e-9, check_connectivity=True)
    if c["mode"] == "balanced":
        pp.runpp(net, algorithm=c["algorithm"], calculate_voltage_angles=True,
                 voltage_depend_loads=False, **kwargs)
    else:
        pp.runpp_3ph(net, calculate_voltage_angles=True, **kwargs)
    return net


def supplied_buses(net):
    """Connectivity for this line-only feeder with ext_grid sources.

    This deliberately small graph routine does not model transformer/switch
    connectivity. Use pandapower.topology for richer network experiments.
    """
    reached = {int(row.bus) for _, row in net.ext_grid.iterrows() if row.in_service}
    while True:
        previous = set(reached)
        for _, line in net.line.iterrows():
            if line.in_service and (int(line.from_bus) in reached or int(line.to_bus) in reached):
                reached.update((int(line.from_bus), int(line.to_bus)))
        if reached == previous:
            return reached


def finite(value):
    return float(value) if math.isfinite(float(value)) else None


def collect_results(net, case=None):
    """Read actual result DataFrames; convert NaN to JSON null, never zero."""
    c = settings(case)
    three = c["mode"] == "three_phase"
    bus_table = net.res_bus_3ph if three else net.res_bus
    line_table = net.res_line_3ph if three else net.res_line
    source_table = net.res_ext_grid_3ph if three else net.res_ext_grid
    reached = supplied_buses(net)
    buses, lines = [], []
    for index, row in bus_table.iterrows():
        voltages = [finite(row[f"vm_{p}_pu"]) for p in "abc"] if three else [finite(row.vm_pu)]
        angles = [finite(row[f"va_{p}_degree"]) for p in "abc"] if three else [finite(row.va_degree)]
        # An unsupplied bus has no operating voltage; some 3ph result paths
        # return zero instead of NaN. Preserve a missing value in the lesson.
        if int(index) not in reached:
            voltages, angles = [None]*len(voltages), [None]*len(angles)
        buses.append(dict(id=int(index), name=str(net.bus.at[index, "name"]),
                          supplied=int(index) in reached, vm_pu=voltages,
                          va_degree=angles, vuf_pct=(finite(row.unbalance_percent) if three else 0.0) if int(index) in reached else None))
    for index, row in line_table.iterrows():
        currents = [finite(1000*max(row[f"i_{p}_from_ka"], row[f"i_{p}_to_ka"])) for p in "abc"] if three else [finite(1000*row.i_ka)]
        loss = sum(row[f"pl_{p}_mw"] for p in "abc") if three else row.pl_mw
        power = sum(row[f"p_{p}_from_mw"] for p in "abc") if three else row.p_from_mw
        lines.append(dict(id=int(index), name=str(net.line.at[index, "name"]),
                          from_bus=int(net.line.at[index, "from_bus"]),
                          to_bus=int(net.line.at[index, "to_bus"]),
                          in_service=bool(net.line.at[index, "in_service"]),
                          loading_pct=finite(row.loading_percent), current_a=currents,
                          loss_kw=finite(loss*1000), p_from_kw=finite(power*1000)))
    source_columns = [f"p_{p}_mw" for p in "abc"] if three else ["p_mw"]
    slack_kw = float(source_table[source_columns].sum().sum()*1000)
    loss_kw = sum(line["loss_kw"] or 0 for line in lines)
    unsupplied = [b["id"] for b in buses if not b["supplied"]]
    voltage_values = [v for b in buses for v in b["vm_pu"] if v is not None]
    max_loading = max((line["loading_pct"] or 0 for line in lines), default=0)
    max_vuf = max((b["vuf_pct"] or 0 for b in buses), default=0)
    violations = []
    if any(v < .95 or v > 1.05 for v in voltage_values):
        violations.append("voltage")
    if max_loading > 100:
        violations.append("current")
    if three and max_vuf > 2:
        violations.append("unbalance")
    if unsupplied:
        violations.append("unsupplied")
    # Balance check uses only served load/generation result tables.
    demand_kw, generation_kw = 0.0, 0.0
    for name, is_generation in (("load", False), ("sgen", True),
                                ("asymmetric_load", False), ("asymmetric_sgen", True)):
        result_name = "res_"+name+("_3ph" if three else "")
        table = net[result_name]
        cols = [f"p_{p}_mw" for p in "abc"] if three else ["p_mw"]
        if not table.empty:
            power_kw = float(table[cols].sum().sum()*1000)
            if is_generation:
                generation_kw += power_kw
            else:
                demand_kw += power_kw
    return dict(ok=bool(net.converged), mode=c["mode"], version=pp.__version__,
                buses=buses, lines=lines, unsupplied=unsupplied,
                slack_kw=slack_kw, loss_kw=loss_kw, min_voltage=min(voltage_values, default=None),
                max_loading=max_loading, max_vuf=max_vuf, violations=violations,
                secure=bool(net.converged) and not violations,
                balance_error_kw=slack_kw+generation_kw-demand_kw-loss_kw)


def solve(case=None):
    c = settings(case)
    net = build_network(c)
    if len(supplied_buses(net)) == 1:
        # runpp_3ph cannot solve an empty set of supplied PQ buses in 3.2.1.
        return dict(ok=False, mode=c["mode"], reason="island",
                    message="No load bus is connected to the source.", unsupplied=[1, 2])
    try:
        run_network(net, c)
    except pp.LoadflowNotConverged as error:
        return dict(ok=False, mode=c["mode"], reason="nonconvergence", message=str(error),
                    unsupplied=sorted(set(map(int, net.bus.index))-supplied_buses(net)))
    return collect_results(net, c)


if __name__ == "__main__" and "case" not in globals():
    for mode in ("balanced", "three_phase"):
        print(json.dumps(solve(dict(mode=mode)), indent=2, allow_nan=False))
