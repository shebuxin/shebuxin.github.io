#!/usr/bin/env python3
"""Import the current lecture directory (not archived decks) into the course shell.

Usage: python3 scripts/import_ece685_outline.py /path/to/ECE685_Course_Package_v2
This reads TeX slide headings only. It does not copy slides, notes, or assessments.
Translations and planned experiment topics are maintained in _data/ece685_topics.json.
"""

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY_MODELS = {
    "L01": "overview", "L03": "generation", "L06": "single-phase",
    "L08": "three-phase", "L10": "transformers", "L13": "per-unit",
    "L16": "exam-review",
}


def braced(text, start):
    """Read a TeX argument while preserving nested and escaped braces."""
    if text[start] != "{":
        raise ValueError("Expected a TeX argument")
    depth = 1
    i = start + 1
    while i < len(text):
        if text[i] == "\\":
            i += 2
            continue
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1:i], i + 1
        i += 1
    raise ValueError("Unclosed TeX argument")


def plain(text):
    # Use the accessible PDF form for headings containing mathematical TeX.
    while "\\texorpdfstring" in text:
        start = text.index("\\texorpdfstring")
        arg = start + len("\\texorpdfstring")
        first, end = braced(text, arg)
        second, end = braced(text, end)
        text = text[:start] + second + text[end:]
    text = re.sub(r"\\fontsize\{[^}]*\}\{[^}]*\}", "", text)
    text = re.sub(r"\\makebox(?:\[[^\]]*\])*", "", text)
    text = re.sub(r"\^\s*(?:\{\s*)?\\circ(?:\s*\})?", "°", text)
    symbols = {"Delta": "Δ", "delta": "δ", "pi": "π", "phi": "φ",
               "theta": "θ", "jmathu": "j", "Omega": "Ω", "leftrightarrow": "↔"}
    for name, value in symbols.items():
        text = re.sub(r"\\" + name + r"\b", value, text)
    text = text.replace("\\&", "&").replace("\\%", "%")
    text = text.replace("\\_", "_").replace("\\\\", " ")
    text = re.sub(r"\\[a-zA-Z]+(?:\[[^\]]*\])?", " ", text)
    text = re.sub(r"\\[^a-zA-Z]", " ", text)
    text = re.sub(r"[{}$]", "", text).replace("~", " ").replace("--", "–")
    return " ".join(text.split())


def extract(path):
    text = re.sub(r"(?<!\\)%[^\n]*", "", path.read_text(encoding="utf-8"))
    title = re.search(r"\\title(?:\[[^\]]*\])?\s*(?=\{)", text)
    if not title:
        raise ValueError(f"Missing title: {path}")
    heading, _ = braced(text, title.end())
    frames = list(re.finditer(r"\\begin\{frame\}(?:\[[^\]]*\])?\s*", text))
    outline = []
    for number, frame in enumerate(frames, 1):
        if text[frame.end():].startswith("{"):
            raw, _ = braced(text, frame.end())
            outline.append({"slide": number, "title": plain(raw)})
    return plain(heading), len(frames), outline


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    args = parser.parse_args()
    source = args.package / "01_lectures"
    topics = json.loads((ROOT / "_data/ece685_topics.json").read_text())
    lectures = []
    for folder in sorted(source.iterdir()):
        deck = folder / (folder.name + ".tex")
        if not folder.is_dir() or not deck.is_file():
            continue
        match = re.fullmatch(r"(L\d+[a-z]?)_(.+)", folder.name)
        if not match:
            raise ValueError(f"Unrecognized lecture folder: {folder.name}")
        lecture_id = match[1]
        if lecture_id not in topics["lectures"]:
            raise ValueError(f"Add a translation and topic for {lecture_id} before importing")
        title, count, outline = extract(deck)
        lecture = dict(topics["lectures"][lecture_id])
        lecture.update(id=lecture_id, slug=folder.name.lower().replace("_", "-"),
                       title={"en": title, "zh": lecture.pop("title_zh")},
                       source_directory=folder.name, source_file=folder.name + ".pdf",
                       slide_count=count, slide_outline=outline,
                       status="live" if lecture.get("released") else "unreleased")
        lectures.append(lecture)
    if not lectures:
        raise ValueError("No current lecture decks found")
    manifest = {"source": "ECE685_Course_Package_v2/01_lectures",
                "groups": topics["groups"], "lectures": lectures}
    (ROOT / "_data/ece685.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for lang in ("en", "zh"):
        directory = ROOT / "_pages" / ("zh" if lang == "zh" else "") / "course-development/ece685"
        directory.mkdir(parents=True, exist_ok=True)
        prefix = "/zh" if lang == "zh" else ""
        for lecture in lectures:
            page = directory / (lecture["slug"] + ".md")
            body = "{% include ece685-lecture.html %}\n"
            if page.exists():
                existing = re.fullmatch(r"---\n.*?\n---\n(.*)", page.read_text(), flags=re.DOTALL)
                if not existing:
                    raise ValueError(f"Invalid page front matter: {page}")
                body = existing[1].lstrip("\n")
            front = ["---", "layout: ece685", "ece685: true", f"lang: {lang}",
                     "title: " + json.dumps(lecture["id"] + " · " + lecture["title"][lang], ensure_ascii=False),
                     "description: " + json.dumps(lecture["summary"][lang], ensure_ascii=False),
                     f"lecture_id: {lecture['id']}",
                     f"permalink: {prefix}/teaching/course-development/ece685/{lecture['slug']}/"]
            if lecture["status"] == "live":
                front.append("ece685_slides: true")
            if lecture.get("interactive_model"):
                front.append("ece685_lab: true")
            if lecture["id"] in LEGACY_MODELS:
                model = LEGACY_MODELS[lecture["id"]]
                front.extend([
                    "redirect_from:",
                    f"  - {prefix}/teaching/course-development/ece685/modules/{model}/",
                    f"  - {prefix}/teaching/course-development/ece685/lecture-01/{model}/",
                ])
            front.extend(["---", "", body])
            page.write_text("\n".join(front), encoding="utf-8")
    print(f"Imported {len(lectures)} lectures, {sum(x['slide_count'] for x in lectures)} slides; refreshed bilingual lecture pages.")


if __name__ == "__main__":
    main()
