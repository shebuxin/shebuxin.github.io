---
title: "Balanced Power Flow"
permalink: /teaching/course-development/physics-informed-gnn/balanced-power-flow/
layout: course
balanced_power_flow: true
course_title: "Physics-informed GNN · Microgrids & distribution systems"
parent_url: /teaching/course-development/physics-informed-gnn/
parent_title: "Physics-informed GNN course"
description: "An interactive lesson on balanced three-phase AC power flow, with derivations, a worked feeder example, parameter experiments, and editable Python."
---

Why does a feeder's voltage fall when demand increases? Can local generation reverse a line's power flow? How does reactive support change the result? In this lesson, derive the model, solve a concrete example, and test your predictions with an interactive experiment and Python.

<nav class="bf-toc" aria-label="Lesson sections"><a href="#background">Background</a><a href="#formulation">Derivation</a><a href="#worked-example">Worked example</a><a href="#interactive-lab">Experiment</a><a href="#code-lab">Python</a><a href="#practice">Practice</a></nav>

## 1. Background: a snapshot of a microgrid
{: #background }

A power-flow calculation describes a **steady-state operating point**. Given network impedances, loads, generation, and a voltage reference, we solve for bus voltages and then calculate line currents, power transfers, and losses. For a microgrid or distribution feeder, these quantities help us inspect voltage drop, reverse flow, and loading before and after a switching action.

In a balanced three-phase system, phase magnitudes are equal and phase angles are separated by 120°. With symmetric impedances and balanced injections, one phase or the positive-sequence equivalent is sufficient. **Balanced does not mean every bus has the same voltage, or that reactive power is zero.**

<div class="bf-equation" data-math="\begin{aligned}V_a&amp;=v e^{j\theta}\\V_b&amp;=v e^{j(\theta-2\pi/3)}\\V_c&amp;=v e^{j(\theta+2\pi/3)}\end{aligned}"></div>

{% include balanced-overview.html %}

This chapter uses a balanced AC model, not the lossless DC approximation in the earlier Power Flow demo. It includes resistance, reactive power, and voltage magnitudes. Loads are constant PQ. A fixed-PQ inverter at bus 3 supplies specified active and reactive power; it does not regulate voltage as a PV bus.

For the later N-1 prediction task, a topology and operating point become model inputs, and solved voltages/currents can become labels or physical consistency checks. A converged solution is **not automatically a secure operating point**: we must separately check limits, connectivity, and the scope of the model. Dynamic stability and protection behavior require additional analysis.

## 2. Derive the balanced AC equations
{: #formulation }

### Step A — Choose consistent bases

Use three-phase apparent-power base S<sub>B</sub> and line-to-line voltage base V<sub>LL,B</sub>. The phase-voltage base is V<sub>LL,B</sub>/√3. The impedance base is a **per-phase** impedance; P and Q expressed on this power base are **three-phase totals**.

<div class="bf-equation" data-math="\begin{aligned}Z_B&amp;=\frac{V_{LL,B}^{2}}{S_B},\qquad I_B=\frac{S_B}{\sqrt{3}V_{LL,B}}\\z_{ij}^{pu}&amp;=\frac{r_{ij}+jx_{ij}}{Z_B},\qquad S_i^{pu}=\frac{P_i+jQ_i}{S_B}\end{aligned}"></div>

For S<sub>B</sub> = 1 MVA and V<sub>LL,B</sub> = 0.4 kV, Z<sub>B</sub> = 0.16 Ω and I<sub>B</sub> = 1443.38 A. Do not divide the total three-phase power by three again after applying these bases.

### Step B — Build the network admittance matrix

For a series branch, y<sub>ij</sub> = 1/z<sub>ij</sub>. Add its admittance to both diagonal entries and subtract it from the two corresponding off-diagonal entries. Opening a line removes those four contributions. This example omits line charging, shunts, transformers, and mutual coupling.

<div class="bf-equation" data-math="\begin{aligned}Y_{ii}&amp;=\sum_{k\in\mathcal N_i}y_{ik}\\Y_{ij}&amp;=-y_{ij}\quad(i\ne j),\qquad \boldsymbol I=Y_{bus}\boldsymbol V\end{aligned}"></div>

### Step C — Convert currents into complex-power injections

Take **positive net injection as supply to the network**: P<sup>spec</sup> = P<sub>G</sub> − P<sub>D</sub> and Q<sup>spec</sup> = Q<sub>G</sub> − Q<sub>D</sub>. For V<sub>i</sub> = v<sub>i</sub>e<sup>jθᵢ</sup>, combine Kirchhoff's current law with S = VI*:

<div class="bf-equation" data-math="S_i=V_i I_i^*=V_i\left(\sum_j Y_{ij}V_j\right)^*"></div>

Write Y<sub>ij</sub> = G<sub>ij</sub> + jB<sub>ij</sub> and δ<sub>ij</sub> = θ<sub>i</sub> − θ<sub>j</sub>. Expanding the complex product gives two real equations at each bus:

<div class="bf-equation" data-math="\begin{aligned}P_i&amp;=\sum_j v_i v_j\bigl(G_{ij}\cos\delta_{ij}+B_{ij}\sin\delta_{ij}\bigr)\\Q_i&amp;=\sum_j v_i v_j\bigl(G_{ij}\sin\delta_{ij}-B_{ij}\cos\delta_{ij}\bigr)\end{aligned}"></div>

These equations retain resistance and reactive coupling. That matters in a distribution feeder, where an approximation that discards R can miss an important part of voltage drop and losses.

### Step D — Decide what is known at each bus

| Bus type | Specified | Solved |
|---|---|---|
| Slack / reference | Voltage magnitude and angle | P and Q injection |
| PQ | Net P and Q | Voltage magnitude and angle |
| PV | P and voltage magnitude | Q and angle |

The experiment has **one slack bus and two PQ buses**. Its four unknowns are x = [θ₂, θ₃, v₂, v₃]<sup>T</sup>. The PV type is included above for context; this lesson's inverter is represented as a PQ injection. This bus classification and nonlinear power-balance formulation are described in the [MATPOWER AC power-flow manual](https://matpower.app/manual/matpower/ACPowerFlow.html).

### Step E — Solve with Newton–Raphson

Start with flat voltages and zero angles. Compute the mismatch between specified and calculated P/Q. Let J be the derivatives of the **calculated** injections with respect to x, so the update sign below is positive:

<div class="bf-equation" data-math="\begin{aligned}\Delta\boldsymbol s&amp;=\begin{bmatrix}P_2^{spec}-P_2\\P_3^{spec}-P_3\\Q_2^{spec}-Q_2\\Q_3^{spec}-Q_3\end{bmatrix}\\J&amp;=\begin{bmatrix}H&amp;N\\M&amp;L\end{bmatrix}=\frac{\partial(P,Q)}{\partial(\theta,v)}\end{aligned}"></div>
<div class="bf-equation" data-math="\begin{aligned}J(x^{(k)})\Delta x^{(k)}&amp;=\Delta\boldsymbol s^{(k)}\\x^{(k+1)}&amp;=x^{(k)}+\alpha\Delta x^{(k)}\end{aligned}"></div>

The implementation uses an analytic Jacobian, pivoted elimination, and a backtracking step α to reduce the mismatch while keeping positive voltage magnitudes. It stops when ‖Δs‖∞ &lt; 10<sup>−10</sup> pu, or reports failure after a stalled step or 30 updates. Failure of this algorithm alone does not prove that no physical solution exists.

<details class="bf-details"><summary>Show the Jacobian entries</summary><p>For i ≠ j:</p><div class="bf-equation" data-math="\begin{aligned}H_{ij}&amp;=v_i v_j(G_{ij}\sin\delta_{ij}-B_{ij}\cos\delta_{ij})\\N_{ij}&amp;=v_i(G_{ij}\cos\delta_{ij}+B_{ij}\sin\delta_{ij})\\M_{ij}&amp;=-v_i v_j(G_{ij}\cos\delta_{ij}+B_{ij}\sin\delta_{ij})\\L_{ij}&amp;=v_i(G_{ij}\sin\delta_{ij}-B_{ij}\cos\delta_{ij})\end{aligned}"></div><p>For i = j:</p><div class="bf-equation" data-math="\begin{aligned}H_{ii}&amp;=-Q_i-B_{ii}v_i^2\\N_{ii}&amp;=P_i/v_i+G_{ii}v_i\\M_{ii}&amp;=P_i-G_{ii}v_i^2\\L_{ii}&amp;=Q_i/v_i-B_{ii}v_i\end{aligned}"></div><p>The corresponding complex-matrix derivatives are documented in <a href="https://matpower.org/documentation/ref-manual/legacy/functions/dSbus_dV.html">MATPOWER's voltage-derivative reference</a>.</p></details>

### Step F — Recover branch flows and losses

For each active line, calculate the current and the powers injected into the line at both ends. Their sum is the branch's complex loss. Since this model contains only series impedance, current magnitude is the same at both ends.

<div class="bf-equation" data-math="\begin{aligned}I_{ij}&amp;=(V_i-V_j)/z_{ij}\\S_{ij}&amp;=V_i I_{ij}^*,\qquad S_{ji}=-V_j I_{ij}^*\\P_{loss,ij}&amp;=P_{ij}+P_{ji}=r_{ij}|I_{ij}|^2\end{aligned}"></div>

## 3. Worked example: a 400 V feeder
{: #worked-example }

Bus 1 holds 1∠0° pu. Bus 2 consumes 120 kW; bus 3 consumes 180 kW and has a 50 kW unity-power-factor generator. Both loads operate at 0.95 lagging power factor. The radial lines have these per-phase impedances:

| Line | Impedance (Ω) | Impedance (pu) |
|---|---|---|
| 1–2 | 0.012 + j0.008 | 0.075 + j0.050 |
| 2–3 | 0.008 + j0.006 | 0.050 + j0.0375 |
| 1–3, normally open tie | 0.022 + j0.014 | 0.1375 + j0.0875 |

**1. Convert load power factors.** Q<sub>D</sub> = P<sub>D</sub> tan(arccos 0.95), giving 39.44 kvar at bus 2 and 59.16 kvar at bus 3.

**2. Form net injections.** S₂<sup>spec</sup> = −0.120 − j0.03944 pu and S₃<sup>spec</sup> = −0.130 − j0.05916 pu. The 50 kW generator offsets part of bus 3's active demand; it does not offset its reactive demand.

**3. Take the first Newton step.** At the flat start, calculated injections are zero, so the mismatch is [−0.120, −0.130, −0.03944, −0.05916]<sup>T</sup>. Build J at that operating point, solve for Δx, and repeat.

**4. Check the solution.** The baseline gives |V₂| ≈ **0.97559 pu**, |V₃| ≈ **0.96657 pu**, θ₂ ≈ **−0.2994°**, θ₃ ≈ **−0.4159°**, and total active loss ≈ **6.8389 kW**. The slack supplies approximately **256.8389 kW**, satisfying 256.8389 + 50 − 300 = 6.8389 kW.

Predict what doubling both loads will do before selecting **High demand** below. Compare the resulting voltage drop and loss with the baseline; the relationship is nonlinear.

## 4. Experiment: change the operating point
{: #interactive-lab }

Move one control at a time. The network, phase diagram, voltage profile, current loading, and Newton-iteration table all recompute from the same operating point. Opening a radial branch isolates buses; a closed tie can provide an alternative path.

{% include balanced-lab.html %}

## 5. Edit and run Python
{: #code-lab }

The slider experiment uses a browser-native solver for immediate feedback. The editable Python solver implements the same equations and is checked against it. Editing the solver changes the **code result**, while the parameter experiment remains a reference. Try setting `case["q_support_kvar"] = 60` before `solve(case)`, then compare the voltage and losses.

{% include balanced-code.html %}

## 6. Practice and explain
{: #practice }

<form class="bf-quiz"><fieldset><legend>What does “balanced” require at a bus?</legend><label><input type="radio" name="bf-balance" value="phase"> Equal phase-voltage magnitudes with 120° separation.</label><label><input type="radio" name="bf-balance" value="bus"> The same voltage magnitude at every bus.</label><label><input type="radio" name="bf-balance" value="reactive"> Zero reactive power everywhere.</label></fieldset><button class="btn" type="submit">Check answer</button><p data-quiz-feedback role="status" aria-live="polite"></p></form>

1. **Power factor:** hold active demand fixed and reduce the load power factor from 0.95 to 0.80. Record the current, minimum voltage, and loss. Explain the change using S = P + jQ and I = (S/V)*.
2. **Reactive support:** at demand multiplier 2.0, inject 60 kvar at bus 3. Compare with the unsupported case. Can all voltage violations be removed? Test rather than assume.
3. **N-1 topology:** open line 1–2 in the radial case, then repeat with the tie closed. Distinguish an isolated bus, a converged but limit-violating state, and a state within the teaching limits.
4. **Write a sweep:** in Python, solve for demand multipliers from 0.5 to 2.0. Print |V₃| and loss at each step. Keep the result dictionary from the last successful solve to display its voltage profile.

## 7. Scope and next steps

This is a steady-state, balanced, constant-PQ teaching model with a fixed slack voltage. It omits phase imbalance, voltage-dependent loads, transformer/tap models, inverter capability limits, source limits, line charging, and protection. An isolated component is reported as outside the single-slack model; its DG is not automatically converted into a grid-forming source. Use the next [Unbalanced Power Flow]({{ '/teaching/course-development/physics-informed-gnn/unbalanced-power-flow/' | relative_url }}) module to relax phase symmetry, and **PandaPower-based Implementation** for a broader modeling workflow.

### References
{: #references }

* [MATPOWER: AC power-flow formulation](https://matpower.app/manual/matpower/ACPowerFlow.html) — bus types and Newton formulation.
* [MATPOWER: power-injection derivatives](https://matpower.org/documentation/ref-manual/legacy/functions/dSbus_dV.html) — analytic voltage sensitivities.
* [pandapower: balanced AC power flow](https://pandapower.readthedocs.io/en/stable/powerflow/ac.html) — algorithms for the later implementation module.
* [Pyodide: Python in a browser worker](https://pyodide.org/en/stable/usage/webworker.html) — the code runner's execution approach.
