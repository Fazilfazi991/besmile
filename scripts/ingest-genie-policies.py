#!/usr/bin/env python3
"""Build Genie's section-level policy index from the approved source PDFs."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError as error:  # pragma: no cover - only hit on an unprepared workstation
    raise SystemExit("Install the ingestion dependency with: python -m pip install pypdf") from error


ROOT = Path(__file__).resolve().parents[1]
POLICY_DIR = ROOT / "knowledge" / "genie" / "policies"
MANIFEST_PATH = POLICY_DIR / "manifest.json"
OUTPUT_PATH = ROOT / "src" / "data" / "genie-policy-index.json"

HEADING_RE = re.compile(r"^(\d+(?:\.\d+)*)\.?\s+(.+?)\s*$")
PAGE_HEADER_LINES = {
    "EMPLOYEE HANDBOOK",
    "HIRING & RECRUITMENT POLICY",
    "INTERNSHIP POLICY",
}


@dataclass
class Section:
    number: str
    title: str
    pages: set[int] = field(default_factory=set)
    lines: list[str] = field(default_factory=list)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def is_heading(line: str) -> re.Match[str] | None:
    match = HEADING_RE.match(line)
    if not match:
        return None
    title = match.group(2).strip()
    if len(title) > 90 or title.endswith(('.', ':')):
        return None
    words = re.findall(r"[A-Za-z0-9]+", title)
    if not words or len(words) > 10:
        return None
    if "." in match.group(1):
        return match
    capitalized = sum(word[:1].isupper() or word[:1].isdigit() for word in words)
    if not (title.isupper() or capitalized / len(words) >= 0.65):
        return None
    return match


def cleaned_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.replace("\u00a0", " ").splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if not line or line in PAGE_HEADER_LINES:
            continue
        lines.append(line)
    return lines


def render_text(lines: list[str]) -> str:
    paragraphs: list[str] = []
    current = ""
    for line in lines:
        if line.startswith("•") or "→" in line or re.match(r"^[↓→]$", line):
            if current:
                paragraphs.append(current)
                current = ""
            paragraphs.append(line)
            continue
        if line == "↓":
            if current:
                paragraphs.append(current)
                current = ""
            paragraphs.append(line)
            continue
        if current:
            current = f"{current} {line}"
        else:
            current = line
        if line.endswith((".", ":", "?")):
            paragraphs.append(current)
            current = ""
    if current:
        paragraphs.append(current)
    return "\n".join(paragraphs).strip()


def extract_sections(path: Path) -> tuple[int, list[dict[str, object]]]:
    reader = PdfReader(str(path))
    sections: list[Section] = []
    current: Section | None = None

    for page_number, page in enumerate(reader.pages, start=1):
        for line in cleaned_lines(page.extract_text() or ""):
            heading = is_heading(line)
            if heading:
                current = Section(number=heading.group(1), title=heading.group(2).strip())
                sections.append(current)
                current.pages.add(page_number)
                continue
            if current is None:
                continue
            current.pages.add(page_number)
            current.lines.append(line)

    chunks: list[dict[str, object]] = []
    for section in sections:
        text = render_text(section.lines)
        if not text:
            continue
        chunks.append(
            {
                "sectionNumber": section.number,
                "sectionTitle": section.title,
                "pages": sorted(section.pages),
                "text": text,
            }
        )
    return len(reader.pages), chunks


def main() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    documents: list[dict[str, object]] = []
    chunks: list[dict[str, object]] = []

    for document in manifest["documents"]:
        source_path = POLICY_DIR / document["sourceFile"]
        if not source_path.is_file():
            raise FileNotFoundError(f"Approved policy PDF not found: {source_path}")
        page_count, extracted = extract_sections(source_path)
        document_record = {
            **document,
            "sha256": sha256(source_path),
            "pageCount": page_count,
        }
        documents.append(document_record)
        for index, chunk in enumerate(extracted, start=1):
            chunks.append(
                {
                    "id": f"{document['id']}:{chunk['sectionNumber']}:{index}",
                    "documentId": document["id"],
                    **chunk,
                }
            )

    payload = {
        "schemaVersion": manifest["schemaVersion"],
        "generatedAt": "source-controlled",
        "documents": documents,
        "chunks": chunks,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Indexed {len(documents)} approved policies into {len(chunks)} sections: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
