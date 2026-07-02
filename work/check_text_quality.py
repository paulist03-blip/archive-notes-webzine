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
    (
        "local-inventory-source",
        re.compile(
            r"로컬\s*(?:인벤토리|판매|Bernstein|메타데이터|metadata|검증|curated)"
            r"|Local\s+(?:Bernstein|seller inventory|shop cache)"
            r"|알라딘\s*(?:재고|물리 재고)"
            r"|(?:판매|물리|수입 CD)\s*재고"
            r"|재고명"
            r"|소장\s*메모"
            r"|중고\s*[-–]?\s*(?:최상|상)"
            r"|판매가"
            r"|가격\s*[:：]"
        ),
        "local inventory, seller, price, or condition wording in public review text",
    ),
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
