from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Iterable

import pdfplumber
import pandas as pd


_TITLE_YEAR_RE = re.compile(r"^(?P<title>.+?)(?:\s*\((?P<year>19\d{2}|20\d{2})\))?$")


@dataclass
class ExtractedTitleRecord:
    raw_text: str
    normalized_title: str | None
    year: int | None


def _normalize_title(text: str | None) -> str | None:
    if not text:
        return None
    cleaned = re.sub(r"\s+", " ", text).strip()
    return cleaned or None


def _iter_text_lines(path: str) -> Iterable[str]:
    ext = os.path.splitext(path)[1].lower()
    if ext in {".txt", ".log"}:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                yield line.strip()
    elif ext in {".csv", ".tsv"}:
        sep = "," if ext == ".csv" else "\t"
        df = pd.read_csv(path, sep=sep)
        for col in df.columns:
            for value in df[col].astype(str).tolist():
                yield value
    elif ext in {".xlsx", ".xls"}:
        df = pd.read_excel(path)
        for col in df.columns:
            for value in df[col].astype(str).tolist():
                yield value
    elif ext in {".pdf"}:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                for line in text.splitlines():
                    yield line.strip()
    else:
        # Fallback: treat as plain text
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                yield line.strip()


def extract_titles_from_file(path: str) -> list[ExtractedTitleRecord]:
    """Best-effort extraction of titles from a TXT/PDF/CSV/Excel file.

    This is intentionally conservative: we keep non-empty lines and try to
    parse an optional year in parentheses at the end.
    """
    records: list[ExtractedTitleRecord] = []

    for line in _iter_text_lines(path):
        if not line:
            continue

        match = _TITLE_YEAR_RE.match(line)
        if not match:
            continue

        title = _normalize_title(match.group("title"))
        year_str = match.group("year")
        year = int(year_str) if year_str else None

        if not title:
            continue

        records.append(ExtractedTitleRecord(raw_text=line, normalized_title=title, year=year))

    return records


def extract_titles_from_text(text: str) -> list[ExtractedTitleRecord]:
    """Extract titles from an in-memory text blob.

    This mirrors extract_titles_from_file but operates on a string, which is
    ideal when Celery workers run in a separate container and cannot access
    the web server's filesystem.
    """
    records: list[ExtractedTitleRecord] = []

    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        match = _TITLE_YEAR_RE.match(line)
        if not match:
            continue

        title = _normalize_title(match.group("title"))
        year_str = match.group("year")
        year = int(year_str) if year_str else None

        if not title:
            continue

        records.append(ExtractedTitleRecord(raw_text=line, normalized_title=title, year=year))

    return records
