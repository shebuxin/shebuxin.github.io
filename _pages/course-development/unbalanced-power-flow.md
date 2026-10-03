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

<nav class="bf-toc" aria-label="Lesson sections"><a href="#background">Background</a><a href="#formulation">Derivation</a><a href="#sequence-components">Sequences</a><a href="#worked-example">Worked example</a><a href="#interactive-lab">Experiment</a><a href="#code-lab">Python</a><a href="#practice">Practice</a></nav>

## 1. From one equivalent phase to four conductors
{: #background }

In the [Balanced Power Flow chapter]({{ '/teaching/course-development/physics-informed-gnn/balanced-power-flow/' | relative_url }}), phase magnitudes were equal and phase angles were separated by 120°. A single equivalent phase described the network. Single-phase customers and inverters break that symmetry: each phase now has its own complex power, voltage, and current.

An unequal load also produces **neutral return current**. If the neutral conductor has finite impedance, its local voltage differs from the grounded source neutral. A customer's voltage is the **phase-to-local-neutral voltage**, not just the phase-conductor voltage measured against the source reference. Explicit four-wire modeling is therefore useful for low-voltage feeders; see the [four-wire modeling study by Claeys, Geth, and Deconinck](https://arxiv.org/abs/2204.08126).

{% include unbalanced-overview.html %}

### Modeling assumptions

This chapter uses a phase-domain, four-wire AC model. Its equations and experiments make the following assumptions:

- **Sinusoidal steady state:** voltages and currents are fundamental-frequency RMS complex phasors; harmonics are excluded.
- **Radial network:** retain the a, b, c phase conductors and the n neutral, and calculate branch currents and conductor voltages along the feeder.
- **One balanced ideal source:** its phase-voltage magnitudes and angles are fixed, and its neutral is grounded. Downstream neutrals return through the neutral wire, without additional grounding or earth-return paths.
- **Wye constant-PQ devices:** loads specify P and Q per phase; solar inverters inject specified active power with Q = 0. They connect phase to local neutral and do not regulate bus voltage.
- **Series four-conductor lines:** retain phase and neutral resistance and reactance, plus adjustable phase-phase mutual reactance. Phase-neutral mutual terms are zero; shunts and transformers are omitted.

These assumptions define the general model. First derive its equations with generic labels i, j, and k; the worked example then introduces the feeder, bus numbers, and phase demands.

<div class="uf-compare">Before moving a slider, predict: if phase A demand increases, must phases B and C both fall by the same amount? The shared neutral makes that assumption unreliable.</div>

## 2. Derive the phase-domain equations
{: #formulation }

### Step A — Separate conductor and load-terminal voltages

Use RMS complex phasors. Let V<sub>i,a</sub>, V<sub>i,b</sub>, V<sub>i,c</sub>, V<sub>i,n</sub> denote conductor voltages against the source reference. The wye load terminals see:

<div class="bf-equation" data-math="U_{i,\phi}=V_{i,\phi}-V_{i,n},\qquad \phi\in\{a,b,c\}"></div>

{% include power-flow-illustration.html kind="neutral" %}

Let S<sub>B,3φ</sub> be the three-phase power base and V<sub>B,LL</sub> the line-to-line voltage base. Phase-specific powers need corresponding per-phase bases:

<div class="bf-equation" data-math="\begin{aligned}S_{B,\phi}&amp;=S_{B,3\phi}/3,\qquad V_{B,\phi}=V_{B,LL}/\sqrt3\\Z_B&amp;=V_{B,\phi}^2/S_{B,\phi}=V_{B,LL}^2/S_{B,3\phi}\\I_B&amp;=S_{B,\phi}/V_{B,\phi}\end{aligned}"></div>

Divide each phase's power by the per-phase power base, and divide total three-phase power by the three-phase base. The worked example substitutes numerical values to check both conversions.

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
3. **Forward sweep:** start at the source bus and apply the four-wire KVL equations along the feeder.

Use a generic i → j → k chain to illustrate one update: i is the source, j and k have loads, and k is the end bus. Every voltage and current vector contains four components: a, b, c, and n.

<div class="bf-equation" data-math="\begin{aligned}\boldsymbol I_{jk}&amp;=\boldsymbol I_k^{load}\\\boldsymbol I_{ij}&amp;=\boldsymbol I_j^{load}+\boldsymbol I_{jk}\\\boldsymbol V_j^{sweep}&amp;=\boldsymbol V_i-Z_{ij}\boldsymbol I_{ij}\\\boldsymbol V_k^{sweep}&amp;=\boldsymbol V_j^{sweep}-Z_{jk}\boldsymbol I_{jk}\end{aligned}"></div>

{% include power-flow-illustration.html kind="sweep" %}

The implementation damps the voltage update with α = 0.65:

<div class="bf-equation" data-math="\boldsymbol V^{(k+1)}=(1-\alpha)\boldsymbol V^{(k)}+\alpha\boldsymbol V^{sweep,(k)}"></div>

It stops when the maximum complex conductor-voltage residual ‖V<sup>sweep</sup> − V‖∞ is below 10<sup>−10</sup> pu. It reports failure after 200 updates or a very low/nonfinite voltage. A failed iteration does not by itself prove voltage collapse or the absence of another solution. Branch disconnection is reported separately as an island outside this single-source model.

### Step E — Recover conductor losses

For this line matrix, mutual terms are purely reactive. In physical units, total active conductor loss is:

<div class="bf-equation" data-math="P_{loss}=r_s\left(|I_a|^2+|I_b|^2+|I_c|^2\right)+r_n|I_n|^2"></div>

These are amperes and ohms, so the result is watts. **Do not multiply by three again**: all three phase currents are already included. Power injected into the line at both ends, including the neutral conductor, gives the same total loss.

{% include unbalanced-sequence-theory.html %}

## 3. Worked example: the same 300 kW, distributed unequally
{: #worked-example }

### Introduce the feeder and bus settings

Consider a **three-bus, 400 V radial distribution feeder**. Bus 1 is the upstream source, connected to bus 2 by line 1–2. Line 2–3 then supplies the end bus 3. Each branch has four conductors, a, b, c, and n; this example has no tie line.

{% include unbalanced-feeder.html %}

| Bus | Equipment and specified quantities | Treatment of voltage |
|---|---|---|
| 1 | Balanced 400 V line-to-line source with grounded neutral | Fixed three-phase voltage phasors and neutral voltage |
| 2 | Wye loads: 40 / 40 / 40 kW, 120 kW total, PF = 0.95 lagging | Solve load-terminal voltages using the four-wire model |
| 3 | Wye loads: 90 / 55 / 35 kW, 180 kW total, PF = 0.95 lagging; plus 50 kW solar generation | Solve load-terminal voltages using the four-wire model |

The inverter at bus 3 is a **specified P, Q injection**: the baseline distributes 50 kW equally across phases, with Q = 0 on each phase and no voltage regulation. Subtract its injection from the phase loads to obtain net demand. The phasor diagram above observes this bus's phase-to-local-neutral voltages.

### Substitute the bases and line parameters

Use a 1 MVA three-phase power base and a 400 V line-to-line voltage base. This gives S<sub>B,φ</sub> = 333.333 kVA, V<sub>B,φ</sub> ≈ 230.94 V, Z<sub>B</sub> = 0.16 Ω, and I<sub>B</sub> = 1443.38 A. A **90 kW single-phase load** is 0.27 pu on the per-phase base; a 90 kW three-phase aggregate is 0.09 pu on the three-phase base.

The conductor self impedances and phase mutual impedances are:

| Branch | Phase self impedance (Ω) | Neutral impedance (Ω) | Phase mutual impedance (Ω) |
|---|---|---|---|
| 1–2 | 0.012 + j0.008 | 0.018 + j0.006 | j0.0016 |
| 2–3 | 0.008 + j0.006 | 0.012 + j0.004 | j0.0012 |

### Form phase demands and solve

**1. Form each phase's net demand.** The PV supplies 50/3 kW per phase, so bus 3 has net active demands of 73.333 / 38.333 / 18.333 kW. Its load reactive demands remain P<sub>D,φ</sub> tan(arccos 0.95); PV does not supply Q in this example.

**2. Find currents and the return path.** Divide each complex demand by its own phase-to-local-neutral voltage and conjugate. Sum phase currents as complex phasors to obtain the neutral return current. Adding current magnitudes would give an incorrect neutral current.

**3. Sweep and check the operating point.** The baseline converges to these bus 3 load-terminal voltages:

| Phase | Magnitude (pu) | Magnitude (V RMS) | Angle (°) |
|---|---|---|---|
| A | 0.91917 | 212.27 | +0.1180 |
| B | 0.98032 | 226.39 | −122.0550 |
| C | 1.00438 | 231.95 | +121.2865 |

Neutral displacement is about **7.637 V**; branch 1–2 neutral current is about **242.81 A**. Total active loss is **9.5971 kW**, and the source supplies **259.5971 kW**: 259.5971 + 50 − 300 = 9.5971 kW. VUF at bus 3 is only **0.9028%**, yet phase A is below the experiment's 0.95 pu teaching limit.

### Decompose the solved voltages and check reconstruction

**4. Use the same complex voltages.** Convert both magnitude and angle from the table into complex numbers, then apply the sequence matrix. Bus 3 gives the following coefficients. The calculation uses the unrounded power-flow result; displayed values are approximate.

| A-phase coefficient | Complex value (pu) | Magnitude (pu) | Angle (°) |
|---|---|---|---|
| U₀ · zero | −0.040906 + j0.009788 | 0.042061 | +166.543 |
| U₁ · positive | 0.967660 − j0.003570 | 0.967666 | −0.211 |
| U₂ · negative | −0.007590 − j0.004326 | 0.008736 | −150.322 |

For phase A, no additional rotation is needed. Add the three representative coefficients:

<div class="bf-equation" data-math="\begin{aligned}U_a&amp;=U_0+U_1+U_2\\&amp;\approx(-0.040906+j0.009788)+(0.967660-j0.003570)+(-0.007590-j0.004326)\\&amp;\approx0.919164+j0.001892\ \mathrm{pu}\end{aligned}"></div>

Magnitude and angle recover approximately **0.91917∠0.118° pu**. For B and C, rotate the positive and negative terms as specified by the inverse before adding them. The inspector below checks each phase without solving another operating point.

The coefficients give VUF ≈ 0.9028%, while &#124;U₀&#124;/&#124;U₁&#124; ≈ 4.3466%. VUF alone therefore misses this example's substantial zero sequence and phase-voltage deviations. Here &#124;U₀&#124; ≈ 9.7135 V and &#124;Vₙ&#124; ≈ 7.6370 V: they are different quantities.

Select **Same total load, balanced phases** below. The bus 3 load becomes 60 / 60 / 60 kW, keeping total demand and PV unchanged. Observe the neutral current, neutral displacement, per-phase voltage, and loss together. To reproduce the previous chapter's baseline exactly, also set μ = 0; equal phase currents then see the same uncoupled series impedance.

## 4. Experiment: change one phase, observe all three
{: #interactive-lab }

Move a phase-load slider, change PV connection, or compare finite and ideal neutral impedance. The network, phasors, voltage profiles, current loading, and numerical tables use the same solved operating point. The voltage band, VUF threshold, and current limits are teaching settings, not a compliance assessment.

{% include unbalanced-lab.html %}

{% include unbalanced-sequence-lab.html %}

## 5. Edit and run the four-wire solver
{: #code-lab }

Read how the phase inputs enter the four-wire model, then let `main()` call the solver and inspect its answer. Run the default program first, then uncomment `parameters.update(p3_a_kw=60, p3_b_kw=60, p3_c_kw=60)` to keep bus 3 at 180 kW total while comparing phase voltages, VUF and neutral shift. The sliders keep the original JavaScript reference; the Python panel runs the editable four-wire source.

{% include course-code.html prefix="uf" root_id="unbalanced-code" source="/assets/code/unbalanced_power_flow.py" %}

### Verify sequences and reconstruction in Python

Replace the **whole main program** with this example. `solve`, `sequence` and `reconstruct_sequence` are defined in the complete folded solver source above: they solve power flow, decompose phasors and perform the inverse transform. `u_pu` stores `[real, imaginary]`, so read it with `complex(*pair)`. The magnitude-only `vm_pu` is not a substitute for a complex voltage.

```python
def main(input_case):
    # 1. Solve the current slider case; skip decomposition on failure.
    solved = solve(input_case)
    if not solved["ok"]:
        print("Power flow failed:", solved["reason"])
        return solved

    # 2. Read bus 3 phase-to-local-neutral COMPLEX voltages.
    bus = solved["buses"][2]  # zero-based index 2 -> bus 3
    phases = [complex(*phase["u_pu"]) for phase in bus["phases"]]

    # 3. Extract the A-phase zero, positive and negative coefficients.
    components = sequence(phases)
    for name in ("zero_pu", "positive_pu", "negative_pu"):
        coefficient = complex(*components[name])
        print(name, coefficient, "|U| =", abs(coefficient), "pu")

    # 4. Transform back to ABC and compare against each solved voltage.
    rebuilt = reconstruct_sequence(components)
    for label, original, recovered in zip("ABC", phases, rebuilt):
        print(label, "solved =", original, "rebuilt =", recovered)
    error = max(abs(u - restored) for u, restored in zip(phases, rebuilt))
    print("Maximum reconstruction error:", error, "pu")

    # Return the full power-flow result for the page voltage plot.
    return solved

result = main(case)
```

### Compare PV connections

After the default experiment, replace the entire main program with this scan to compare PV connections at otherwise fixed inputs. It returns the last successful solution for plotting:

```python
def main(input_case):
    last_successful = None
    for connection in ("balanced", "a", "b", "c"):
        trial = dict(input_case, dg_phase=connection)
        solved = solve(trial)
        if solved["ok"]:
            end = solved["buses"][2]  # Bus 3
            print(connection, end["components"]["vuf_pct"], end["neutral_v"])
            last_successful = solved
        else:
            print(connection, solved["reason"])
    return last_successful

# If no case converged, None leaves the voltage plot empty.
result = main(case)
```

## 6. Practice and explain
{: #practice }

<form class="bf-quiz uf-quiz"><fieldset><legend>What does the ideal-neutral setting enforce?</legend><label><input type="radio" name="uf-neutral-quiz" value="voltage"> Zero neutral-conductor voltage, while return current can be nonzero.</label><label><input type="radio" name="uf-neutral-quiz" value="current"> Zero neutral current under every load allocation.</label><label><input type="radio" name="uf-neutral-quiz" value="open"> An open neutral conductor.</label></fieldset><button class="btn" type="submit">Check answer</button><p data-quiz-feedback role="status" aria-live="polite"></p></form>

1. **Neutral coupling:** set μ = 0 and keep finite neutral impedance. Increase phase A load by 10 kW. Record all three voltages. Repeat with an ideal neutral and explain the difference using the shared-neutral matrix term.
2. **Same total demand:** compare 90 / 55 / 35 kW with 60 / 60 / 60 kW. Keep PF, PV output/connection, and impedances fixed. Explain the changes in neutral loss and minimum voltage.
3. **One metric is insufficient:** find a converged point with VUF below 2% and a phase voltage outside 0.95–1.05 pu. Use U₀, U₂, and neutral displacement to discuss what VUF does and does not describe.
4. **Single-phase PV:** place 50 kW on phases A, B, and C in turn. Determine which placement improves the minimum voltage at this operating point; then repeat under high demand. Avoid assuming the same placement is best for every case.
5. **N-1 labels:** open branch 2–3. Distinguish isolation from numerical nonconvergence and from a connected but limit-violating solution. Fixed-PQ PV does not become a grid-forming source when the feeder opens.

6. **Sequences and references:** select the source bus and explain why only positive sequence remains. Then select the baseline end bus, switch U/V and check U₀ = V₀ − Vₙ. Reconstruct A, B and C: why do their rotation coefficients differ?

## 7. Scope and the next implementation module

This fundamental-frequency, radial teaching model excludes delta loads, voltage-dependent loads, asymmetrical conductor geometry, phase-neutral mutual impedance, downstream grounding/earth return, transformers, regulators, harmonics, inverter limits, and dynamic/protection behavior. Opening a branch opens all four conductors; an open-neutral-only fault is not modeled. An isolated section has no voltage reference in this model.

The [PandaPower-based Implementation chapter]({{ '/teaching/course-development/physics-informed-gnn/pandapower-based-implementation/' | relative_url }}) maps equipment to library functions and compares the modeling assumptions explicitly. In particular, [pandapower's `runpp_3ph` documentation](https://pandapower.readthedocs.io/en/v3.2.1/powerflow/ac_3ph.html) describes a sequence-frame solver and its earth-return/wye conventions; its results should not be assumed identical to this explicit neutral-wire case without matching those assumptions.

### References

* [Claeys, Geth, and Deconinck: four-wire distribution-network modeling](https://arxiv.org/abs/2204.08126).
* [OpenDSS: neutral connections and conventions](https://opendss.epri.com/NeutralRules.html).
* [OpenDSS: magnitude-based NEMA unbalance](https://opendss.epri.com/TechNoteNEMAUnbalanceCalculation.html).
* [pandapower: asymmetric / three-phase power flow](https://pandapower.readthedocs.io/en/stable/powerflow/ac_3ph.html).
