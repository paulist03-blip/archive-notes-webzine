#!/usr/bin/env python3
"""Check visible record-review cover images for minimum pixel size.

The webzine uses many remote shop and discography images. This script keeps
the record-room covers from silently slipping back to low-resolution thumbnails.
"""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen
import re
import struct
import sys


ROOT = Path(__file__).resolve().parents[1]
MIN_WIDTH = 500
MIN_HEIGHT = 400
TIMEOUT = 12

RECORD_HINTS = (
    "Bernstein Record Room",
    "오늘의 음반",
    "SACD",
    "UHQCD",
    "SHM-CD",
    "2CD",
    "4CD",
)


class ImageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.images: list[dict[str, str]] = []
        self.link_stack: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        data = {key.lower(): value or "" for key, value in attrs}
        if tag == "a":
            self.link_stack.append(data.get("href", ""))
            return
        if tag == "img" and data.get("src"):
            data["href"] = self.link_stack[-1] if self.link_stack else ""
            self.images.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self.link_stack:
            self.link_stack.pop()


def parse_images(path: Path) -> list[dict[str, str]]:
    text = path.read_text(encoding="utf-8")
    parser = ImageParser()
    parser.feed(text)
    return parser.images


def record_archive_entries() -> tuple[dict[str, tuple[str, str]], set[str]]:
    archive = (ROOT / "archive.html").read_text(encoding="utf-8")
    image_checks: dict[str, tuple[str, str]] = {}
    record_hrefs: set[str] = set()
    for line in archive.splitlines():
        if 'row-type">Record' not in line:
            continue
        href_match = re.search(r'<a class="archive-row" href="(?P<href>posts/[^"]+)">', line)
        if not href_match:
            continue
        href = href_match.group("href")
        record_hrefs.add(href)
        parser = ImageParser()
        parser.feed(line)
        for image in parser.images:
            src = image["src"]
            image_checks[src] = ("archive.html", image.get("alt", ""))
    return image_checks, record_hrefs


def record_image_checks() -> dict[str, tuple[str, str]]:
    checks, record_hrefs = record_archive_entries()

    for image in parse_images(ROOT / "index.html"):
        href = image.get("href", "")
        if href in record_hrefs:
            checks.setdefault(image["src"], ("index.html", image.get("alt", "")))

    for href in sorted(record_hrefs):
        path = ROOT / href
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        if not any(hint in text for hint in RECORD_HINTS):
            continue
        for image in parse_images(path):
            checks.setdefault(
                image["src"],
                (path.relative_to(ROOT).as_posix(), image.get("alt", "")),
            )
    return checks


def png_size(data: bytes) -> tuple[int, int] | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        return struct.unpack(">II", data[16:24])
    return None


def gif_size(data: bytes) -> tuple[int, int] | None:
    if data[:6] in (b"GIF87a", b"GIF89a") and len(data) >= 10:
        return struct.unpack("<HH", data[6:10])
    return None


def webp_size(data: bytes) -> tuple[int, int] | None:
    if len(data) < 30 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    chunk = data[12:16]
    if chunk == b"VP8X" and len(data) >= 30:
        width = 1 + int.from_bytes(data[24:27], "little")
        height = 1 + int.from_bytes(data[27:30], "little")
        return width, height
    if chunk == b"VP8 " and len(data) >= 30:
        start = data.find(b"\x9d\x01\x2a")
        if start != -1 and len(data) >= start + 7:
            width, height = struct.unpack("<HH", data[start + 3 : start + 7])
            return width & 0x3FFF, height & 0x3FFF
    if chunk == b"VP8L" and len(data) >= 25:
        bits = int.from_bytes(data[21:25], "little")
        width = (bits & 0x3FFF) + 1
        height = ((bits >> 14) & 0x3FFF) + 1
        return width, height
    return None


def jpg_size(data: bytes) -> tuple[int, int] | None:
    if not data.startswith(b"\xff\xd8"):
        return None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        i += 2
        while marker == 0xFF and i < len(data):
            marker = data[i]
            i += 1
        if marker in (0xD8, 0xD9):
            continue
        if i + 2 > len(data):
            break
        length = struct.unpack(">H", data[i : i + 2])[0]
        if length < 2 or i + length > len(data):
            break
        if marker in {
            0xC0,
            0xC1,
            0xC2,
            0xC3,
            0xC5,
            0xC6,
            0xC7,
            0xC9,
            0xCA,
            0xCB,
            0xCD,
            0xCE,
            0xCF,
        }:
            height = struct.unpack(">H", data[i + 3 : i + 5])[0]
            width = struct.unpack(">H", data[i + 5 : i + 7])[0]
            return width, height
        i += length
    return None


def image_size(data: bytes) -> tuple[int, int] | None:
    return png_size(data) or gif_size(data) or webp_size(data) or jpg_size(data)


def fetch_size(src: str) -> tuple[int, int] | None:
    if src.startswith(("http://", "https://")):
        url = src
    else:
        local = ROOT / src.lstrip("/")
        if not local.exists():
            return None
        return image_size(local.read_bytes())
    request = Request(url, headers={"User-Agent": "PaulArchiveNotes/cover-check"})
    with urlopen(request, timeout=TIMEOUT) as response:
        return image_size(response.read(1_500_000))


def main() -> int:
    allow_unreadable = "--allow-unreadable" in sys.argv
    checks = record_image_checks()

    failures: list[str] = []
    warnings: list[str] = []
    for src, (location, alt) in sorted(checks.items()):
        try:
            size = fetch_size(src)
        except (OSError, URLError, TimeoutError) as exc:
            warnings.append(f"unreadable: {location}: {alt} -> {src} ({exc})")
            continue
        if not size:
            warnings.append(f"unknown-size: {location}: {alt} -> {src}")
            continue
        width, height = size
        if width < MIN_WIDTH or height < MIN_HEIGHT:
            failures.append(f"{width}x{height}: {location}: {alt} -> {src}")

    if warnings:
        print("Warnings:")
        for warning in warnings:
            print(f"  {warning}")
    if failures:
        print(f"Low-resolution record covers found. Minimum: {MIN_WIDTH}x{MIN_HEIGHT}px")
        for failure in failures:
            print(f"  {failure}")
        return 1
    if warnings and not allow_unreadable:
        print("Record cover sizes could not be verified; rerun with network access.")
        return 2
    print(f"record cover resolution ok ({len(checks)} unique images checked, min {MIN_WIDTH}x{MIN_HEIGHT}px)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
