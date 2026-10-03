#!/usr/bin/env python3
"""Copy released student PDFs without changes and render their pages for the web.

Usage: python scripts/import_ece685_lecture_assets.py /path/to/ECE685_Course_Package_v2
Requires Poppler, Pillow and pypdf. Never imports narration or instructor files.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--width", type=int, default=1600)
    args = parser.parse_args()
    manifest = json.loads((ROOT / "_data/ece685.json").read_text())
    result = {}
    for lecture in manifest["lectures"]:
        if lecture["status"] != "live":
            continue
        source = args.package / "01_lectures" / lecture["source_directory"] / lecture["source_file"]
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        folder = ROOT / "assets/slides/ece685" / lecture["id"].lower()
        folder.mkdir(parents=True, exist_ok=True)
        destination = folder / source.name
        shutil.copyfile(source, destination)
        reader = PdfReader(source)
        pages = []
        with tempfile.TemporaryDirectory(prefix="ece685-slides-") as temp:
            subprocess.run(["pdftoppm", "-png", "-scale-to", str(args.width), str(source), str(Path(temp) / "page")], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            rendered = sorted(Path(temp).glob("page-*.png"), key=lambda p: int(p.stem.split("-")[-1]))
            if len(rendered) != len(reader.pages):
                raise ValueError(f"Page-count mismatch for {lecture['id']}")
            for index, path in enumerate(rendered):
                name = f"page-{index+1:03d}.webp"
                with Image.open(path) as image:
                    image.convert("RGB").save(folder / name, "WEBP", quality=88, method=4)
                    width, height = image.size
                pages.append({"src": f"/assets/slides/ece685/{lecture['id'].lower()}/{name}",
                              "text": reader.pages[index].extract_text() or ""})
        text_path = folder / "pages.json"
        text_path.write_text(json.dumps(pages, ensure_ascii=False) + "\n")
        result[lecture["id"]] = {"pdf": "/" + str(destination.relative_to(ROOT)),
                                  "sha256": digest, "page_count": len(pages),
                                  "width": width, "height": height,
                                  "first_page": pages[0]["src"],
                                  "pages_json": "/" + str(text_path.relative_to(ROOT)),
                                  "source": f"01_lectures/{lecture['source_directory']}/{lecture['source_file']}"}
        print(f"{lecture['id']}: {len(pages)} pages copied and rendered", flush=True)
    (ROOT / "_data/ece685_slides.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
