---
title: "Unbalanced Power Flow"
permalink: /teaching/course-development/physics-informed-gnn/unbalanced-power-flow/
layout: course
unbalanced_power_flow: true
course_title: "Physics-informed GNN · Microgrids & distribution systems"
parent_url: /teaching/course-development/physics-informed-gnn/
parent_title: "Physics-informed GNN course"
description: "Interactive three-phase, four-wire power flow: phase-domain derivations, neutral displacement, a feeder example, parameter controls, and editable Python."
---

Three customers can draw the same total power as a balanced load and still produce very different phase voltages. What changes when most demand sits on phase A, or a rooftop inverter supplies only one phase? This chapter keeps all three phases and the neutral conductor, then lets you test the answer.

<nav class="bf-toc" aria-label="Lesson sections"><a href="#background">Background</a><a href="#formulation">Derivation</a><a href="#worked-example">Worked example</a><a href="#interactive-lab">Experiment</a><a href="#code-lab">Python</a><a href="#practice">Practice</a></nav>

## 1. From one equivalent phase to four conductors
{: #background }

In the [Balanced Power Flow chapter]({{ '/teaching/course-development/physics-informed-gnn/balanced-power-flow/' | relative_url }}), phase magnitudes were equal and phase angles were separated by 120°. A single equivalent phase described the network. Single-phase customers and inverters break that symmetry: each phase now has its own complex power, voltage, and current.

An unequal load also produces **neutral return current**. If the neutral conductor has finite impedance, its local voltage differs from the grounded source neutral. A customer's voltage is the **phase-to-local-neutral voltage**, not just the phase-conductor voltage measured against the source reference. Explicit four-wire modeling is therefore useful for low-voltage feeders; see the [four-wire modeling study by Claeys, Geth, and Deconinck](https://arxiv.org/abs/2204.08126).

{% include unbalanced-overview.html %}

The experiment is a **radial, three-bus, four-wire AC model**. Bus 1 is a balanced ideal source with its neutral grounded. Loads and fixed-PQ PV inverters are wye connected. Downstream neutrals connect through the neutral wire; there are no additional earth-return or grounding paths. The line model includes adjustable phase-phase mutual reactance and neutral impedance, while phase-neutral mutual terms are set to zero as a teaching simplification.

<div class="uf-compare">Before moving a slider, predict: if phase A demand increases, must phases B and C both fall by the same amount? The shared neutral makes that assumption unreliable.</div>

## 2. Derive the phase-domain equations
{: #formulation }

### Step A — Separate conductor and load-terminal voltages

Use RMS complex phasors. Let V<sub>i,a</sub>, V<sub>i,b</sub>, V<sub>i,c</sub>, V<sub>i,n</sub> denote conductor voltages against the source reference. The wye load terminals see:

<div class="bf-equation" data-math="U_{i,\phi}=V_{i,\phi}-V_{i,n},\qquad \phi\in\{a,b,c\}"></div>

{% include power-flow-illustration.html kind="neutral" %}

Keep the previous chapter's 1 MVA three-phase base and 400 V line-to-line voltage base. This time, power is assigned to each phase individually:

<div class="bf-equation" data-math="\begin{aligned}S_{B,\phi}&amp;=S_{B,3\phi}/3,\qquad V_{B,\phi}=V_{B,LL}/\sqrt3\\Z_B&amp;=V_{B,\phi}^2/S_{B,\phi}=0.16\ \Omega\\I_B&amp;=S_{B,\phi}/V_{B,\phi}=1443.38\ \mathrm A\end{aligned}"></div>

Thus V<sub>B,φ</sub> ≈ 230.94 V and S<sub>B,φ</sub> = 333.333 kVA. A **90 kW single-phase load** has an active demand of 0.27 pu on this per-phase power base. Its value is not the three-phase total 0.09 pu used for a 90 kW balanced aggregate.

### Step B — Convert each constant-PQ demand into current

Define positive **net demand** as consumption. For the unity-power-factor PV used here, s<sub>i,φ</sub> = (P<sub>D,i,φ</sub> − P<sub>PV,i,φ</sub>) + jQ<sub>D,i,φ</sub>. This demand convention is the negative of the previous chapter's net-injection convention. Q<sub>D</sub> = P<sub>D</sub> tan(arccos PF).

<div class="bf-equation" data-math="\begin{aligned}s_{i,\phi}&amp;=U_{i,\phi}\bigl(I_{i,\phi}^{load}\bigr)^*\\I_{i,\phi}^{load}&amp;=\left(s_{i,\phi}/U_{i,\phi}\right)^*\\I_{i,n}^{load}&amp;=-\left(I_{i,a}^{load}+I_{i,b}^{load}+I_{i,c}^{load}\right)\end{aligned}"></div>

The four terminal currents sum to zero. An ideal zero-impedance neutral can still carry a nonzero current. The zero-current result applies to balanced fundamental-frequency phase currents; this chapter does not include harmonics.

### Step C — Apply KVL to the four-wire line

For each branch, collect conductor voltages and currents into four-component vectors. A general series model uses a 4 × 4 impedance matrix:

<div class="bf-equation" data-math="\boldsymbol V_j=\boldsymbol V_i-Z_{ij}\boldsymbol I_{ij},\qquad \boldsymbol V_i=\begin{bmatrix}V_{i,a}\\V_{i,b}\\V_{i,c}\\V_{i,n}\end{bmatrix}"></div>

The interactive line matrix is symmetric, with identical phase self impedances z<sub>s</sub>, phase mutual impedance z<sub>m</sub> = jx<sub>m</sub>, and neutral self impedance z<sub>n</sub>:

<div class="bf-equation" data-math="Z=\begin{bmatrix}z_s&amp;z_m&amp;z_m&amp;0\\z_m&amp;z_s&amp;z_m&amp;0\\z_m&amp;z_m&amp;z_s&amp;0\\0&amp;0&amp;0&amp;z_n\end{bmatrix},\qquad x_m=\mu x_s"></div>

The control μ sets the mutual/self reactance ratio. This illustrative matrix is not a cable specification. Setting z<sub>n</sub> = 0 fixes downstream neutral voltages at zero in this network; it does not disconnect the neutral. Real grounding and neutral connections must be modeled explicitly, as discussed in [OpenDSS's neutral conventions](https://opendss.epri.com/NeutralRules.html).

<details class="bf-details"><summary>Why can phase A change phases B and C?</summary><p>Since Iₙ = −(Iₐ + Iᵦ + I𝒸), subtracting the neutral-conductor KVL equation from each phase equation gives:</p><div class="bf-equation" data-math="\boldsymbol U_j=\boldsymbol U_i-\left(Z_{pp}+z_n\boldsymbol 1\boldsymbol 1^T\right)\boldsymbol I_{abc}"></div><p>The shared-neutral term contains the sum of all three phase currents. Even with μ = 0, a finite neutral couples the load-terminal phase voltages. Three independent single-phase calculations reproduce this model only when both neutral impedance and phase mutual coupling are zero.</p></details>

### Step D — Solve a radial feeder by backward/forward sweep

Starting with the source phasors at every bus, repeat three operations:

1. Calculate each load's four terminal currents from the current phase-to-neutral voltages.
2. **Backward sweep:** add downstream currents to get each branch current.
3. **Forward sweep:** start at bus 1 and apply the four-wire KVL equations along the feeder.

For this three-bus chain:

<div class="bf-equation" data-math="\begin{aligned}\boldsymbol I_{23}&amp;=\boldsymbol I_3^{load}\\\boldsymbol I_{12}&amp;=\boldsymbol I_2^{load}+\boldsymbol I_{23}\\\boldsymbol V_2^{sweep}&amp;=\boldsymbol V_1-Z_{12}\boldsymbol I_{12}\\\boldsymbol V_3^{sweep}&amp;=\boldsymbol V_2^{sweep}-Z_{23}\boldsymbol I_{23}\end{aligned}"></div>

{% include power-flow-illustration.html kind="sweep" %}

The implementation damps the voltage update with α = 0.65:

<div class="bf-equation" data-math="\boldsymbol V^{(k+1)}=(1-\alpha)\boldsymbol V^{(k)}+\alpha\boldsymbol V^{sweep,(k)}"></div>

It stops when the maximum complex conductor-voltage residual ‖V<sup>sweep</sup> − V‖∞ is below 10<sup>−10</sup> pu. It reports failure after 200 updates or a very low/nonfinite voltage. A failed iteration does not by itself prove voltage collapse or the absence of another solution. Branch disconnection is reported separately as an island outside this single-source model.

### Step E — Recover losses and measure voltage unbalance

For this line matrix, mutual terms are purely reactive. In physical units, total active conductor loss is:

<div class="bf-equation" data-math="P_{loss}=r_s\left(|I_a|^2+|I_b|^2+|I_c|^2\right)+r_n|I_n|^2"></div>

These are amperes and ohms, so the result is watts. **Do not multiply by three again**: all three phase currents are already included. Power injected into the line at both ends, including the neutral conductor, gives the same total loss.

Sequence components summarize the complex phase-to-neutral voltages. With a = e<sup>j2π/3</sup> and phase order ABC:

<div class="bf-equation" data-math="\begin{bmatrix}U_0\\U_1\\U_2\end{bmatrix}=\frac13\begin{bmatrix}1&amp;1&amp;1\\1&amp;a&amp;a^2\\1&amp;a^2&amp;a\end{bmatrix}\begin{bmatrix}U_a\\U_b\\U_c\end{bmatrix},\qquad VUF=100\frac{|U_2|}{|U_1|}\%"></div>

U₁ is positive sequence, U₂ negative sequence, and U₀ zero sequence. Here **VUF specifically means the negative/positive sequence ratio**. It is different from the magnitude-deviation metric described in the [OpenDSS NEMA-unbalance note](https://opendss.epri.com/TechNoteNEMAUnbalanceCalculation.html). A small VUF does not guarantee acceptable phase voltages or a small neutral displacement.

## 3. Worked example: the same 300 kW, distributed unequally
{: #worked-example }

Bus 1 supplies a balanced 400 V line-to-line source. Bus 2 consumes 40 kW on each phase. Bus 3 consumes **90 / 55 / 35 kW** on phases A/B/C. All loads have PF = 0.95 lagging. A 50 kW PV inverter supplies equal active power on the three phases at bus 3.

| Branch | Phase self impedance (Ω) | Neutral impedance (Ω) | Phase mutual impedance (Ω) |
|---|---|---|---|
| 1–2 | 0.012 + j0.008 | 0.018 + j0.006 | j0.0016 |
| 2–3 | 0.008 + j0.006 | 0.012 + j0.004 | j0.0012 |

**1. Form each phase's net demand.** The PV supplies 50/3 kW per phase, so bus 3 has net active demands of 73.333 / 38.333 / 18.333 kW. Its load reactive demands remain P<sub>D,φ</sub> tan(arccos 0.95); PV does not supply Q in this example.

**2. Find currents and the return path.** Divide each complex demand by its own phase-to-local-neutral voltage and conjugate. Sum phase currents as complex phasors to obtain the neutral return current. Adding current magnitudes would give an incorrect neutral current.

**3. Sweep and check the operating point.** The baseline converges to these bus 3 load-terminal voltages:

| Phase | Magnitude (pu) | Magnitude (V RMS) | Angle (°) |
|---|---|---|---|
| A | 0.91917 | 212.27 | +0.1180 |
| B | 0.98032 | 226.39 | −122.0550 |
| C | 1.00438 | 231.95 | +121.2865 |

Neutral displacement is about **7.637 V**; branch 1–2 neutral current is about **242.81 A**. Total active loss is **9.5971 kW**, and the source supplies **259.5971 kW**: 259.5971 + 50 − 300 = 9.5971 kW. VUF at bus 3 is only **0.9028%**, yet phase A is below the experiment's 0.95 pu teaching limit.

Select **Same total load, balanced phases** below. The bus 3 load becomes 60 / 60 / 60 kW, keeping total demand and PV unchanged. Observe the neutral current, neutral displacement, per-phase voltage, and loss together. To reproduce the previous chapter's baseline exactly, also set μ = 0; equal phase currents then see the same uncoupled series impedance.

## 4. Experiment: change one phase, observe all three
{: #interactive-lab }

Move a phase-load slider, change PV connection, or compare finite and ideal neutral impedance. The network, phasors, voltage profiles, current loading, and numerical tables use the same solved operating point. The voltage band, VUF threshold, and current limits are teaching settings, not a compliance assessment.

{% include unbalanced-lab.html %}

## 5. Edit and run the four-wire solver
{: #code-lab }

The sliders run a JavaScript solver for immediate feedback. The Python panel executes the same four-wire equations in a browser worker and plots its own result. You can edit both the experiment and the actual solver. Try balancing bus 3 without changing its total demand:

```python
case.update(p3_a_kw=60, p3_b_kw=60, p3_c_kw=60)
result = solve(case)
```

{% include course-code.html prefix="uf" root_id="unbalanced-code" source="/assets/code/unbalanced_power_flow.py" %}

To write a controlled PV-placement comparison, add this loop to the experiment. The final successful result is plotted:

```python
for connection in ("balanced", "a", "b", "c"):
    trial = dict(case, dg_phase=connection)
    solved = solve(trial)
    if solved["ok"]:
        end = solved["buses"][2]
        print(connection, [round(p["vm_pu"], 4) for p in end["phases"]],
              round(end["components"]["vuf_pct"], 3),
              round(solved["loss_kw"], 3))
        result = solved
    else:
        print(connection, solved["reason"])
```

## 6. Practice and explain
{: #practice }

<form class="bf-quiz uf-quiz"><fieldset><legend>What does the ideal-neutral setting enforce?</legend><label><input type="radio" name="uf-neutral-quiz" value="voltage"> Zero neutral-conductor voltage, while return current can be nonzero.</label><label><input type="radio" name="uf-neutral-quiz" value="current"> Zero neutral current under every load allocation.</label><label><input type="radio" name="uf-neutral-quiz" value="open"> An open neutral conductor.</label></fieldset><button class="btn" type="submit">Check answer</button><p data-quiz-feedback role="status" aria-live="polite"></p></form>

1. **Neutral coupling:** set μ = 0 and keep finite neutral impedance. Increase phase A load by 10 kW. Record all three voltages. Repeat with an ideal neutral and explain the difference using the shared-neutral matrix term.
2. **Same total demand:** compare 90 / 55 / 35 kW with 60 / 60 / 60 kW. Keep PF, PV output/connection, and impedances fixed. Explain the changes in neutral loss and minimum voltage.
3. **One metric is insufficient:** find a converged point with VUF below 2% and a phase voltage outside 0.95–1.05 pu. Use U₀, U₂, and neutral displacement to discuss what VUF does and does not describe.
4. **Single-phase PV:** place 50 kW on phases A, B, and C in turn. Determine which placement improves the minimum voltage at this operating point; then repeat under high demand. Avoid assuming the same placement is best for every case.
5. **N-1 labels:** open branch 2–3. Distinguish isolation from numerical nonconvergence and from a connected but limit-violating solution. Fixed-PQ PV does not become a grid-forming source when the feeder opens.

## 7. Scope and the next implementation module

This fundamental-frequency, radial teaching model excludes delta loads, voltage-dependent loads, asymmetrical conductor geometry, phase-neutral mutual impedance, downstream grounding/earth return, transformers, regulators, harmonics, inverter limits, and dynamic/protection behavior. Opening a branch opens all four conductors; an open-neutral-only fault is not modeled. An isolated section has no voltage reference in this model.

The future **PandaPower-based Implementation** chapter will compare tool assumptions explicitly. In particular, [pandapower's `runpp_3ph` documentation](https://pandapower.readthedocs.io/en/stable/powerflow/ac_3ph.html) describes a sequence-frame solver and its earth-return/wye conventions; its results should not be assumed identical to this explicit neutral-wire case without matching those assumptions.

### References

* [Claeys, Geth, and Deconinck: four-wire distribution-network modeling](https://arxiv.org/abs/2204.08126).
* [OpenDSS: neutral connections and conventions](https://opendss.epri.com/NeutralRules.html).
* [OpenDSS: magnitude-based NEMA unbalance](https://opendss.epri.com/TechNoteNEMAUnbalanceCalculation.html).
* [pandapower: asymmetric / three-phase power flow](https://pandapower.readthedocs.io/en/stable/powerflow/ac_3ph.html).
