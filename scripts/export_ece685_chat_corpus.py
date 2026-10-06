#!/usr/bin/env python3
"""Export published ECE 685 lessons and an optional prepared reference bundle.

No network, credentials, PDF reprocessing, or model calls are involved. Outputs
are deterministic and versioned. A later index sync consumes manifest.json,
never every file in a directory. Python standard library only.
"""
import argparse
import ast
from collections import Counter
from dataclasses import dataclass, field
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from typing import Union
import unicodedata
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SECTIONS = ("lecture-overview", "lecture-experiment", "lecture-code", "lecture-practice")
HANDLERS = {"overview": "overview", "generation": "generation",
            "single-phase": "single_phase", "three-phase": "three_phase",
            "transformers": "transformers", "per-unit": "per_unit",
            "transformer-banks": "transformer_banks", "transformer-network": "transformer_network",
            "line-conductor": "line_conductor", "line-inductance": "line_inductance",
            "line-capacitance": "line_capacitance", "line-bundles": "line_bundles"}
VOID = set("area base br col embed hr img input link meta param source track wbr".split())
BLOCK = set("article section div p h1 h2 h3 h4 ul ol li figure figcaption pre details summary fieldset legend label".split())


def digest(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def private_output(root, output):
    root, output = Path(root).resolve(), Path(output).resolve()
    if output.is_relative_to(root) and not (output.is_relative_to(root / "tmp/ece685-chat") or output.is_relative_to(root / "_source/ece685-rag/materials")):
        raise ValueError("Private references must stay in ignored tmp/ece685-chat or _source/ece685-rag/materials directories")
    return output


@dataclass
class Element:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)

    def find(self, predicate):
        found = [self] if predicate(self) else []
        for child in self.children:
            if isinstance(child, Element):
                found.extend(child.find(predicate))
        return found


class LessonHTML(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.root = Element("document")
        self.stack = [self.root]
        self.feed(source)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Element(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def lesson_text(node: Union[Element, str]):
    """Use rendered visible teaching text, replacing math fallbacks with TeX.

    Reader text is indexed separately by physical PDF page. Shared JSON config,
    navigation, future-source links, editors and dynamic result placeholders
    must never leak into lesson documents.
    """
    if isinstance(node, str):
        return re.sub(r"\s+", " ", node)
    a = node.attrs
    classes = set(a.get("class", "").split())
    if (node.tag in {"script", "style", "nav", "button", "textarea", "svg", "noscript"}
            or "hidden" in a or "data-slide-reader" in a
            or a.get("role") == "status" or "aria-live" in a
            or classes.intersection({"ece-slide-outline", "stage-source"})):
        return ""
    formula = a.get("data-math", a.get("data-stage-math"))
    if formula is not None:
        return "\n$$" + formula + "$$\n"
    if node.tag == "img":
        return " " + a.get("alt", "") + " "
    if node.tag == "br":
        return "\n"
    inside = "".join(lesson_text(child) for child in node.children)
    if node.tag in {"strong", "em", "span", "code", "a"}:
        inside = " " + inside + " "
    if node.tag == "li":
        inside = "- " + inside
    return "\n" + inside + "\n" if node.tag in BLOCK else inside


def clean_text(text):
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def course_path(lecture, language="en"):
    return ("/zh" if language == "zh" else "") + "/teaching/ece685/" + lecture["slug"] + "/"


def asset(root, url, prefix):
    parsed = urlsplit(url)
    if (parsed.scheme or parsed.netloc or parsed.query or parsed.fragment
            or not url.startswith(prefix) or ".." in url or "%" in url or "\\" in url):
        raise ValueError("Invalid student asset path: " + url)
    path = (root / url.lstrip("/")).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError("Missing student asset: " + url)
    return path


def quality_flags(text):
    if not text.strip():
        return ["no_extracted_text"]
    flags = []
    if len(re.sub(r"\s", "", text)) < 40:
        flags.append("sparse_text")
    if any(c == "\ufffd" or unicodedata.category(c) in {"Co", "Cc"} and c not in "\n\r\t" for c in text):
        flags.append("suspect_glyphs")
    # Geometry is lost during PDF extraction: short math lines, combining hats,
    # and collapsed superscripts need visual verification, not an invented fix.
    short_math = sum(len(line.strip()) <= 5 and any(unicodedata.category(c) == "Sm" or 0x1D400 <= ord(c) <= 0x1D7FF for c in line)
                     for line in text.splitlines())
    if short_math >= 2 or "̂" in text or re.search(r"\b(?:cos|sin)2\b", text):
        flags.append("math_layout_needs_review")
    return flags


def code_documents(root, lecture):
    """Index the current handler and its helper dependencies, never execute it."""
    dedicated = lecture.get("lesson") == "l05-phasors"
    source_url = "/assets/code/" + ("l05_phasors.py" if dedicated else "ece685_stage_one.py")
    source = asset(root, source_url, "/assets/code/").read_text(encoding="utf-8")
    tree = ast.parse(source)
    functions = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}
    defaults = next(node.value for node in tree.body if isinstance(node, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id == "DEFAULTS" for t in node.targets))
    if dedicated:
        requested, default_text = {"solve"}, ast.get_source_segment(source, defaults)
    else:
        model = lecture["interactive_model"]
        requested = {HANDLERS[model], "solve"}
        default_node = next(value for key, value in zip(defaults.keys, defaults.values)
                            if isinstance(key, ast.Constant) and key.value == model)
        default_text = ast.get_source_segment(source, default_node)
    pending, selected = list(requested), set()
    while pending:
        name = pending.pop()
        if name in selected:
            continue
        selected.add(name)
        pending.extend(n.id for n in ast.walk(functions[name])
                       if isinstance(n, ast.Name) and n.id in functions and n.id not in selected)
    imports = "\n".join(ast.get_source_segment(source, n) for n in tree.body
                        if isinstance(n, (ast.Import, ast.ImportFrom)))
    records = []
    for name in sorted(selected, key=lambda n: functions[n].lineno):
        node = functions[name]
        dependencies = sorted({n.id for n in ast.walk(node) if isinstance(n, ast.Name)
                               and n.id in functions and n.id != name})
        text = (f"Teaching Python source: {source_url}, function {name}, lines {node.lineno}–{node.end_lineno}.\n"
                f"Current lecture: {lecture['id']}; model: {lecture.get('interactive_model') or 'l05-phasors'}.\n"
                "These are source excerpts; the downloadable file is the runnable program.\n"
                f"Imports:\n```python\n{imports}\n```\n"
                f"Default parameter entry for the current model:\n```python\n{default_text}\n```\n"
                f"Function dependencies: {', '.join(dependencies) or 'none'}.\n"
                f"```python\n{ast.get_source_segment(source, node)}\n```")
        records.append(dict(doc_id=f"ECE685:{lecture['id']}:code:{name}", kind="code", language="en",
                            section_id="lecture-code", function_name=name, line_number=node.lineno,
                            text=text, code_url=source_url, source_sha256=digest(source.encode()),
                            source_type="teaching_code", source_url=course_path(lecture) + "#lecture-code",
                            source_urls={lang: course_path(lecture, lang) + "#lecture-code" for lang in ("en", "zh")}))
    return records


def collect(root, site, lecture_ids=None):
    catalog = json.loads((root / "_data/ece685.json").read_text(encoding="utf-8"))["lectures"]
    excluded = set(json.loads((root / "_data/ece685_topics.json").read_text(encoding="utf-8"))["excluded_lectures"])
    slides = json.loads((root / "_data/ece685_slides.json").read_text(encoding="utf-8"))
    allowed = {row["id"]: row for row in catalog
               if row.get("status") == "live" and row.get("released") is True and row["id"] not in excluded}
    if lecture_ids and set(lecture_ids) - allowed.keys():
        raise ValueError("Only released student lectures may be exported: " + ", ".join(sorted(set(lecture_ids) - allowed.keys())))
    selected = [row for row in catalog if row["id"] in allowed and (not lecture_ids or row["id"] in lecture_ids)]
    records, coverage = [], []
    for lecture in selected:
        lecture_id = lecture["id"]
        if not re.fullmatch(r"L\d{2}[a-z]?", lecture_id) or not re.fullmatch(r"[a-z0-9-]+", lecture["slug"]):
            raise ValueError("Invalid lecture identity")
        metadata = slides[lecture_id]
        prefix = f"/assets/slides/ece685/{lecture_id.lower()}/"
        pdf = asset(root, metadata["pdf"], prefix)
        pdf_hash = digest(pdf.read_bytes())
        if pdf_hash != metadata["sha256"]:
            raise ValueError("Student PDF hash mismatch: " + lecture_id)
        pages = json.loads(asset(root, metadata["pages_json"], prefix).read_text(encoding="utf-8"))
        if len(pages) != metadata["page_count"]:
            raise ValueError("PDF page coverage mismatch: " + lecture_id)
        page_report = []
        for number, page in enumerate(pages, 1):
            if not isinstance(page.get("text"), str) or page.get("src") != prefix + f"page-{number:03}.webp":
                raise ValueError(f"Invalid physical page {lecture_id}:{number}")
            asset(root, page["src"], prefix)
            text = clean_text(page["text"])
            flags = quality_flags(text)
            page_report.append(dict(page_number=number, text_characters=len(text), flags=flags,
                                    text_searchable=bool(text), image_url=page["src"]))
            records.append(dict(doc_id=f"ECE685:{lecture_id}:slide:{number:03}", kind="slide", language="en",
                                page_number=number, section_id="lecture-overview", text=text,
                                source_type="student_slides", source_sha256=pdf_hash,
                                pdf_url=metadata["pdf"] + f"#page={number}", image_url=page["src"],
                                quality_flags=flags, source_url=course_path(lecture) + f"?slide={number}#lecture-overview",
                                source_urls={lang: course_path(lecture, lang) + f"?slide={number}#lecture-overview" for lang in ("en", "zh")}))
        for language in ("en", "zh"):
            html_path = site / course_path(lecture, language).lstrip("/") / "index.html"
            if not html_path.is_file():
                raise ValueError("Build Jekyll before exporting; missing " + str(html_path))
            source = html_path.read_text(encoding="utf-8")
            tree = LessonHTML(source).root
            platform = tree.find(lambda n: "data-ece-platform" in n.attrs)
            if len(platform) != 1 or platform[0].attrs.get("data-lecture-id") != lecture_id or platform[0].attrs.get("data-lang") != language:
                raise ValueError("Rendered lecture identity mismatch: " + str(html_path))
            for section_id in SECTIONS:
                nodes = platform[0].find(lambda n: n.tag == "section" and n.attrs.get("id") == section_id)
                if len(nodes) != 1:
                    raise ValueError("Expected one published section: " + str(html_path) + "#" + section_id)
                text = clean_text(lesson_text(nodes[0]))
                if not text:
                    raise ValueError("Empty published lesson section: " + lecture_id + ":" + section_id)
                records.append(dict(doc_id=f"ECE685:{lecture_id}:lesson:{language}:{section_id}", kind="lesson",
                                    language=language, section_id=section_id, text=text,
                                    source_type="platform_lesson", source_sha256=digest(text.encode()),
                                    source_url=course_path(lecture, language) + "#" + section_id,
                                    source_urls={lang: course_path(lecture, lang) + "#" + section_id for lang in ("en", "zh")}))
        code = code_documents(root, lecture)
        records.extend(code)
        coverage.append(dict(lecture_id=lecture_id, pdf_pages=len(pages), lesson_documents=8,
                             code_documents=len(code), pages=page_report))
        for record in records[-(len(pages) + 8 + len(code)):]:
            record.update(course_id="ECE685", lecture_id=lecture_id, title=lecture["title"],
                          content_sha256=digest(record["text"].encode()))
    if not records:
        raise ValueError("No published lectures selected")
    return records, coverage, sorted(set(row["id"] for row in catalog) - allowed.keys() | excluded)


def upload_markdown(record):
    if record["kind"] == "reference":
        header = (f"# ECE 685 reference · {record['title']['en']}\n\n"
                  f"Document ID: {record['doc_id']}\nSource type: {record['source_type']}\n"
                  f"Source role: {record['source_role']}\nPublication year: {record['publication_year']}\n"
                  f"Authors: {', '.join(record.get('authors', [])) or record.get('publisher') or 'see source'}\n"
                  f"Edition: {record['edition'] or 'not applicable'}\nCitation: {record['citation']['label']}\n"
                  f"Associated lectures: {', '.join(record['lecture_ids']) or 'course-wide reference'}\n"
                  f"Math fidelity: {record['math_fidelity']}\n")
        if not record["compatible_for_assigned_problem_lookup"]:
            header += "Edition limitation: this edition cannot identify the problem numbers in the platform's selected textbook edition.\n"
        if record["source_type"] == "textbook":
            header += "Exercise lookup: use this edition's actual exercise text; a matching edition alone does not certify exercise coverage or accuracy.\n"
        if record["source_role"] == "dated_generation_data":
            header += "Date limitation: retain the source's cost year, units and assumptions; these are historical data, not current prices.\n"
        if record["source_type"] == "verified_reference_note":
            header += "Provenance: course-authored, visually verified note about the cited reference page.\n"
        elif record["source_type"] == "course_material_selection":
            header += "Provenance: recorded instructor decision about platform materials; this is not a PDF excerpt.\n"
        else:
            header += "Extraction note: mathematical layout, tables and diagrams require verification against the original page.\n"
        return header + "\n" + record["text"] + "\n"
    position = f"PDF physical page {record['page_number']}" if record["kind"] == "slide" else record["section_id"]
    header = (f"# ECE 685 · {record['lecture_id']} · {record['title'][record['language']]}\n\n"
              f"Document ID: {record['doc_id']}\nSource type: {record['source_type']}\n"
              f"Language: {record['language']}\nPosition: {position}\nSource: {record['source_url']}\n")
    if record["kind"] == "slide":
        header += (f"Original PDF page: {record['pdf_url']}\n"
                   "Extraction note: PDF text loses spatial layout; verify equations, superscripts, fractions and diagrams against the original page.\n")
    return header + "\n" + (record["text"] or "No extracted text. This page requires an image/PDF explanation before reliable text retrieval.") + "\n"


def collect_references(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if (manifest.get("schema_version") != 1 or manifest.get("course_id") != "ECE685"
            or not re.fullmatch(r"references-[a-f0-9]{20}", manifest.get("reference_version", ""))):
        raise ValueError("Unsupported reference bundle")
    for filename, file_key, hash_key in (("references.jsonl", "documents_file", "documents_sha256"),
                                        ("quality-report.json", "report_file", "report_sha256")):
        if manifest.get(file_key) != filename or digest((directory / filename).read_bytes()) != manifest.get(hash_key):
            raise ValueError("Reference bundle hash/file mismatch")
    records = [json.loads(line) for line in (directory / "references.jsonl").read_text(encoding="utf-8").splitlines()]
    report = json.loads((directory / "quality-report.json").read_text(encoding="utf-8"))
    if len(records) != manifest["document_count"] or len({r["doc_id"] for r in records}) != len(records):
        raise ValueError("Reference document count/ID mismatch")
    for record in records:
        if (record.get("course_id") != "ECE685" or record.get("kind") != "reference"
                or record.get("reference_id") not in manifest["reference_ids"]
                or record.get("index_eligible") is not True
                or record.get("access") != "private_reference"
                or record.get("source_url") is not None or record.get("source_urls") != {}
                or record.get("content_sha256") != digest(record["text"].encode())
                or not re.fullmatch(r"ECE685:reference:[a-z0-9-]+:(?:page:[0-9]{4}|verified:[a-z0-9-]+|decision:edition)", record["doc_id"])):
            raise ValueError("Unverified or invalid reference document")
        if set(record.get("quality_flags", [])).intersection({"no_extracted_text", "suspect_glyphs", "unverified_math_font_encoding"}):
            raise ValueError("Quarantined reference may not enter retrieval")
        citation = record["citation"]
        if (citation["pdf_page_number"] != record["pdf_page_number"]
                or citation["printed_page"] != record["printed_page"] or citation.get("url") is not None):
            raise ValueError("Reference citation identity mismatch")
        if record["doc_id"].endswith(":decision:edition"):
            selection = record.get("textbook_selection")
            if (record["source_type"] != "course_material_selection" or not selection
                    or selection != report.get("textbook_selection")
                    or record["source_sha256"] != digest(canonical(selection).encode())
                    or record["edition"] != report.get("platform_textbook_edition")
                    or record["pdf_page_number"] is not None or record["printed_page"] is not None):
                raise ValueError("Invalid platform textbook selection provenance")
    return records, report, manifest["reference_version"]


def export(root=ROOT, site=None, output=None, lecture_ids=None, references=None):
    root = Path(root).resolve()
    site = Path(site).resolve() if site else root / "_site"
    output = Path(output).resolve() if output else root / "tmp/ece685-chat"
    records, coverage, excluded = collect(root, site, lecture_ids)
    reference_report, reference_version = None, None
    if references:
        private_output(root, output)
        reference_records, reference_report, reference_version = collect_references(references)
        records.extend(reference_records)
    version = "ece685-" + digest(canonical(dict(documents=records, reference_version=reference_version)).encode())[:20]
    destination = output / version
    (destination / "upload").mkdir(parents=True, exist_ok=True)
    uploads = []
    for record in records:
        record["corpus_version"] = version
        filename = "upload/" + record["doc_id"].replace(":", "-") + ".md"
        markdown = upload_markdown(record)
        (destination / filename).write_text(markdown, encoding="utf-8")
        uploads.append(dict(doc_id=record["doc_id"], path=filename, sha256=digest(markdown.encode()),
                            lecture_id=record["lecture_id"], kind=record["kind"], language=record["language"],
                            source_url=record["source_url"], source_urls=record["source_urls"],
                            reference_id=record.get("reference_id"), source_type=record["source_type"],
                            citation=record.get("citation")))
    (destination / "documents.jsonl").write_text("".join(canonical(r) + "\n" for r in records), encoding="utf-8")
    flags = Counter(flag for lecture in coverage for page in lecture["pages"] for flag in page["flags"])
    report = dict(corpus_version=version, lecture_count=len(coverage), pdf_page_count=sum(row["pdf_pages"] for row in coverage),
                  document_counts=dict(Counter(r["kind"] for r in records)), quality_flag_counts=dict(flags),
                  excluded_lectures=excluded, lectures=coverage,
                  references=reference_report,
                  rag_status="preparation_in_progress" if references else "lecture_only_incomplete",
                  review_note="Flags guide manual review. PDF layout fidelity and diagram meaning cannot be established from extracted text alone; lesson LaTeX is preserved separately.")
    (destination / "quality-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = dict(schema_version=2, corpus_version=version, course_id="ECE685", document_count=len(records),
                    lecture_ids=[row["lecture_id"] for row in coverage], uploads=uploads,
                    reference_version=reference_version, rag_status=report["rag_status"],
                    documents_sha256=digest((destination / "documents.jsonl").read_bytes()))
    if reference_report and reference_report.get("textbook_selection"):
        selection = reference_report["textbook_selection"]
        manifest.update(platform_textbook_edition=reference_report["platform_textbook_edition"],
                        textbook_selection_doc_id=f"ECE685:reference:{selection['id']}:decision:edition")
    # Written last: consumers only use complete exports that have a manifest.
    (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return destination, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lecture", action="append", help="Released lecture ID; repeat as needed. Default: all live lectures.")
    parser.add_argument("--site-dir", type=Path, default=ROOT / "_site")
    parser.add_argument("--output", type=Path, default=ROOT / "tmp/ece685-chat")
    parser.add_argument("--references", type=Path, help="Versioned directory prepared by import_ece685_chat_references.py")
    args = parser.parse_args()
    try:
        destination, report = export(site=args.site_dir, output=args.output, lecture_ids=args.lecture, references=args.references)
    except (ValueError, KeyError, OSError, StopIteration) as error:
        parser.exit(1, "Corpus export failed: " + str(error) + "\n")
    print(f"Exported {report['lecture_count']} lectures / {report['pdf_page_count']} PDF pages: {destination}")
    print("Quality flags: " + canonical(report["quality_flag_counts"]))
    print("RAG preparation status: " + report["rag_status"])


if __name__ == "__main__":
    main()
