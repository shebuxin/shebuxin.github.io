---
title: "PandaPower-based Implementation"
permalink: /teaching/course-development/physics-informed-gnn/pandapower-based-implementation/
layout: course
pandapower_implementation: true
course_title: "Physics-informed GNN · Microgrids & distribution systems"
parent_url: /teaching/course-development/physics-informed-gnn/
parent_title: "Physics-informed GNN course"
description: "Build and run real pandapower networks in your browser: balanced and three-phase power flow, live controls, editable Python, and N-1 screening."
---

The previous chapters explained the equations. Now turn a feeder diagram into a reproducible computational experiment: create buses and equipment, solve the operating point, inspect the results, and ask what happens when a line goes out of service. This chapter executes **real pandapower 3.2.1** in your browser and connects those results to the first steps of security-data generation.

<nav class="bf-toc" aria-label="Lesson sections"><a href="#background">Model → code</a><a href="#formulation">Equations & units</a><a href="#worked-example">Worked example</a><a href="#interactive-lab">Experiment</a><a href="#code-lab">Python</a><a href="#security">N-1 screening</a><a href="#practice">Practice</a></nav>

## 1. Translate the physical model into tables
{: #background }

Prerequisites: [Balanced Power Flow]({{ '/teaching/course-development/physics-informed-gnn/balanced-power-flow/' | relative_url }}) and [Unbalanced Power Flow]({{ '/teaching/course-development/physics-informed-gnn/unbalanced-power-flow/' | relative_url }}). Keep the same 400 V feeder and total demand so that implementation choices can be compared with equations you already know.

<div class="pp-workflow" role="list" aria-label="Modeling workflow"><div role="listitem"><strong>1 · Describe</strong><code>bus, line, load, sgen</code><span>Topology, impedances, demand, generation</span></div><div role="listitem"><strong>2 · Construct</strong><code>pp.create_*()</code><span>Equipment tables inside net</span></div><div role="listitem"><strong>3 · Solve</strong><code>runpp / runpp_3ph</code><span>AC operating point</span></div><div role="listitem"><strong>4 · Check</strong><code>net.res_*</code><span>Supply, voltage, current, losses</span></div></div>

`net` contains pandas DataFrames. Input tables describe equipment; `res_*` tables contain the latest solved operating point. Changing an input cell does not automatically update the results: **run the solver again**.

| Physical object | Balanced model | Three-phase model | Results to inspect |
|---|---|---|---|
| Bus / voltage base | `create_bus()` | Same, with line-to-line `vn_kv` | `res_bus` / `res_bus_3ph` |
| Upstream source | `create_ext_grid()` | Add source sequence parameters | `res_ext_grid` / `res_ext_grid_3ph` |
| Series branch | `create_line_from_parameters()` | Also provide zero-sequence parameters | `res_line` / `res_line_3ph` |
| Constant-PQ demand | `create_load()` | `create_asymmetric_load()` | Load result tables |
| Fixed-PQ inverter | `create_sgen()` | `create_asymmetric_sgen()` | Generator result tables |

The solar **PV inverter** here is a fixed-PQ `sgen`, with Q = 0. It is not a voltage-controlled **PV bus** in power-flow terminology. A disconnected fixed-PQ inverter also does not become a grid-forming source.

## 2. From equations to API arguments
{: #formulation }

### A. Choose bases and convert units

Enter physical quantities rather than hand-converting every input to pu. For this network, the three-phase base is 1 MVA and the line-to-line voltage base is 0.4 kV:

<div class="bf-equation" data-math="Z_B=\frac{V_{B,LL}^2}{S_{B,3\phi}}=\frac{(0.4\ \mathrm{kV})^2}{1\ \mathrm{MVA}}=0.16\ \Omega"></div>

The line model converts physical impedance to pu internally. For a single equivalent line:

<div class="bf-equation" data-math="Z_1=(r_1+jx_1)\ell,\qquad z_1=Z_1/Z_B"></div>

Here `length_km=1` with `r_ohm_per_km=0.012` gives **0.012 Ω total resistance**. This is an equivalent teaching parameterization, not a specified one-kilometer cable. Shunt capacitance is zero in the example. See the [line model and parameter definitions](https://pandapower.readthedocs.io/en/v3.2.1/elements/line.html).

| Quantity in this lesson | pandapower argument / unit | Example |
|---|---|---|
| 400 V line-to-line | `vn_kv`, kV | `0.4`, not `400` |
| 120 kW three-phase total | `p_mw`, MW in `load` | `0.120` |
| 90 kW on phase A | `p_a_mw`, MW in `asymmetric_load` | `0.090` |
| 600 A phase-current rating | `max_i_ka`, kA | `0.600` |
| 0.012 Ω total series R | `r_ohm_per_km × length_km` | `0.012 × 1` |

Positive load power means consumption; positive `sgen` and `ext_grid` power means generation or supply. Balanced load power is a three-phase aggregate; asymmetric load power is entered phase by phase. Refer to the [unit and sign conventions](https://pandapower.readthedocs.io/en/v3.2.1/about/units.html).

### B. Derive Q from demand and power factor

For lagging constant-PQ loads, reactive demand is positive. The inverter supplies active power independently of the load's power factor:

<div class="bf-equation" data-math="\begin{aligned}Q_D&amp;=P_D\tan(\arccos\mathrm{PF})\\S_i^{inj}&amp;=(P_{G,i}-P_{D,i})+j(Q_{G,i}-Q_{D,i})\\S_i^{inj}&amp;=V_i\left(\sum_jY_{ij}V_j\right)^*\end{aligned}"></div>

For 120 kW at PF = 0.95, Q ≈ 39.442 kvar. In code, that is `p_mw=0.120` and `q_mvar=0.039442`. This lesson uses constant-PQ loads and disables voltage-dependent load behavior. The AC equations include line resistance and reactance and solve for voltage magnitudes and angles.

### C. Choose balanced or three-phase equations deliberately

`runpp(net, algorithm="nr")` solves the balanced AC equations using Newton–Raphson. The experiment also offers `bfsw` to compare a backward/forward sweep. See the [balanced solver options](https://pandapower.readthedocs.io/en/v3.2.1/powerflow/ac.html).

For a symmetric sequence-impedance line, the phase-domain impedance follows:

<div class="bf-equation" data-math="Z_{abc}=A\,\mathrm{diag}(Z_0,Z_1,Z_2)A^{-1},\quad A=\begin{bmatrix}1&amp;1&amp;1\\1&amp;a^2&amp;a\\1&amp;a&amp;a^2\end{bmatrix},\quad a=e^{j2\pi/3}"></div>

In this example Z₂ = Z₁ and Z₀ = κZ₁. κ is the adjustable zero/positive sequence ratio; it is an illustrative modeling parameter. It cannot simply replace the preceding chapter's independently specified neutral impedance.

`runpp_3ph()` couples phase-specific constant-PQ injections through sequence networks: positive sequence uses Newton–Raphson, and zero/negative sequence use current-injection calculations. It needs zero-sequence line data and source sequence impedance information. See the [three-phase solver](https://pandapower.readthedocs.io/en/v3.2.1/powerflow/ac_3ph.html) and [external-grid parameters](https://pandapower.readthedocs.io/en/v3.2.1/elements/ext_grid.html).

<div class="pp-model-note"><strong>Keep the return-path assumptions visible.</strong> The preceding Unbalanced Power Flow chapter solves an explicit four-wire conductor model with finite downstream neutral impedance and no additional earth return. pandapower's three-phase solver uses an earth-return model, with wye neutral and earth treated together. Its results do not directly give that earlier model's neutral displacement. This chapter compares the same demands under a different return-path representation; it does not claim that the unbalanced numerical answers must match.</div>

### D. Read results and verify balance

Line power is positive **into** each end of the branch. Therefore active loss is the sum of the two endpoint injections:

<div class="bf-equation" data-math="P_{loss,ij}=P_{ij}^{from}+P_{ij}^{to},\qquad P_{grid}+P_{PV}-P_{served\ load}=\sum_{ij}P_{loss,ij}"></div>

Balanced `res_line.pl_mw` is already total three-phase loss. For `res_line_3ph`, sum `pl_a_mw + pl_b_mw + pl_c_mw`. Never multiply an aggregate result by three again. A negative `p_from_mw` describes reverse flow, not negative dissipation.

## 3. Worked example: reproduce, then change the model
{: #worked-example }

Bus 2 consumes 120 kW. Bus 3 consumes 180 kW and hosts 50 kW of unity-PF generation. Loads have PF = 0.95. The source positive-sequence voltage is 1 pu. The tie line is open.

| Line | Z₁ (Ω) | Z₀ (Ω), three-phase mode | Current rating |
|---|---|---|---|
| 1–2 | 0.012 + j0.008 | 0.036 + j0.024 | 600 A |
| 2–3 | 0.008 + j0.006 | 0.024 + j0.018 | 600 A |
| 1–3, initially open | 0.022 + j0.014 | 0.066 + j0.042 | 600 A |

The three-phase source uses S<sub>sc,max</sub> = S<sub>sc,min</sub> = 1000 MVA, R/X = 0.1, X₀/X = 1, and R₀/X₀ = 0.1. These parameters supply the source zero/negative-sequence representation; they are teaching assumptions rather than measured feeder data.

**Step 1 — Balanced solve.** Bus 3's three phase-demand controls are summed to 180 kW. `runpp()` gives:

| Result | Value |
|---|---|
| Bus 2 / bus 3 voltage | 0.97559 / 0.96657 pu |
| Total line loss | 6.83889 kW |
| Source supply | 256.83889 kW |
| Line 1–2 current / loading | 399.55 A / 66.592% |

This reproduces the first chapter's balanced baseline. Check 256.83889 + 50 − 300 = 6.83889 kW.

**Step 2 — Keep totals, expose unequal phases.** Switch to three-phase mode. Bus 2 still has 40 / 40 / 40 kW, while bus 3 has 90 / 55 / 35 kW. PV remains equally distributed. With κ = 3:

| Bus 3 result | A | B | C |
|---|---|---|---|
| Voltage (pu) | 0.93382 | 0.97671 | 0.98850 |
| Angle (°) | −0.6311 | −121.2352 | +120.5968 |

Total line loss becomes **8.51027 kW**, line 1–2's highest phase current becomes **557.07 A**, and bus 3 VUF is **0.91098%**. Phase A falls below the teaching voltage band even though total demand is unchanged. The source's phase voltages can differ slightly because its zero/negative-sequence impedances are finite; its positive-sequence voltage is fixed.

**Step 3 — Balance the phases.** Set bus 3 to 60 / 60 / 60 kW. The symmetric three-phase solution recovers the balanced voltage magnitudes and losses to numerical tolerance. Matching this special case checks units, phase-power allocation, and result interpretation.

## 4. Experiment with a real library
{: #interactive-lab }

Start the runtime once, then move the sliders. Compare source voltage, phase allocation, line impedance, PV placement, and current rating. Open the generated construction code to see exactly which arguments each control changes. The code panel below has its own worker, so a code experiment can be stopped separately.

{% include pandapower-lab.html %}

**Try these observations:** changing only the current rating changes loading percentages without changing the unconstrained power-flow solution. Closing the tie redistributes flows. Tripping 2–3 in the radial feeder leaves bus 3 unsupplied; a remaining supplied subnetwork may still converge. Missing bus voltages are shown as “—”, never as valid zero-voltage operating points.

## 5. Edit tables, rerun, and inspect the answer
{: #code-lab }

The panel loads the chapter's Python source, defines `case` from the current controls, and runs your editable experiment. `build_network()`, `run_network()`, and `collect_results()` expose construction, solution, and result reading separately. You can also use `solve(case)` for a complete parameter experiment.

{% include course-code.html prefix="pp" root_id="pandapower-code" source="/assets/code/pandapower_implementation.py" worker="/assets/js/pandapower-worker.js" %}

For a direct table edit in balanced mode, insert this **before** `run_network(net, case)`:

```python
net.load.loc[net.load.bus == 2, "p_mw"] = 0.240
net.load.loc[net.load.bus == 2, "q_mvar"] = 0.240 * math.tan(math.acos(0.95))
```

The diagram numbers buses 1/2/3; pandas indices here are 0/1/2. Retain the integer IDs returned by `create_bus()` when building a larger network, rather than assuming that bus labels equal row indices. The result reader in this example handles the **line-only feeder**; extend its connectivity and power-balance checks when adding transformers, switches, or other equipment.

<div class="pp-downloads"><a href="{{ '/assets/code/pandapower_implementation.ipynb' | relative_url }}" download>Download Notebook (.ipynb)</a><a href="{{ '/assets/code/pandapower_implementation.py' | relative_url }}" download>Download Python model</a><a href="{{ '/assets/code/requirements-pandapower.txt' | relative_url }}" download>Download requirements</a></div>

For a local environment, save the Python model and requirements in one directory, create a Python 3.12 virtual environment, then install and run:

```bash
python -m pip install -r requirements-pandapower.txt
python pandapower_implementation.py
```

The Notebook embeds the model source, so it is self-contained. It includes installation, DataFrame inspection, balanced/three-phase comparison, and an N-1 sweep. The browser pins pandapower 3.2.1 with Pyodide 0.28.3 and disables optional Numba acceleration. First initialization requires internet access; local downloads let you keep a reproducible course experiment.

## 6. From operating points to N-1 labels
{: #security }

An N-1 screen solves the base operating point and each selected single-component outage. A label should include **supply status**, not only `net.converged`. In this teaching network:

<div class="bf-equation" data-math="\mathrm{secure}=\mathrm{converged}\ \land\ \mathrm{all\ buses\ supplied}\ \land\ (0.95\leq|V|\leq1.05)\ \land\ (L_{line}\leq100\%)\ \land\ (\mathrm{VUF}\leq2\%\text{, if 3ph})"></div>

These are chosen teaching limits. This static screen does not assess protection, transient stability, harmonics, or islanded control. Solver failure is a separate outcome; it does not establish physical infeasibility.

Paste this into the Python editor. A closed tie gives an alternate supply path; each trial begins from the same base case:

```python
import pandas as pd
base = dict(case, tie=True, trip12=False, trip23=False, trip13=False)
rows = []
for outage in (None, "trip12", "trip23", "trip13"):
    trial = dict(base)
    if outage:
        trial[outage] = True
    solved = solve(trial)
    rows.append({
        "outage": outage or "base",
        "converged": solved["ok"],
        "unsupplied": solved.get("unsupplied", []),
        "min_v_pu": solved.get("min_voltage"),
        "max_loading_pct": solved.get("max_loading"),
        "secure": solved.get("secure", False),
    })
    if solved["ok"]:
        result = solved
print(pd.DataFrame(rows).to_string(index=False))
```

For a future GNN dataset, retain bus demand/generation and voltage bases as node features; impedance, rating, and outage status as edge features. Save solved voltages, loading, unsupplied flags, and solver outcome separately as labels or metadata. Keep bus IDs and phase order consistent across cases. Split evaluation by operating scenario or topology so that closely related contingency cases do not leak across training and test sets.

## 7. Predict, test, explain
{: #practice }

1. Compare `nr` and `bfsw` in balanced mode. Are the converged operating points equal within numerical tolerance?
2. Set bus 3 to 60/60/60, then to 90/55/35 kW. Explain why `runpp()` is unchanged while `runpp_3ph()` responds.
3. Reduce the line rating from 600 to 300 A. Explain why overload appears without automatic curtailment: ordinary power flow does not enforce the thermal limit.
4. Run the N-1 sweep with the tie closed, then repeat with it open. Distinguish a voltage violation, an unsupplied bus, and solver nonconvergence.

<form class="bf-quiz pp-quiz"><fieldset><legend>If a radial feeder's last line trips and net.converged is True, what should you conclude?</legend><label><input type="radio" name="pp-answer" value="safe">The entire feeder is secure.</label><label><input type="radio" name="pp-answer" value="zero">The isolated load has a valid 0 pu voltage.</label><label><input type="radio" name="pp-answer" value="supply">Check unsupplied buses and operating limits before assigning a security label.</label><button type="submit" class="btn">Check answer</button><p data-quiz-feedback role="status" aria-live="polite"></p></fieldset></form>

Use the expandable Python source to connect each API call to its equation, then keep the Notebook as the starting point for your own feeder and course examples.
