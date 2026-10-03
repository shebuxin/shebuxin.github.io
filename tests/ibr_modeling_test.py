"""Physical identities and independent analytic checks for course models."""
import cmath
import contextlib
import hashlib
import importlib.util
import json
import io
import math
import os
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = Path(os.environ.get("IBR_SITE_DIR", ROOT / "_site"))
SOURCE = ROOT / "assets/code/ibr-modeling.py"
spec = importlib.util.spec_from_file_location("ibr_teaching", SOURCE)
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


class PhysicsTest(unittest.TestCase):
    def test_park_rotation_and_power_invariance(self):
        for angle in (-180, -90, 0, 20, 90, 180):
            r = model.solve(dict(mode="frame", angle=angle))
            for value in r["traces"]["vd"]:
                self.assertAlmostEqual(value, math.cos(math.radians(angle)), places=12)
            for value in r["traces"]["vq"]:
                self.assertAlmostEqual(value, -math.sin(math.radians(angle)), places=12)
            for value in r["traces"]["p"]:
                self.assertAlmostEqual(value, .6 * math.cos(math.pi / 6), places=12)
            for value in r["traces"]["q"]:
                self.assertAlmostEqual(value, .3, places=12)

    def test_power_flow_satisfies_original_kvl_and_power(self):
        for scr in (2, 5, 10):
            z = complex(1, 10) / (scr * math.sqrt(101))
            for s in (complex(.6), complex(.3, .1), complex(.3, -.1)):
                v = model.high_voltage_power_flow(s, z)
                current = (v - 1) / z
                self.assertLess(abs(v * current.conjugate() - s), 1e-12)
                self.assertGreater(abs(v), .8)

    def test_matched_equilibria_with_different_commands(self):
        for scr in (2, 5, 10):
            for family in ("gfl", "droop", "vsm", "parallel"):
                with self.subTest(scr=scr, family=family):
                    m = model.TeachingCase(family, model.settings(dict(scr=scr)))
                    e = m.evaluate(m.x0)
                    self.assertAlmostEqual(e["p"], .6, places=12)
                    self.assertAlmostEqual(e["q"], 0, places=12)
                    self.assertLess(max(map(abs, e["dx"])), 1e-10)
                    self.assertLess(e["residual"], 1e-12)
                    if family != "gfl":
                        self.assertNotEqual(m.commands[-1][1], 0)

    def test_no_disturbance_remains_at_equilibrium(self):
        for family in ("gfl", "droop", "vsm", "parallel"):
            r = model.solve(dict(mode=family, step=0))
            self.assertLess(max(abs(p - .6) for p in r["traces"]["p"]), 1e-10)
            self.assertLess(max(abs(q) for q in r["traces"]["q"]), 1e-10)

    def test_vsm_initial_rocof_and_inverse_inertia(self):
        for inertia in (1, 4, 8):
            m = model.TeachingCase("vsm", model.settings(dict(inertia=inertia)))
            dx = m.evaluate(m.x0, True)["dx"]
            self.assertAlmostEqual(50 * dx[1], 50 * .03 / inertia, places=12)

    def test_droop_frequency_steady_slope(self):
        r = model.solve(dict(mode="droop", event="f", step=.1))
        self.assertAlmostEqual(r["traces"]["p"][-1], .6 - .1 / (50 * .02), places=6)
        self.assertAlmostEqual(r["traces"]["frequency"][-1], 50.1, places=6)

    def test_gfl_tracks_frequency_without_frequency_watt(self):
        r = model.solve(dict(mode="gfl", event="f", step=.1))
        self.assertAlmostEqual(r["traces"]["p"][-1], .6, places=10)
        self.assertAlmostEqual(r["traces"]["frequency"][-1], 50.1, places=8)

    def test_parallel_kcl_and_power_sum_off_equilibrium(self):
        m = model.TeachingCase("parallel", model.settings({}))
        x = m.x0[:]
        x[0] += .01
        x[4] -= .015
        x[2] += .008
        e = m.evaluate(x, True)
        self.assertLess(abs(sum(e["powers"]) - complex(e["p"], e["q"])), 1e-12)
        self.assertLess(abs(e["voltage"] - 1 - m.zg * sum(e["currents"])), 1e-12)

    def test_reset_preserves_terminal_quantities_away_from_equilibrium(self):
        for event, step in (("p", .03), ("q", .01), ("v", -.01), ("f", .1)):
            m = model.TeachingCase("switch", model.settings(dict(event=event, step=step)))
            x = m.x0[:]
            x[0] += .012
            x[1] = .001
            x[2] += .02
            before = m.evaluate(x, True)
            reset, error = m.reset_to_vsm(x)
            after = m.evaluate(reset, True)
            self.assertLess(error, 1e-12)
            self.assertLess(abs(before["currents"][0] - after["currents"][0]), 1e-12)
            self.assertLess(abs(after["dx"][1]), 1e-12)
            self.assertGreater(abs(reset[0] - x[0]), .01)

    def test_exact_event_boundaries_and_reset(self):
        r = model.solve(dict(mode="switch", dt=.0007))
        for event in (1., 2.):
            i = r["time"].index(event)
            self.assertEqual(r["time"][i + 1], event)
        self.assertLess(r["reset_error"], 1e-12)

    def test_lcl_energy_and_equilibrium(self):
        r = model.solve(dict(mode="lcl"))
        self.assertEqual(r["state_count"], 6)
        self.assertLess(r["initial_residual"], 1e-10)
        self.assertLess(r["network_residual"], 1e-12)
        self.assertGreater(max(r["traces"]["i2d"]) - min(r["traces"]["i2d"]), .001)

    def test_timestep_refinement(self):
        for family in ("gfl", "droop", "vsm", "parallel"):
            a = model.solve(dict(mode=family))
            b = model.solve(dict(mode=family, dt=.00025))
            self.assertEqual(a["time"], b["time"])
            error = max(abs(v - w) for key in a["traces"] for v, w in zip(a["traces"][key], b["traces"][key]))
            self.assertLess(error, 1e-8)

    def test_reject_nonfinite_and_out_of_domain_inputs(self):
        for c in (dict(mode="other"), dict(scr=0), dict(mp=0), dict(step=float("nan")),
                  dict(inertia=float("inf")), dict(dt=0), dict(duration=100), dict(mode="lcl", step=.05)):
            with self.assertRaises(ValueError):
                model.solve(c)
        m = model.TeachingCase("droop", model.settings({}))
        x = m.x0[:]
        x[-1] = 50
        with self.assertRaisesRegex(ValueError, "domain"):
            m.evaluate(x)

    def test_precomputed_baselines_use_current_source(self):
        baseline = json.loads((ROOT / "assets/code/ibr-modeling-baselines.json").read_text())
        self.assertEqual(baseline["_meta"]["solver_sha256"], hashlib.sha256(SOURCE.read_bytes()).hexdigest())
        def compare(expected, actual):
            if isinstance(expected, dict):
                self.assertEqual(expected.keys(), actual.keys())
                for key in expected:
                    compare(expected[key], actual[key])
            elif isinstance(expected, list):
                self.assertEqual(len(expected), len(actual))
                for a, b in zip(expected, actual):
                    compare(a, b)
            elif isinstance(expected, float):
                # libm and Python versions can differ in the final floating-point bits.
                self.assertTrue(math.isclose(expected, actual, abs_tol=2e-10, rel_tol=2e-10))
            else:
                self.assertEqual(expected, actual)
        for mode in ("frame", "lcl", "gfl", "droop", "vsm", "parallel", "switch", "compare"):
            compare(baseline[mode], model.solve(dict(mode=mode)))


class RenderedTest(unittest.TestCase):
    def test_downloadable_notebooks_execute_without_external_packages(self):
        for lang in ("en", "zh"):
            nb = json.loads((ROOT / f"assets/code/ibr-dynamic-modeling-{lang}.ipynb").read_text())
            self.assertEqual(nb["nbformat"], 4)
            namespace = {"__name__": "course_notebook"}
            with contextlib.redirect_stdout(io.StringIO()):
                for cell in nb["cells"]:
                    if cell["cell_type"] == "code":
                        self.assertIsNone(cell["execution_count"])
                        self.assertEqual(cell["outputs"], [])
                        exec("".join(cell["source"]), namespace)
            self.assertEqual(namespace["result"]["mode"], "compare")

    def test_bilingual_lessons_and_asset_isolation(self):
        catalog = json.loads((ROOT / "_data/ibr_courses.json").read_text())
        content = json.loads((ROOT / "_data/ibr_modeling.json").read_text())
        modules = catalog["courses"][0]["modules"]
        self.assertEqual(len(content["lessons"]), 9)
        for prefix in ("", "zh/"):
            base = SITE / prefix / "teaching/course-development/ibr"
            for module in modules:
                text = (base / "modeling" / module["slug"] / "index.html").read_text()
                for marker in ("data-ibr-lab", "data-experiment-editor", "data-solver-editor", "data-quiz", "data-math", "ibr-modeling-lesson.js"):
                    self.assertIn(marker, text)
                self.assertNotIn("Experiment direction · Planned", text)
                parser = HTMLParser()
                # IDs and all on-page links must resolve without duplicate anchors.
                ids, anchors = [], []
                def start(tag, attrs):
                    attrs = dict(attrs)
                    if "id" in attrs:
                        ids.append(attrs["id"])
                    if tag == "a" and attrs.get("href", "").startswith("#"):
                        anchors.append(attrs["href"][1:])
                parser.handle_starttag = start
                parser.feed(text)
                self.assertEqual(len(ids), len(set(ids)))
                self.assertTrue(set(anchors).issubset(ids))
            other = (base / "stability-reduction" / "index.html").read_text()
            self.assertNotIn("ibr-modeling-lesson.js", other)
            self.assertNotIn("ibr-modeling.css", other)


if __name__ == "__main__":
    unittest.main()
