---
published: false
---

# ECE 685 diagram design and verification

The course diagrams show the modeled electrical connection or a quantitative relationship. Generic process boxes and decorative electrical marks are not substitutes for a circuit, phasor construction, or capacity comparison.

| Module | Illustration | Teaching reference |
| --- | --- | --- |
| L01–L02 | Generator, transformer, buses, line, load and receiving-bus shunt; real/reactive balance | L02 symbolic representation |
| L03–L04 | Daily capacity requirement and separate annual accredited generation mix, drawn to scale | Fuel mix I and II |
| L05 | A sampled cosine and matching polar/rectangular RMS phasors, all at 35° | Single-phase AC I |
| L06–L07 | Original impedance load with a parallel capacitor; signed power triangle and corrected power | Single-phase AC II and III |
| L08–L09b | Balanced voltage phasors and the selected Y/Δ impedance connection | Three-phase AC slides and examples |
| L10–L12 | Ideal paired windings, winding-current directions and distinct winding/line quantities | Transformer modeling I–III |
| L13–L15 | Physical impedance referral through an ideal transformer, corresponding bases and invariant recovery | Per-unit I–III |
| L17 | Three paired, dotted coils with directed Y/Δ endpoints and a separate terminal-angle comparison | Three-phase transformers I, physical connection and rated-current diagrams |
| L18 | H-side series impedance and electrically separate transformer ports | Three-phase transformers II, slide 14 |
| L22 | Opposite-current conductor cross sections and an explicit two-conductor series loop | Line parameters I, internal/external flux linkage and route example |
| L23 | Phase positions drawn to scale and three equal-length transposition sections | Line parameters II, complete transposition and GMD |
| L24 | Leading charging-current phasor and nominal π with both capacitive shunts | Line parameters III, local terminal voltage and shunt splitting |
| L25 | Actual 1–4 member bundle geometry, square diagonal, and calculated per-phase π branch | Line parameters IV, separate magnetic/electric self radii and system bases |

The renderer is `assets/js/ece685-stage-diagrams.js`. The live experiments and the static baseline illustrations use that same renderer. Static illustrations contain their own styles and arrow definitions, work without JavaScript, and have separate English and Chinese labels.

After changing the renderer or baseline model inputs, run:

```sh
node scripts/build_ece685_diagram_assets.cjs
node --test tests/ece685_diagrams_test.cjs tests/ece685_stage_test.cjs tests/ece685_line_parameters_test.cjs tests/l05_phasor_test.cjs
node scripts/build_ece685_diagram_assets.cjs --check
```

Keep these requirements during review:

- Voltage polarity, current direction, dot pairing and delta joining must agree with the equations. A star point is not a grounding assertion.
- Distinguish phase, winding and line quantities; state units, bases and angular references. The L17 angle comparison is explicitly normalized and does not compare voltage magnitudes.
- Quantitative vectors and bars use consistent scales. Leading reactive power appears below the real-power axis; zero vectors have no fabricated angle.
- Do not connect independent calculations into a circuit that implies a voltage-current relation the model does not enforce. The per-unit diagram illustrates impedance referral.
- Check baseline and boundary inputs in both languages. Inspect label collisions and clipping after changing connection, sequence, phase reference and tap.
- On narrow screens, a readable diagram can scroll within its figure. The page itself and its controls must stay within the viewport.
- Preserve original student slides. A new illustration must explain the same physical conventions and assumptions.
- For line parameters, distinguish the supplied GMR from physical radius, bundle count from physical circuit count, per-phase shunts from three-phase reactive supply, and total B from each π-end B/2. The capacitance diagram uses symbolic series R/X and a uniform-voltage charging estimate, not a solved terminal-voltage model.

CI checks numerical models, plotted vector directions, matched-dot variants and freshness of generated baseline assets. Browser review remains necessary for actual fonts, layout and interaction.
