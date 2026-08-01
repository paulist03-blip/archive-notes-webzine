#!/usr/bin/env python3
"""Audit the measurable parts of the book-archive editorial standard.

This does not try to score ideas or prose. It identifies missing reviews and
flags linked essays that fall short of the reference article's basic shape:
a substantial body, developed paragraphs, a meta description, and sources.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path

from sync_book_archive_shelf import read_archive


DEFAULT_DATA_PATH = Path("assets/book-archive-data.js")
MIN_VISIBLE_CHARACTERS = 4300
MIN_PARAGRAPHS = 14
MIN_SOURCES = 2


class ArticleInspector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, set[str]]] = []
        self.text: list[str] = []
        self.paragraphs = 0
        self.sources = 0
        self.has_description = False
        self.has_editorial_rewrite = False

    def inside(self, class_name: str) -> bool:
        return any(class_name in classes for _, classes in self.stack)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = set((attributes.get("class") or "").split())
        if tag == "meta" and attributes.get("name", "").casefold() == "description":
            self.has_description = len((attributes.get("content") or "").strip()) >= 40
        if "article-body" in classes and attributes.get("data-editorial-rewrite"):
            self.has_editorial_rewrite = True

        in_article = self.inside("article-body") or "article-body" in classes
        in_bibliography = self.inside("bibliography") or "bibliography" in classes
        in_signoff = self.inside("article-signoff") or "article-signoff" in classes
        if tag == "p" and in_article and not in_bibliography and not in_signoff:
            self.paragraphs += 1
        if tag == "a" and in_bibliography and attributes.get("href"):
            self.sources += 1

        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append((tag, classes))

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data: str) -> None:
        if self.inside("article-body") and not self.inside("bibliography") and not self.inside("article-signoff"):
            self.text.append(data)


def inspect_review(path: Path) -> dict[str, object]:
    if not path.exists():
        return {"status": "missing-file", "path": str(path)}

    source = path.read_text(encoding="utf-8")
    inspector = ArticleInspector()
    inspector.feed(source)
    visible_characters = len(re.sub(r"\s+", " ", html.unescape(" ".join(inspector.text))).strip())
    paragraphs = inspector.paragraphs
    sources = inspector.sources
    has_description = inspector.has_description

    checks = {
        "visibleCharacters": visible_characters >= MIN_VISIBLE_CHARACTERS,
        "paragraphs": paragraphs >= MIN_PARAGRAPHS,
        "metaDescription": has_description,
        "sources": sources >= MIN_SOURCES,
        "editorialRewrite": inspector.has_editorial_rewrite,
    }
    return {
        "status": "ready" if all(checks.values()) else "revise",
        "path": str(path),
        "visibleCharacters": visible_characters,
        "paragraphs": paragraphs,
        "sources": sources,
        "hasMetaDescription": has_description,
        "hasEditorialRewrite": inspector.has_editorial_rewrite,
        "failedChecks": [name for name, passed in checks.items() if not passed],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--details", action="store_true")
    args = parser.parse_args()

    archive = read_archive(args.data)
    books = list(archive.get("books", []))
    linked = [book for book in books if book.get("reviewUrl")]
    unique_urls = list(dict.fromkeys(str(book["reviewUrl"]) for book in linked))
    inspections = {url: inspect_review(args.root / url) for url in unique_urls}

    ready_urls = {url for url, result in inspections.items() if result["status"] == "ready"}
    ready_books = sum(str(book.get("reviewUrl", "")) in ready_urls for book in books)
    summary: dict[str, object] = {
        "standard": {
            "minVisibleCharacters": MIN_VISIBLE_CHARACTERS,
            "minParagraphs": MIN_PARAGRAPHS,
            "minSources": MIN_SOURCES,
            "metaDescription": True,
            "editorialRewriteMarker": True,
        },
        "books": len(books),
        "booksWithReviewLink": len(linked),
        "uniqueReviewFiles": len(unique_urls),
        "readyReviewFiles": len(ready_urls),
        "readyBooks": ready_books,
        "remainingBooks": len(books) - ready_books,
        "linkedReviewsNeedingRevision": sum(
            result["status"] != "ready" for result in inspections.values()
        ),
    }
    if args.details:
        summary["reviews"] = inspections
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
