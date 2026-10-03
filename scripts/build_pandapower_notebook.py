"""Build the downloadable, self-contained course notebook from its model source."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def cell(kind, text):
    result = {"cell_type": kind, "metadata": {}, "source": text.splitlines(keepends=True)}
    if kind == "code":
        result.update(execution_count=None, outputs=[])
    return result


def notebook():
    model = (ROOT / "assets/code/pandapower_implementation.py").read_text()
    # Keep the CLI entry point in the .py; notebook cells run the model explicitly.
    model = model.split('\nif __name__ == "__main__"')[0]
    requirements = (ROOT / "assets/code/requirements-pandapower.txt").read_text()
    packages = [line for line in requirements.splitlines() if line and not line.startswith("#")]
    return {
        "nbformat": 4, "nbformat_minor": 5,
        "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                     "language_info": {"name": "python", "version": "3.12"}},
        "cells": [
            cell("markdown", "# PandaPower-based Implementation\n\n"
                 "400 V microgrid/distribution feeder · pandapower 3.2.1\n\n"
                 "**学习目标 / Learning goals:** construct equipment tables, run balanced and three-phase AC power flow, "
                 "check units and supply, and generate line-outage labels.\n\n"
                 "The three-phase model uses sequence impedance and earth return; it does not reproduce the preceding "
                 "chapter's explicit finite-neutral four-wire model. The limits below are teaching settings.\n"),
            cell("markdown", "## 1. Install the pinned environment / 安装固定版本依赖\n\n"
                 "Use a fresh Python 3.12 environment and run this cell once. Restart the kernel after installation "
                 "if replacing packages that were already imported. Installation needs internet access.\n"),
            cell("code", "%pip install " + " ".join(packages) + "\n"),
            cell("markdown", "## 2. Model source / 模型源码\n\n"
                 "All helper functions are embedded here. `build_network` builds equipment tables, `run_network` solves, "
                 "and `collect_results` checks the line-only feeder. Extend connectivity and balance checks when adding other equipment.\n"),
            cell("code", model + "\n"),
            cell("markdown", "## 3. Balanced baseline / 平衡基准\n\n"
                 "Bus 2: 120 kW; bus 3: 180 kW; PV: 50 kW; PF: 0.95. Voltage base: 0.4 kV line-to-line. "
                 "Expect bus 3 ≈ 0.966565 pu and losses ≈ 6.838895 kW.\n"),
            cell("code", 'case = dict(DEFAULT_CASE)\nnet = build_network(case)\nrun_network(net, case)\n'
                 'display(net.bus, net.line, net.load, net.sgen)\ndisplay(net.res_bus, net.res_line)\n'
                 'balanced = collect_results(net, case)\nprint("Loss (kW):", balanced["loss_kw"])\n'
                 'print("Power-balance residual (kW):", balanced["balance_error_kw"])\n'),
            cell("markdown", "## 4. Same total demand, unequal phases / 同总量下的不平衡\n\n"
                 "Change bus 3 to 90/55/35 kW with equal PV. Compare 60/60/60 kW without changing total demand. "
                 "The source sequence parameters and line zero-sequence impedances are illustrative.\n"),
            cell("code", 'import pandas as pd\ncomparison = []\n'
                 'for name, phases in (("unequal", (90,55,35)), ("equal", (60,60,60))):\n'
                 '    trial = dict(case, mode="three_phase", **dict(zip(("p3_a_kw","p3_b_kw","p3_c_kw"), phases)))\n'
                 '    solved = solve(trial)\n    comparison.append({"case": name, "bus3_voltage": solved["buses"][2]["vm_pu"],\n'
                 '                       "loss_kw": solved["loss_kw"], "vuf_pct": solved["max_vuf"], "secure": solved["secure"]})\n'
                 'display(pd.DataFrame(comparison))\n'),
            cell("markdown", "## 5. Edit and rerun / 修改后重新求解\n\n"
                 "Solar PV here is fixed PQ, not a voltage-controlled PV bus. Changing a current rating changes loading, "
                 "not an unconstrained power-flow operating point.\n"),
            cell("code", 'net.line["max_i_ka"] = 0.3\nrun_network(net, case)\ndisplay(net.res_line)\n'
                 'net.load.loc[net.load.bus == 2, "p_mw"] = .240\n'
                 'net.load.loc[net.load.bus == 2, "q_mvar"] = .240 * math.tan(math.acos(.95))\n'
                 'run_network(net, case)\ndisplay(net.res_bus)\n'),
            cell("markdown", "## 6. N-1 screen / 线路 N-1 筛查\n\n"
                 "Each trial starts from the same base. Supply and limits must be checked in addition to convergence. "
                 "A fixed-PQ inverter cannot supply an isolated network without a modeled grid-forming source.\n"),
            cell("code", 'base = dict(case, tie=True, trip12=False, trip23=False, trip13=False)\nrows = []\n'
                 'for outage in (None, "trip12", "trip23", "trip13"):\n'
                 '    trial = dict(base)\n    if outage:\n        trial[outage] = True\n'
                 '    solved = solve(trial)\n'
                 '    rows.append({"outage": outage or "base", "converged": solved["ok"],\n'
                 '                 "unsupplied": solved.get("unsupplied", []), "min_v_pu": solved.get("min_voltage"),\n'
                 '                 "max_loading_pct": solved.get("max_loading"), "secure": solved.get("secure", False)})\n'
                 'display(pd.DataFrame(rows))\n'),
            cell("markdown", "## 7. Exercises / 练习\n\n"
                 "- Compare `nr` and `bfsw` on the balanced feeder.\n"
                 "- Try phase-A-only PV in three-phase mode.\n"
                 "- Repeat outages with the tie open and record unsupplied buses separately from nonconvergence.\n"
                 "- Export scenario features and labels while preserving bus IDs and phase order.\n\n"
                 "Sources: [pandapower units](https://pandapower.readthedocs.io/en/v3.2.1/about/units.html), "
                 "[three-phase assumptions](https://pandapower.readthedocs.io/en/v3.2.1/powerflow/ac_3ph.html).\n")
        ]
    }


if __name__ == "__main__":
    built = notebook()
    for index, item in enumerate(built["cells"]):
        item["id"] = f"pp-lesson-{index:02d}"
    output = ROOT / "assets/code/pandapower_implementation.ipynb"
    output.write_text(json.dumps(built, ensure_ascii=False, indent=2) + "\n")
    print(output)
