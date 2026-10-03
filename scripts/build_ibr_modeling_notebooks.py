"""Package both authored course languages with the standalone teaching solver."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / "_data/ibr_courses.json").read_text())["courses"][0]
lessons = json.loads((ROOT / "_data/ibr_modeling.json").read_text())["lessons"]
source = (ROOT / "assets/code/ibr-modeling.py").read_text().split('\nif __name__ ==')[0]


def cell(kind, text, number):
    value = dict(cell_type=kind, id=f"ibr-{number:02}", metadata={}, source=text.splitlines(True))
    if kind == "code":
        value.update(execution_count=None, outputs=[])
    return value


for lang in ("en", "zh"):
    intro = ("九个教学单元。求解器只依赖 Python 标准库；不需要安装 ibrsim。"
             "低频实验使用额定频率代数网络与理想电流 / 电压实现，不等同于完整阶次模型。"
             "每次运行保留参数、端口、残差及适用范围。网页版本提供交互图。" if lang == "zh" else
             "Nine teaching lessons. The solver uses only Python's standard library; ibrsim is not required. "
             "The low-frequency experiments use nominal-frequency algebraic networks with ideal current/voltage realizations, "
             "separate from the full-order source models. Keep parameters, ports, residuals and scope with every run. "
             "The website provides interactive plots.")
    cells = [cell("markdown", "# " + catalog["title"][lang] + "\n\n" + intro + "\n", 0), cell("code", source, 1)]
    for module in catalog["modules"]:
        lesson = lessons[module["id"]]
        prose = "## " + module["id"] + " · " + module["title"][lang] + "\n\n" + lesson["body"][lang] + "\n\n"
        for equation in lesson["equations"]:
            prose += "$$\n" + equation + "\n$$\n\n"
        prose += "\n".join(f"{i + 1}. {step[lang]}" for i, step in enumerate(lesson["steps"])) + "\n"
        cells.append(cell("markdown", prose, len(cells)))
        experiment = f'case = {{"mode": "{lesson["lab"]}", "scr": 5, "step": {0.005 if lesson["lab"] == "lcl" else 0.03}, "event": "p", "duration": 4}}\n'
        experiment += 'result = solve(case)\nprint("states:", result["state_count"])\nprint("initial residual:", result["initial_residual"])\nprint("network / energy residual:", result["network_residual"])\nprint("reset:", result["reset_error"])\nprint("final:", {k: values[-1] for k, values in result["traces"].items()})\n'
        cells.append(cell("code", experiment, len(cells)))
        practice = lesson["quiz"]["question"][lang] + "\n\n" + "\n".join(f'{i + 1}. {option[lang]}' for i, option in enumerate(lesson["quiz"]["options"]))
        practice += "\n\n<details><summary>" + ("解释" if lang == "zh" else "Explanation") + "</summary>\n\n" + lesson["quiz"]["answer"][lang] + "\n\n</details>\n"
        cells.append(cell("markdown", practice, len(cells)))
    notebook = dict(nbformat=4, nbformat_minor=5, cells=cells, metadata={
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.11"},
        "ibr_teaching_scope": "Independent teaching realizations adapted from PINN-IBR; not external validation"})
    (ROOT / f"assets/code/ibr-dynamic-modeling-{lang}.ipynb").write_text(json.dumps(notebook, ensure_ascii=False, indent=2) + "\n")
print("Packaged two bilingual course notebooks.")
