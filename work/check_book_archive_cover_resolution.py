#!/usr/bin/env python3
"""Check public book archive cover images for usable resolution."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.error import URLError

from check_record_cover_resolution import fetch_size


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "assets" / "book-archive-data.js"
MIN_SHORT_SIDE = 300
MIN_LONG_SIDE = 500


def load_data() -> dict:
    text = DATA_PATH.read_text(encoding="utf-8")
    match = re.match(r"window\.PAUL_BOOK_ARCHIVE\s*=\s*(.*);\s*$", text, re.S)
    if not match:
        raise ValueError(f"Could not parse {DATA_PATH}")
    return json.loads(match.group(1))


def image_urls(data: dict) -> list[tuple[str, str]]:
    seen: set[str] = set()
    urls: list[tuple[str, str]] = []
    for book in [*data.get("dailyPicks", []), *data.get("books", [])]:
        url = book.get("imageUrl")
        title = book.get("title", "")
        if not url or url in seen:
            continue
        seen.add(url)
        urls.append((title, url))
    return urls


def main() -> int:
    allow_unreadable = "--allow-unreadable" in sys.argv
    data = load_data()
    failures: list[str] = []
    warnings: list[str] = []

    for title, url in image_urls(data):
        if "/cover500/" not in url and "/1200x1200" not in url:
            failures.append(f"non-high-res-url: {title} -> {url}")
            continue
        try:
            size = fetch_size(url)
        except (OSError, URLError, TimeoutError) as exc:
            warnings.append(f"unreadable: {title} -> {url} ({exc})")
            continue
        if not size:
            warnings.append(f"unknown-size: {title} -> {url}")
            continue
        width, height = size
        short_side = min(width, height)
        long_side = max(width, height)
        if short_side < MIN_SHORT_SIDE or long_side < MIN_LONG_SIDE:
            failures.append(f"{width}x{height}: {title} -> {url}")

    if warnings:
        print("Warnings:")
        for warning in warnings:
            print(f"  {warning}")
    if failures:
        print(
            "Low-resolution book archive covers found. "
            f"Minimum: short side {MIN_SHORT_SIDE}px, long side {MIN_LONG_SIDE}px"
        )
        for failure in failures:
            print(f"  {failure}")
        return 1
    if warnings and not allow_unreadable:
        print("Book cover sizes could not be verified; rerun with network access.")
        return 2
    print(
        "book archive cover resolution ok "
        f"({len(image_urls(data))} unique images checked, "
        f"min short {MIN_SHORT_SIDE}px / long {MIN_LONG_SIDE}px)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
