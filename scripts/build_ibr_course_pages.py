"""Create bilingual IBR course wrappers without overwriting authored pages."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "_data/ibr_courses.json").read_text(encoding="utf-8"))


def create_page(path, metadata, include):
    if path.exists():
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["---", "layout: course", "ibr_courses: true"]
    fields.extend(f"{key}: {json.dumps(value, ensure_ascii=False)}" for key, value in metadata.items())
    fields.extend(("---", "", "{% include " + include + " %}", ""))
    path.write_text("\n".join(fields), encoding="utf-8")
    return 1


def main():
    created = 0
    for lang in ("en", "zh"):
        prefix = "/zh" if lang == "zh" else ""
        base = prefix + "/teaching/course-development/ibr/"
        directory = ROOT / "_pages" / ("zh/course-development/ibr" if lang == "zh" else "course-development/ibr")
        common = {"lang": lang, "course_title": CATALOG["title"][lang]}
        created += create_page(directory / "index.md", {
            **common, "title": CATALOG["title"][lang], "permalink": base,
            "description": CATALOG["summary"][lang],
        }, "ibr-index.html")
        for course in CATALOG["courses"]:
            authored_modeling = course["id"] == "C1" and course["status"] == "lessons"
            course_flags = {"ibr_modeling": True} if authored_modeling else {}
            course_url = base + course["slug"] + "/"
            created += create_page(directory / course["slug"] / "index.md", {
                **common, **course_flags, "course_id": course["id"], "title": course["title"][lang],
                "permalink": course_url, "description": course["summary"][lang],
                "parent_url": base, "parent_title": CATALOG["title"][lang],
            }, "ibr-course.html")
            for module in course["modules"]:
                created += create_page(directory / course["slug"] / (module["slug"] + ".md"), {
                    **common, **course_flags, "course_id": course["id"], "module_id": module["id"],
                    "title": module["title"][lang], "description": module["summary"][lang],
                    "course_title": course["title"][lang],
                    "permalink": course_url + module["slug"] + "/",
                    "parent_url": course_url, "parent_title": course["title"][lang],
                }, "ibr-modeling-module.html" if authored_modeling else "ibr-module.html")
    print(f"Created {created} pages; existing pages were preserved.")


if __name__ == "__main__":
    main()
