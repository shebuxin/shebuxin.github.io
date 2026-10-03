"""Regenerate course previews from the exact downloadable teaching solver."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/code/ibr-modeling.py"
spec = importlib.util.spec_from_file_location("ibr_teaching", SOURCE)
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
results = {mode: model.solve({"mode": mode}) for mode in
           ("frame", "lcl", "gfl", "droop", "vsm", "parallel", "switch", "compare")}
results["_meta"] = {"solver_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                    "generated_by": "scripts/build_ibr_modeling_baselines.py"}
(ROOT / "assets/code/ibr-modeling-baselines.json").write_text(
    json.dumps(results, separators=(",", ":"), allow_nan=False) + "\n")
print("Regenerated eight baseline experiments.")
