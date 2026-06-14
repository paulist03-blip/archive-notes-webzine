#!/usr/bin/env python3
"""Lightweight visible-text checks for Paul Archive Notes HTML posts."""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path


class VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self.chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self.chunks.append(data)


CHECKS: list[tuple[str, re.Pattern[str], str]] = [
    ("cyrillic", re.compile(r"[\u0400-\u04FF]"), "Cyrillic character mixed into visible text"),
    ("replacement", re.compile(r"\uFFFD"), "Unicode replacement character"),
    ("double-space", re.compile(r"[가-힣A-Za-z0-9][ \t]{2,}[가-힣A-Za-z0-9]"), "double spaces inside visible text"),
    ("empty-parens", re.compile(r"\(\s*\)|\[\s*\]"), "empty brackets"),
    ("repeated-word", re.compile(r"\b([A-Za-z가-힣]{2,})[ \t]+\1\b"), "repeated word"),
]


def visible_text(path: Path) -> str:
    parser = VisibleTextParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return "\n".join(chunk.strip() for chunk in parser.chunks if chunk.strip())


def main() -> int:
    paths = [Path(arg) for arg in sys.argv[1:]]
    if not paths:
        paths = sorted(Path("posts").glob("*.html"))

    issues: list[str] = []
    for path in paths:
        text = visible_text(path)
        for code, pattern, message in CHECKS:
            for match in pattern.finditer(text):
                excerpt = text[max(0, match.start() - 24) : match.end() + 24].replace("\n", " ")
                issues.append(f"{path}:{code}: {message}: ...{excerpt}...")

    if issues:
        print("\n".join(issues))
        return 1

    print(f"text quality ok ({len(paths)} files checked)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
