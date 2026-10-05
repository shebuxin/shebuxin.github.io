#!/usr/bin/env python3
"""Prepare explicitly registered private ECE 685 PDFs for a course corpus.

Requires scripts/requirements-ece685-rag.txt. Never walks archives/directories,
publishes PDFs, calls models, or assigns a textbook's problem numbers to a
different edition. Font-damaged pages are quarantined instead of uploaded.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import sys

from export_ece685_chat_corpus import ROOT, canonical, clean_text, digest, private_output, quality_flags

DEFAULT_REGISTRY = ROOT / "_source/ece685-rag/sources.json"
DEFAULT_MATERIALS = ROOT / "_source/ece685-rag/materials"
DEFAULT_NOTES = ROOT / "_source/ece685-rag/verified-notes.json"


def safe_material(root, filename):
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]*\.pdf", filename):
        raise ValueError("Reference must name a registered PDF basename")
    target = (root / filename).resolve()
    if not target.is_relative_to(root.resolve()) or not target.is_file():
        raise ValueError("Missing registered reference: " + filename)
    return target


def clean_pdf_text(text, kind):
    if kind == "textbook":
        # Known repeated production/footer block in this textbook. Keep the
        # original file hash and raw extraction hash for review provenance.
        text = re.split(r"\n32134_[^\n]*\.indd[^\n]*", text, maxsplit=1)[0]
    return clean_text(text)


def bookmarks(reader):
    result = []

    def walk(nodes, chapter=None):
        for node in nodes:
            if isinstance(node, list):
                walk(node, chapter)
                continue
            title = node.title.replace("\x00", "").strip()
            chapter_match = re.match(r"Ch\s+(\d+):\s*(.*)", title)
            if chapter_match:
                chapter = chapter_match[1]
            section_match = re.match(r"(\d+\.\d+):\s*(.*)", title)
            result.append(dict(title=title, chapter_id=chapter,
                               section_id=section_match[1] if section_match else None,
                               is_chapter=bool(chapter_match),
                               pdf_page_number=reader.get_destination_page_number(node) + 1))

    walk(reader.outline)
    return result


def page_context(outline, number):
    chapters = [row for row in outline if row["is_chapter"] and row["pdf_page_number"] <= number]
    chapter = chapters[-1] if chapters else None
    children = [row for row in outline if not row["is_chapter"]
                and row["chapter_id"] == (chapter["chapter_id"] if chapter else None)
                and row["pdf_page_number"] <= number]
    if children:
        # A physical page may contain the end of one section and the start of
        # another. Record both; do not invent an exact within-page boundary.
        starts = [row for row in children if row["pdf_page_number"] == number]
        earlier = [row for row in children if row["pdf_page_number"] < number]
        relevant = ([earlier[-1]] if earlier and starts else []) + (starts or [children[-1]])
    else:
        relevant = []
    return chapter, relevant


def base_record(source, number, printed, context, platform_edition):
    chapter, sections = context
    section_ids = [r["section_id"] for r in sections if r["section_id"]]
    lecture_ids = set(source.get("lecture_ids", []))
    if chapter:
        lecture_ids.update(source.get("chapter_lectures", {}).get(chapter["chapter_id"], []))
    for section in section_ids:
        lecture_ids.update(source.get("section_lectures", {}).get(section, []))
    edition = source.get("edition")
    compatible = source["kind"] != "textbook" or edition == platform_edition
    label = source["title"]["en"] + (", §" + "/".join(section_ids) if section_ids else "")
    label += f", printed p. {printed} (PDF p. {number})" if printed is not None else f", PDF p. {number}"
    return dict(doc_id=f"ECE685:reference:{source['id']}:page:{number:04}",
                course_id="ECE685", kind="reference", reference_id=source["id"], language="en",
                lecture_id=None, lecture_ids=sorted(lecture_ids), title=source["title"],
                source_type=source["kind"], source_role=source["role"], source_sha256=source["sha256"],
                authors=source.get("authors", []), publisher=source.get("publisher"), isbn=source.get("isbn"),
                publication_year=source["year"], edition=edition, term=source.get("term"),
                pdf_page_number=number, printed_page=printed,
                chapter_id=chapter["chapter_id"] if chapter else None,
                chapter_title=chapter["title"] if chapter else None,
                section_ids=section_ids, section_titles=[r["title"] for r in sections],
                topic_tags=[topic for topic, pages in source.get("topic_pages", {}).items() if number in pages],
                compatible_for_assigned_problem_lookup=compatible,
                source_url=None, source_urls={}, access="private_reference",
                citation=dict(label=label, url=None, reference_id=source["id"], edition=edition,
                              publication_year=source["year"], pdf_page_number=number, printed_page=printed))


def material_selection_record(registry):
    """Index the instructor's scoped choice without changing any PDF source."""
    selection = registry.get("textbook_selection")
    if not selection:
        return None
    source = next((s for s in registry["sources"] if s["id"] == selection["source_id"]), None)
    syllabus = next((s for s in registry["sources"] if s["id"] == selection["syllabus_source_id"]), None)
    if (not source or source["kind"] != "textbook" or not syllabus or syllabus["kind"] != "syllabus"
            or source.get("edition") != selection["edition"]
            or selection["edition"] != registry["platform_textbook_edition"]
            or selection["authority"] != "instructor" or not selection["instruction"].strip()
            or not re.fullmatch(r"[a-z0-9-]+", selection["id"])
            or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", selection["selected_on"])):
        raise ValueError("Textbook selection does not match the registered platform basis")
    text = (f"ECE 685 platform textbook selection, recorded {selection['selected_on']}. "
            f"The instructor explicitly instructed: {selection['instruction']}. "
            f"The platform prepares and uses {source['title']['en']} ({source['year']}) as its default textbook basis. "
            f"The original {registry['current_term']} syllabus states edition {selection['syllabus_stated_edition']}; "
            "its PDF and bibliographic wording remain unchanged. This later instructor decision concerns the platform's "
            "reference preparation and default textbook basis, not a rewritten syllabus or a change to grading, dates or AI policy. "
            "Textbook sections, examples, printed pages and exercise numbers refer to the selected edition by default. "
            "If a student explicitly names a different edition, do not substitute the same exercise number from this edition. "
            "Ask for that exercise's text or a source in the named edition if unavailable. "
            "Edition compatibility does not certify that a particular exercise has been imported or verified.")
    reference_id = selection["id"]
    title = dict(en="ECE 685 platform textbook selection", zh="ECE 685 平台教材选择说明")
    year = int(selection["selected_on"][:4])
    return dict(doc_id=f"ECE685:reference:{reference_id}:decision:edition", course_id="ECE685", kind="reference",
                reference_id=reference_id, language="en", lecture_id=None, lecture_ids=[], title=title,
                source_type="course_material_selection", source_role="platform_textbook_basis",
                source_sha256=digest(canonical(selection).encode()), content_sha256=digest(text.encode()),
                raw_text_sha256=None, authors=["ECE 685 instructor"], publisher=None, isbn=None,
                publication_year=year, edition=selection["edition"], term=registry["current_term"],
                pdf_page_number=None, pdf_page_label=None, printed_page=None, chapter_id=None, chapter_title=None,
                section_ids=[], section_titles=[], topic_tags=["platform-textbook-selection"],
                compatible_for_assigned_problem_lookup=True, source_url=None, source_urls={}, access="private_reference",
                text=text, quality_flags=[], index_eligible=True, math_fidelity="not_applicable",
                unverified_math_fonts=[], textbook_selection=selection,
                citation=dict(label=f"ECE 685 instructor platform textbook selection, {selection['selected_on']}", url=None,
                              reference_id=reference_id, edition=selection["edition"], publication_year=year,
                              pdf_page_number=None, printed_page=None))


def prepare(registry_path=DEFAULT_REGISTRY, material_root=DEFAULT_MATERIALS,
            output=None, notes_path=DEFAULT_NOTES, reader_factory=None, progress=None):
    registry_path, material_root = Path(registry_path), Path(material_root)
    output = private_output(ROOT, Path(output) if output else ROOT / "tmp/ece685-chat/references")
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    if registry["schema_version"] != 1 or registry["course_id"] != "ECE685":
        raise ValueError("Unsupported reference registry")
    sources = registry["sources"]
    ids = [s["id"] for s in sources]
    if len(set(ids)) != len(ids) or any(not re.fullmatch(r"[a-z0-9-]+", source_id) for source_id in ids):
        raise ValueError("Invalid or duplicate reference ID")
    selection_record = material_selection_record(registry)
    if selection_record and selection_record["reference_id"] in ids:
        raise ValueError("Duplicate reference ID for textbook selection")
    if reader_factory is None:
        from pypdf import PdfReader
        reader_factory = PdfReader
    all_pages, eligible, quarantined, reports = [], [], [], []
    for source in sources:
        if source["kind"] not in {"syllabus", "textbook", "reading"} or source["access"] != "private_reference":
            raise ValueError("Unapproved reference type or access")
        if source["kind"] == "syllabus" and (source.get("term") != registry["current_term"] or source["role"] != "current_course_policy"):
            raise ValueError("An archived syllabus cannot be current course policy")
        path = safe_material(material_root, source["filename"])
        if digest(path.read_bytes()) != source["sha256"]:
            raise ValueError("Reference hash mismatch: " + source["id"])
        reader = reader_factory(path)
        if len(reader.pages) != source["page_count"]:
            raise ValueError("Reference page count mismatch: " + source["id"])
        check = source["identity_check"]
        identity = reader.pages[check["page"] - 1].extract_text() or ""
        if any(part not in identity for part in check["contains"]):
            raise ValueError("Reference identity/version mismatch: " + source["id"])
        selected = []
        for start, end in source["page_ranges"]:
            if not 1 <= start <= end <= len(reader.pages):
                raise ValueError("Invalid reference page range")
            selected.extend(range(start, end + 1))
        if len(set(selected)) != len(selected) or not selected:
            raise ValueError("Duplicate or empty reference page ranges")
        outline = bookmarks(reader) if source["kind"] == "textbook" else []
        labels = reader.page_labels
        has_labels = bool(reader.trailer["/Root"].get("/PageLabels"))
        report_pages = []
        for number in selected:
            fonts = set()

            def inspect_font(text, cm, tm, font, size):
                if text.strip() and font and "MathematicalPi" in str(font.get("/BaseFont", "")):
                    fonts.add(str(font["/BaseFont"]).split("+")[-1])

            raw = reader.pages[number - 1].extract_text(visitor_text=inspect_font) or ""
            text = clean_pdf_text(raw, source["kind"])
            flags = quality_flags(text)
            if fonts:
                flags.append("unverified_math_font_encoding")
            if source["kind"] == "textbook" and source.get("edition") != registry["platform_textbook_edition"]:
                flags.append("different_from_platform_edition")
            if source["kind"] == "reading" and re.search(r"\bTable\s+\d", text, re.I):
                flags.append("table_layout_needs_review")
            index_eligible = not any(f in flags for f in ("no_extracted_text", "suspect_glyphs", "unverified_math_font_encoding"))
            # This registered textbook's labels agree with its printed pages.
            # Report metadata can instead number an unnumbered cover as "1";
            # preserve such labels separately without claiming printed numbers.
            page_label = str(labels[number - 1]) if has_labels else None
            printed = page_label if source["kind"] == "textbook" else None
            record = base_record(source, number, printed, page_context(outline, number), registry["platform_textbook_edition"])
            record.update(text=text, content_sha256=digest(text.encode()), raw_text_sha256=digest(raw.encode()),
                          pdf_page_label=page_label,
                          quality_flags=flags, index_eligible=index_eligible,
                          math_fidelity="requires_original_page_review" if source["kind"] == "textbook" else "not_certified",
                          unverified_math_fonts=sorted(fonts))
            all_pages.append(record)
            (eligible if index_eligible else quarantined).append(record)
            report_pages.append(dict(pdf_page_number=number, printed_page=record["printed_page"],
                                     chapter_id=record["chapter_id"], section_ids=record["section_ids"],
                                     text_characters=len(text), flags=flags, index_eligible=index_eligible))
            if progress and (number == selected[0] or number % 50 == 0 or number == selected[-1]):
                progress(f"{source['id']}: processed physical page {number}/{selected[-1]}")
        reports.append(dict(reference_id=source["id"], source_type=source["kind"], source_role=source["role"],
                            title=source["title"], publication_year=source["year"], edition=source.get("edition"),
                            source_sha256=source["sha256"], total_pdf_pages=len(reader.pages),
                            selected_pdf_pages=len(selected), indexable_pages=sum(p["index_eligible"] for p in report_pages),
                            quarantined_pages=sum(not p["index_eligible"] for p in report_pages),
                            page_ranges=source["page_ranges"], pages=report_pages))
    notes = json.loads(Path(notes_path).read_text(encoding="utf-8"))["notes"] if notes_path and Path(notes_path).is_file() else []
    for note in notes:
        source = next((s for s in sources if s["id"] == note["source_id"]), None)
        original = next((p for p in all_pages if p["reference_id"] == note["source_id"] and p["pdf_page_number"] == note["pdf_page_number"]), None)
        if (not source or not original or note["source_sha256"] != source["sha256"]
                or note["printed_page"] != original["printed_page"] or note["section_id"] not in original["section_ids"]):
            raise ValueError("Verified note has a stale source/page identity")
        if not re.fullmatch(r"[a-z0-9-]+", note["id"]) or not note["review_method"] or not note["text"].strip():
            raise ValueError("Invalid verified note")
        record = dict(original)
        record.update(doc_id=f"ECE685:reference:{source['id']}:verified:{note['id']}", text=note["text"],
                      source_type="verified_reference_note", underlying_source_type=source["kind"],
                      lecture_ids=note["lecture_ids"], section_ids=[note["section_id"]],
                      quality_flags=["different_from_platform_edition"] if not original["compatible_for_assigned_problem_lookup"] else [],
                      index_eligible=True, math_fidelity="visually_verified_note", review_method=note["review_method"],
                      content_sha256=digest(note["text"].encode()), raw_text_sha256=None,
                      unverified_math_fonts=[])
        record["section_titles"] = [title for title in original["section_titles"] if title.startswith(note["section_id"] + ":")]
        record["citation"] = dict(original["citation"], label=source["title"]["en"] +
                                  f", §{note['section_id']}, printed p. {note['printed_page']} (PDF p. {note['pdf_page_number']})")
        eligible.append(record)
    if selection_record:
        eligible.append(selection_record)
    if len({r["doc_id"] for r in eligible}) != len(eligible):
        raise ValueError("Duplicate reference document ID")
    flags = Counter(f for r in all_pages for f in r["quality_flags"])
    report = dict(course_id="ECE685", current_term=registry["current_term"], platform_textbook_edition=registry["platform_textbook_edition"],
                  textbook_selection=registry.get("textbook_selection"), material_selection_document_count=int(selection_record is not None),
                  source_count=len(sources), selected_pdf_pages=len(all_pages), indexable_pdf_pages=len(all_pages) - len(quarantined),
                  quarantined_pdf_pages=len(quarantined), verified_note_count=len(notes), quality_flag_counts=dict(flags),
                  sources=reports, gaps=registry.get("gaps", []),
                  rag_status="preparation_in_progress",
                  review_note="Physical and printed pages are separate. Font-damaged pages are withheld from retrieval; unflagged text is not a guarantee of formula or table fidelity. Exercise lookup must match the requested edition and use the actual exercise text. Platform material selection is recorded separately from original syllabus wording.")
    version = "references-" + digest(canonical(dict(registry=registry, documents=eligible, quarantine=quarantined)).encode())[:20]
    destination = output / version
    destination.mkdir(parents=True, exist_ok=True)
    for name, rows in (("references.jsonl", eligible), ("quarantine.jsonl", quarantined)):
        (destination / name).write_text("".join(canonical(r) + "\n" for r in rows), encoding="utf-8")
    (destination / "quality-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = dict(schema_version=1, course_id="ECE685", reference_version=version,
                    reference_ids=ids + ([selection_record["reference_id"]] if selection_record else []), document_count=len(eligible),
                    documents_file="references.jsonl", documents_sha256=digest((destination / "references.jsonl").read_bytes()),
                    report_file="quality-report.json", report_sha256=digest((destination / "quality-report.json").read_bytes()))
    (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return destination, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--materials", type=Path, default=DEFAULT_MATERIALS)
    parser.add_argument("--notes", type=Path, default=DEFAULT_NOTES)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        destination, report = prepare(args.registry, args.materials, args.output, args.notes,
                                      progress=lambda message: print(message, file=sys.stderr, flush=True))
    except (ValueError, KeyError, OSError, ImportError) as error:
        parser.exit(1, "Reference import failed: " + str(error) + "\n")
    print(f"Prepared {report['source_count']} sources / {report['selected_pdf_pages']} selected PDF pages: {destination}")
    print(f"Indexable pages: {report['indexable_pdf_pages']}; quarantined: {report['quarantined_pdf_pages']}; verified notes: {report['verified_note_count']}")


if __name__ == "__main__":
    main()
