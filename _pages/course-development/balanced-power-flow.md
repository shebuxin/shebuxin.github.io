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

### Modeling assumptions

The equations and experiments in this chapter use the following assumptions:

- **Sinusoidal steady state:** voltages and currents are represented by RMS complex phasors.
- **Balanced three-phase operation:** the network is symmetric, and loads and distributed generation are balanced across the three phases. We use a single-phase equivalent, with P and Q expressed as three-phase totals.
- **Series line impedances:** each line has resistance R and reactance X. Line charging, shunts, and transformers are omitted.
- **Constant-PQ loads and distributed generation:** active power P and reactive power Q are specified at each operating point and remain fixed as the solver updates voltage. The model solves for both voltage magnitude and angle.
- **One voltage reference:** a slack bus has a specified voltage magnitude and angle. Its active and reactive supply balance the remaining network injections and line losses.

These assumptions define the general model. The worked example below introduces a specific feeder, assigns bus numbers, and sets its loads and generation.

For the later N-1 prediction task, a topology and operating point become model inputs, and solved voltages/currents can become labels or physical consistency checks. A converged solution is **not automatically a secure operating point**: we must separately check limits, connectivity, and the scope of the model. Dynamic stability and protection behavior require additional analysis.

## 2. Derive the balanced AC equations
{: #formulation }

### Step A — Choose consistent bases

Use three-phase apparent-power base S<sub>B</sub> and line-to-line voltage base V<sub>LL,B</sub>. The phase-voltage base is V<sub>LL,B</sub>/√3. The impedance base is a **per-phase** impedance; P and Q expressed on this power base are **three-phase totals**.

<div class="bf-equation" data-math="\begin{aligned}Z_B&amp;=\frac{V_{LL,B}^{2}}{S_B},\qquad I_B=\frac{S_B}{\sqrt{3}V_{LL,B}}\\z_{ij}^{pu}&amp;=\frac{r_{ij}+jx_{ij}}{Z_B},\qquad S_i^{pu}=\frac{P_i+jQ_i}{S_B}\end{aligned}"></div>

Choose the bases before converting line impedances and power injections to per unit. Do not divide the total three-phase power by three again after applying the three-phase power base.

### Step B — Build the network admittance matrix

For a series branch, y<sub>ij</sub> = 1/z<sub>ij</sub>. Add its admittance to both diagonal entries and subtract it from the two corresponding off-diagonal entries. Opening a line removes those four contributions. This example omits line charging, shunts, transformers, and mutual coupling.

<div class="bf-equation" data-math="\begin{aligned}Y_{ii}&amp;=\sum_{k\in\mathcal N_i}y_{ik}\\Y_{ij}&amp;=-y_{ij}\quad(i\ne j),\qquad \boldsymbol I=Y_{bus}\boldsymbol V\end{aligned}"></div>

{% include power-flow-illustration.html kind="admittance" %}

### Step C — Convert currents into complex-power injections

Take **positive net injection as supply to the network**: P<sup>spec</sup> = P<sub>G</sub> − P<sub>D</sub> and Q<sup>spec</sup> = Q<sub>G</sub> − Q<sub>D</sub>. For V<sub>i</sub> = v<sub>i</sub>e<sup>jθᵢ</sup>, combine Kirchhoff's current law with S = VI*:

<div class="bf-equation" data-math="S_i=V_i I_i^*=V_i\left(\sum_j Y_{ij}V_j\right)^*"></div>

{% include power-flow-illustration.html kind="injection" %}

Write Y<sub>ij</sub> = G<sub>ij</sub> + jB<sub>ij</sub> and δ<sub>ij</sub> = θ<sub>i</sub> − θ<sub>j</sub>. Expanding the complex product gives two real equations at each bus:

<div class="bf-equation" data-math="\begin{aligned}P_i&amp;=\sum_j v_i v_j\bigl(G_{ij}\cos\delta_{ij}+B_{ij}\sin\delta_{ij}\bigr)\\Q_i&amp;=\sum_j v_i v_j\bigl(G_{ij}\sin\delta_{ij}-B_{ij}\cos\delta_{ij}\bigr)\end{aligned}"></div>

These equations retain resistance and reactive coupling. That matters in a distribution feeder, where an approximation that discards R can miss an important part of voltage drop and losses.

### Step D — Decide what is known at each bus

| Bus type | Specified | Solved |
|---|---|---|
| Slack / reference | Voltage magnitude and angle | P and Q injection |
| PQ | Net P and Q | Voltage magnitude and angle |
| PV | P and voltage magnitude | Q and angle |

Under this chapter's assumptions, loads and fixed-PQ distributed generators are represented at **PQ buses**. The unknowns are the voltage angles and magnitudes at those buses; the slack voltage is fixed. Collect them in x = [θ<sub>PQ</sub><sup>T</sup>, v<sub>PQ</sub><sup>T</sup>]<sup>T</sup>. The PV bus type is listed for context: it represents voltage regulation and is not used in this experiment. This bus classification and nonlinear power-balance formulation are described in the [MATPOWER AC power-flow manual](https://matpower.app/manual/matpower/ACPowerFlow.html).

### Step E — Solve with Newton–Raphson

Start with flat voltages and zero angles. Compute the mismatch between specified and calculated P/Q. Let J be the derivatives of the **calculated** injections with respect to x, so the update sign below is positive:

<div class="bf-equation" data-math="\begin{aligned}\Delta\boldsymbol s&amp;=\begin{bmatrix}\boldsymbol P_{PQ}^{spec}-\boldsymbol P_{PQ}\\\boldsymbol Q_{PQ}^{spec}-\boldsymbol Q_{PQ}\end{bmatrix}\\J&amp;=\begin{bmatrix}H&amp;N\\M&amp;L\end{bmatrix}=\frac{\partial(\boldsymbol P_{PQ},\boldsymbol Q_{PQ})}{\partial(\boldsymbol\theta_{PQ},\boldsymbol v_{PQ})}\end{aligned}"></div>
<div class="bf-equation" data-math="\begin{aligned}J(x^{(k)})\Delta x^{(k)}&amp;=\Delta\boldsymbol s^{(k)}\\x^{(k+1)}&amp;=x^{(k)}+\alpha\Delta x^{(k)}\end{aligned}"></div>

{% include power-flow-illustration.html kind="newton" %}

The implementation uses an analytic Jacobian, pivoted elimination, and a backtracking step α to reduce the mismatch while keeping positive voltage magnitudes. It stops when ‖Δs‖∞ &lt; 10<sup>−10</sup> pu, or reports failure after a stalled step or 30 updates. Failure of this algorithm alone does not prove that no physical solution exists.

<details class="bf-details"><summary>Show the Jacobian entries</summary><p>For i ≠ j:</p><div class="bf-equation" data-math="\begin{aligned}H_{ij}&amp;=v_i v_j(G_{ij}\sin\delta_{ij}-B_{ij}\cos\delta_{ij})\\N_{ij}&amp;=v_i(G_{ij}\cos\delta_{ij}+B_{ij}\sin\delta_{ij})\\M_{ij}&amp;=-v_i v_j(G_{ij}\cos\delta_{ij}+B_{ij}\sin\delta_{ij})\\L_{ij}&amp;=v_i(G_{ij}\sin\delta_{ij}-B_{ij}\cos\delta_{ij})\end{aligned}"></div><p>For i = j:</p><div class="bf-equation" data-math="\begin{aligned}H_{ii}&amp;=-Q_i-B_{ii}v_i^2\\N_{ii}&amp;=P_i/v_i+G_{ii}v_i\\M_{ii}&amp;=P_i-G_{ii}v_i^2\\L_{ii}&amp;=Q_i/v_i-B_{ii}v_i\end{aligned}"></div><p>The corresponding complex-matrix derivatives are documented in <a href="https://matpower.org/documentation/ref-manual/legacy/functions/dSbus_dV.html">MATPOWER's voltage-derivative reference</a>.</p></details>

### Step F — Recover branch flows and losses

For each active line, calculate the current and the powers injected into the line at both ends. Their sum is the branch's complex loss. Since this model contains only series impedance, current magnitude is the same at both ends.

<div class="bf-equation" data-math="\begin{aligned}I_{ij}&amp;=(V_i-V_j)/z_{ij}\\S_{ij}&amp;=V_i I_{ij}^*,\qquad S_{ji}=-V_j I_{ij}^*\\P_{loss,ij}&amp;=P_{ij}+P_{ji}=r_{ij}|I_{ij}|^2\end{aligned}"></div>

## 3. Worked example: a 400 V feeder
{: #worked-example }

### Set up the feeder and its buses

Consider a **three-bus, 400 V distribution feeder**. Bus 1 is the upstream source, which connects to bus 2 through line 1–2. Line 2–3 supplies the downstream bus 3. A normally open tie line 1–3 can be closed in the later experiment to provide an alternative path.

{% include power-flow-illustration.html kind="feeder" %}

| Bus | Equipment and specified quantities | Power-flow type |
|---|---|---|
| 1 | Upstream source, with voltage fixed at 1∠0° pu | Slack / reference |
| 2 | 120 kW load at PF = 0.95 lagging | PQ |
| 3 | 180 kW load at PF = 0.95 lagging, plus 50 kW distributed generation at unity power factor | PQ |

The inverter at bus 3 is modeled as a **specified P, Q injection**: P<sub>G</sub> = 50 kW and Q<sub>G</sub> = 0. It does not regulate the bus voltage. The bus remains PQ, with the generator and load combined into one net injection.

Choose S<sub>B</sub> = 1 MVA and V<sub>LL,B</sub> = 0.4 kV. Then Z<sub>B</sub> = 0.16 Ω and I<sub>B</sub> = 1443.38 A. The lines have these per-phase impedances:

| Line | Impedance (Ω) | Impedance (pu) |
|---|---|---|
| 1–2 | 0.012 + j0.008 | 0.075 + j0.050 |
| 2–3 | 0.008 + j0.006 | 0.050 + j0.0375 |
| 1–3, normally open tie | 0.022 + j0.014 | 0.1375 + j0.0875 |

With bus 1 as the reference and buses 2 and 3 as PQ buses, the four unknowns are x = [θ₂, θ₃, v₂, v₃]<sup>T</sup>.

### Form the injections and solve

**1. Convert load power factors.** Q<sub>D</sub> = P<sub>D</sub> tan(arccos 0.95), giving 39.44 kvar at bus 2 and 59.16 kvar at bus 3.

**2. Form net injections.** S₂<sup>spec</sup> = −0.120 − j0.03944 pu and S₃<sup>spec</sup> = −0.130 − j0.05916 pu. The 50 kW generator offsets part of bus 3's active demand; it does not offset its reactive demand.

**3. Take the first Newton step.** At the flat start, calculated injections are zero, so the mismatch is [−0.120, −0.130, −0.03944, −0.05916]<sup>T</sup>. Build J at that operating point, solve for Δx, and repeat.

**4. Check the solution.** The baseline gives |V₂| ≈ **0.97559 pu**, |V₃| ≈ **0.96657 pu**, θ₂ ≈ **−0.2994°**, θ₃ ≈ **−0.4159°**, and total active loss ≈ **6.8389 kW**. The slack supplies approximately **256.8389 kW**, satisfying 256.8389 + 50 − 300 = 6.8389 kW.

Predict what doubling both loads will do before selecting **High demand** below. Compare the resulting voltage drop and loss with the baseline; the relationship is nonlinear.

## 4. Experiment: change the operating point
{: #interactive-lab }

Move one control at a time. The phase diagram above shows the three-phase voltage at bus 3. It updates together with the network, voltage profile, current loading, and Newton-iteration table, all from the same operating point. Opening a radial branch isolates buses; a closed tie can provide an alternative path.

{% include balanced-lab.html %}

## 5. Edit and run Python
{: #code-lab }

Turn the worked example into a code experiment: read the input dictionary `case`, inspect the source that defines the solver, then use `main()` to organize the calculation and output. Run it unchanged to check the example voltages and loss, then change one parameter using the comments. The slider lab uses the original JavaScript model for immediate feedback; the Python panel runs the editable source below.

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
