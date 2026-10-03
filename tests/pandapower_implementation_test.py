"""Numerical and teaching-artifact checks against real pandapower."""
import importlib.util
import json
import math
from pathlib import Path
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lesson = load("pp_lesson", "assets/code/pandapower_implementation.py")
reference = load("balanced_reference", "assets/code/balanced_power_flow.py")
builder = load("notebook_builder", "scripts/build_pandapower_notebook.py")


class PandapowerLessonTests(unittest.TestCase):
    def test_balanced_against_independent_previous_chapter(self):
        for changes in ({}, {"tie": True}, {"load_scale": 1.5},
                        {"dg_kw": 160}, {"vm_pu": 1.02}, {"pf": .85}):
            opts = dict(changes)
            other = dict(changes)
            if "pf" in other:
                other["power_factor"] = other.pop("pf")
            if "vm_pu" in other:
                other["slack_pu"] = other.pop("vm_pu")
            if "tie" in other:
                other["topology"] = "meshed" if other.pop("tie") else "radial"
            expected = reference.solve(other)
            for algorithm in ("nr", "bfsw"):
                with self.subTest(changes=changes, algorithm=algorithm):
                    actual = lesson.solve(dict(opts, algorithm=algorithm))
                    self.assertTrue(actual["ok"])
                    for bus, ref in zip(actual["buses"], expected["buses"]):
                        self.assertAlmostEqual(bus["vm_pu"][0], ref["vm_pu"], delta=2e-8)
                    self.assertAlmostEqual(actual["loss_kw"], expected["loss_kw"], delta=1e-5)
                    self.assertLess(abs(actual["balance_error_kw"]), 1e-4)

    def test_symmetric_three_phase_reduces_to_balanced(self):
        for changes in ({}, {"tie": True}, {"load_scale": 1.5}, {"zero_ratio": 5}):
            c = dict(changes, p3_a_kw=60, p3_b_kw=60, p3_c_kw=60)
            balanced = lesson.solve(c)
            three = lesson.solve(dict(c, mode="three_phase"))
            self.assertTrue(three["ok"])
            for actual, expected in zip(three["buses"], balanced["buses"]):
                for voltage in actual["vm_pu"]:
                    self.assertAlmostEqual(voltage, expected["vm_pu"][0], delta=2e-8)
                self.assertLess(actual["vuf_pct"], 1e-5)
            self.assertAlmostEqual(three["loss_kw"], balanced["loss_kw"], delta=1e-5)

    def test_phase_kcl_kvl_sequence_impedance_losses(self):
        """Reconstruct physical phase currents independently from S/V."""
        for changes in ({}, {"dg_phase": "a"}, {"zero_ratio": 1},
                        {"zero_ratio": 5, "load_scale": .7}, {"vm_pu": 1.02}):
            c = lesson.settings(dict(changes, mode="three_phase"))
            net = lesson.build_network(c)
            lesson.run_network(net, c)
            result = lesson.collect_results(net, c)
            voltages = np.array([[net.res_bus_3ph.at[i, f"vm_{p}_pu"] * .4e3/math.sqrt(3)
                                  * np.exp(1j*np.deg2rad(net.res_bus_3ph.at[i, f"va_{p}_degree"]))
                                  for p in "abc"] for i in range(3)])
            demand = np.zeros((3, 3), dtype=complex)
            for _, row in net.asymmetric_load.iterrows():
                demand[int(row.bus)] += np.array([row[f"p_{p}_mw"]+1j*row[f"q_{p}_mvar"] for p in "abc"])*1e6
            for _, row in net.asymmetric_sgen.iterrows():
                demand[int(row.bus)] -= np.array([row[f"p_{p}_mw"]+1j*row[f"q_{p}_mvar"] for p in "abc"])*1e6
            current23 = np.conj(demand[2]/voltages[2])
            current12 = current23 + np.conj(demand[1]/voltages[1])
            for k, current in enumerate((current12, current23)):
                line = net.line.loc[k]
                z1 = (line.r_ohm_per_km+1j*line.x_ohm_per_km)*line.length_km
                z0 = (line.r0_ohm_per_km+1j*line.x0_ohm_per_km)*line.length_km
                zabc = np.eye(3)*z1 + np.ones((3, 3))*(z0-z1)/3
                np.testing.assert_allclose(voltages[k]-voltages[k+1], zabc @ current, atol=2e-5, rtol=2e-5)
                np.testing.assert_allclose(np.abs(current), result["lines"][k]["current_a"], atol=2e-4, rtol=2e-5)
                loss_kw = (np.conj(current) @ zabc.real @ current).real/1000
                self.assertAlmostEqual(loss_kw, result["lines"][k]["loss_kw"], delta=2e-5)
            self.assertLess(abs(result["balance_error_kw"]), 1e-4)

    def test_power_allocation_and_rating(self):
        balanced1 = lesson.solve()
        balanced2 = lesson.solve(dict(p3_a_kw=60, p3_b_kw=60, p3_c_kw=60))
        self.assertEqual(balanced1["buses"], balanced2["buses"])
        three = lesson.solve(dict(mode="three_phase"))
        self.assertLess(three["buses"][2]["vm_pu"][0], .95)
        self.assertLess(three["max_vuf"], 2)
        self.assertFalse(three["secure"])
        tighter = lesson.solve(dict(limit_a=300))
        self.assertEqual(tighter["buses"], balanced1["buses"])
        self.assertAlmostEqual(tighter["max_loading"], balanced1["max_loading"]*2, places=7)
        self.assertIn("current", tighter["violations"])

    def test_islands_are_not_security_or_valid_zero_voltage(self):
        for mode in ("balanced", "three_phase"):
            r = lesson.solve(dict(mode=mode, trip23=True))
            self.assertTrue(r["ok"])
            self.assertFalse(r["secure"])
            self.assertEqual(r["unsupplied"], [2])
            self.assertTrue(all(v is None for v in r["buses"][2]["vm_pu"]))
            self.assertIn("unsupplied", r["violations"])
            json.dumps(r, allow_nan=False)
            r = lesson.solve(dict(mode=mode, trip12=True))
            self.assertFalse(r["ok"])
            self.assertEqual(r["reason"], "island")
            self.assertEqual(r["unsupplied"], [1, 2])
            r = lesson.solve(dict(mode=mode, tie=True, trip12=True))
            self.assertTrue(r["ok"])
            self.assertEqual(r["unsupplied"], [])

    def test_invalid_input_and_numerical_failure_are_distinct(self):
        for changes in ({"pf": 0}, {"pf": 1.2}, {"limit_a": 0},
                        {"dg_phase": "n"}, {"p2_kw": float("nan")}, {"mode": "dc"}):
            with self.assertRaises(ValueError):
                lesson.solve(changes)
        failed = lesson.solve(dict(load_scale=20))
        self.assertFalse(failed["ok"])
        self.assertEqual(failed["reason"], "nonconvergence")

    def test_downloaded_notebook_is_current_and_runs(self):
        stored = json.loads((ROOT/"assets/code/pandapower_implementation.ipynb").read_text())
        expected = builder.notebook()
        for i, item in enumerate(expected["cells"]):
            item["id"] = f"pp-lesson-{i:02d}"
        self.assertEqual(stored, expected, "Regenerate with scripts/build_pandapower_notebook.py")
        namespace = {"__name__": "notebook", "display": lambda *args: None}
        for item in stored["cells"]:
            source = "".join(item["source"])
            if item["cell_type"] == "code" and not source.startswith("%pip"):
                exec(compile(source, "downloaded-notebook", "exec"), namespace)
        self.assertEqual(len(namespace["rows"]), 4)
        self.assertTrue(all(row["converged"] for row in namespace["rows"]))


if __name__ == "__main__":
    unittest.main()
