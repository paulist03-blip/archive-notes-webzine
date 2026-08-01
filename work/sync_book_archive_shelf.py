#!/usr/bin/env python3
"""Merge the live Aladin seller shelf into the public book archive.

The public payload keeps bibliographic information only. Seller condition,
price, and transaction details are deliberately discarded. Existing editorial
entries and review links win when the same book also appears on the shelf.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from build_book_archive_data import SOURCE_URL, clean_text, high_res_cover, parse_page


DEFAULT_DATA_PATH = Path("assets/book-archive-data.js")
DEFAULT_CACHE_DIR = Path("/tmp")
VIEW_ROWS = 48
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
)


def read_archive(path: Path) -> dict[str, object]:
    text = path.read_text(encoding="utf-8")
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise ValueError(f"Could not find archive JSON in {path}")
    return json.loads(text[start : end + 1])


def write_archive(path: Path, data: dict[str, object]) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(f"window.PAUL_BOOK_ARCHIVE = {payload};\n", encoding="utf-8")


def shelf_url(page: int) -> str:
    query = urlencode(
        {
            "SC": "1025829",
            "ViewType": "Simple",
            "SortOrder": "6",
            "ViewRowsCount": str(VIEW_ROWS),
            "PublishDay": "84",
            "BranchType": "1",
            "Stockstatus": "1",
            "page": str(page),
        }
    )
    return f"https://www.aladin.co.kr/shop/usedshop/wshopitem.aspx?{query}"


def fetch_page(page: int, cache_dir: Path, retries: int = 3) -> Path:
    target = cache_dir / f"aladin_bookshelf_1025829_p{page}.html"
    request = Request(shelf_url(page), headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with urlopen(request, timeout=45) as response:
                target.write_bytes(response.read())
            return target
        except Exception as error:  # pragma: no cover - network behavior varies
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch Aladin shelf page {page}: {last_error}")


def shelf_total(path: Path) -> int:
    text = path.read_text(encoding="utf-8", errors="ignore")
    match = re.search(r"이 분야에\s*<strong>([0-9,]+)</strong>개의 상품", text)
    if not match:
        raise ValueError(f"Could not determine shelf total from {path}")
    return int(match.group(1).replace(",", ""))


def fetch_shelf(cache_dir: Path, workers: int) -> tuple[list[dict[str, object]], int]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    first_path = fetch_page(1, cache_dir)
    total = shelf_total(first_path)
    pages = math.ceil(total / VIEW_ROWS)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_page, page, cache_dir): page for page in range(2, pages + 1)}
        for future in as_completed(futures):
            future.result()

    books: list[dict[str, object]] = []
    for page in range(1, pages + 1):
        books.extend(parse_page(cache_dir / f"aladin_bookshelf_1025829_p{page}.html", page))
    if len(books) != total:
        raise ValueError(f"Parsed {len(books)} shelf books, expected {total}")
    return books, pages


def read_cached_shelf(cache_dir: Path, pages: int) -> list[dict[str, object]]:
    books: list[dict[str, object]] = []
    for page in range(1, pages + 1):
        path = cache_dir / f"aladin_bookshelf_1025829_p{page}.html"
        if not path.exists():
            raise FileNotFoundError(f"Missing cached shelf page: {path}")
        books.extend(parse_page(path, page))
    return books


def normalize(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", clean_text(value)).casefold()


def primary_author(metadata: str) -> str:
    value = clean_text(metadata)
    return re.split(r"\s*(?:지음|글|엮음|편저|저|\||,|·)\s*", value, maxsplit=1)[0]


def book_key(book: dict[str, object]) -> tuple[str, str]:
    return normalize(str(book.get("title", ""))), normalize(primary_author(str(book.get("metadata", ""))))


def infer_theme(title: str, metadata: str) -> str:
    haystack = f"{title} {metadata}".casefold()
    groups = [
        ("음악/공연", ("음악", "클래식", "오페라", "피아노", "바이올린", "작곡", "연극", "배우")),
        ("미술/디자인", ("미술", "회화", "화가", "그림", "디자인", "미학", "사진", "박물관", "뮤지엄")),
        ("건축/도시", ("건축", "도시", "공간", "장소", "주거", "정원")),
        ("과학/의학", ("과학", "물리", "생명", "뇌", "의학", "세포", "유전자", "식물", "우주", "수학")),
        ("역사/정치", ("역사", "전쟁", "제국", "근대", "중세", "정치", "국가", "혁명", "조선", "세계사")),
        ("철학/사상", ("철학", "사상", "칸트", "헤겔", "니체", "윤리", "미학", "주역", "불교")),
        ("사회/경제", ("사회", "경제", "자본", "계급", "불평등", "노동", "인류학", "사회학")),
        ("종교/신학", ("종교", "신학", "성서", "기독교", "예수", "교회", "이슬람")),
        ("문학/언어", ("문학", "소설", "시 ", "시집", "글쓰기", "언어", "문장", "작가")),
    ]
    for theme, keywords in groups:
        if any(keyword in haystack for keyword in keywords):
            return theme
    return "인문/교양"


def public_shelf_book(item: dict[str, object]) -> dict[str, object]:
    return {
        "id": str(item["id"]),
        "title": item["title"],
        "metadata": item["metadata"],
        "theme": infer_theme(str(item["title"]), str(item["metadata"])),
        "itemUrl": item["itemUrl"],
        "imageUrl": high_res_cover(str(item["imageUrl"])),
        "sourcePage": item["page"],
    }


def choose_existing(books: list[dict[str, object]]) -> tuple[list[dict[str, object]], int]:
    """Deduplicate editorial data, preferring linked reviews and earlier entries."""
    ordered = sorted(enumerate(books), key=lambda pair: (not bool(pair[1].get("reviewUrl")), pair[0]))
    kept: list[tuple[int, dict[str, object]]] = []
    ids: set[str] = set()
    keys: set[tuple[str, str]] = set()
    review_keys: set[tuple[str, str]] = set()
    for index, book in ordered:
        item_id = str(book.get("id", ""))
        key = book_key(book)
        review_url = str(book.get("reviewUrl", ""))
        review_key = (normalize(str(book.get("title", ""))), review_url)
        if item_id in ids or key in keys or (review_url and review_key in review_keys):
            continue
        ids.add(item_id)
        keys.add(key)
        if review_url:
            review_keys.add(review_key)
        kept.append((index, book))
    kept.sort(key=lambda pair: pair[0])
    return [book for _, book in kept], len(books) - len(kept)


def merge_archive(
    archive: dict[str, object], shelf: list[dict[str, object]], pages: int
) -> tuple[dict[str, object], dict[str, int]]:
    # A previous sync already contains shelf rows marked with ``sourcePage``.
    # Rebuild that imported portion from the current shelf so repeated runs are
    # idempotent and removed shelf items do not linger in the public archive.
    editorial_rows = [
        book for book in list(archive.get("books", [])) if not book.get("sourcePage")
    ]
    existing, existing_duplicates = choose_existing(editorial_rows)
    ids = {str(book.get("id", "")) for book in existing}
    keys = {book_key(book) for book in existing}
    # Editorial rows often begin metadata with a section label instead of the
    # author name (for example, "역사 · 니얼 퍼거슨").  When a reviewed title
    # is also present on the seller shelf, the reviewed row is the canonical
    # public record even if that metadata shape prevents an author-key match.
    review_titles = {
        normalize(str(book.get("title", "")))
        for book in existing
        if book.get("reviewUrl")
    }

    added: list[dict[str, object]] = []
    shelf_duplicates = 0
    for raw in shelf:  # registration order: newest first
        item_id = str(raw["id"])
        key = book_key(raw)
        title_key = normalize(str(raw.get("title", "")))
        if item_id in ids or key in keys or title_key in review_titles:
            shelf_duplicates += 1
            continue
        book = public_shelf_book(raw)
        added.append(book)
        ids.add(item_id)
        keys.add(key)

    merged_books = existing + added
    result: dict[str, object] = {
        "source": {
            "label": "Paul 편집 서가 + 알라딘 책 서고",
            "seller": "하이데거",
            "url": SOURCE_URL,
            "capturedAt": date.today().isoformat(),
            "pagesScanned": pages,
            "shelfCount": len(shelf),
            "baselineCount": len(existing),
            "shelfImportedCount": len(added),
            "reviewLinkedCount": sum(bool(book.get("reviewUrl")) for book in merged_books),
            "duplicateExcludedCount": shelf_duplicates,
            "publicCount": len(merged_books),
            "publicNote": "가격·상태·거래 정보는 공개하지 않고 서지와 Paul Archive Notes의 장문 리뷰만 연결합니다.",
        },
        "dailyPicks": archive.get("dailyPicks", []),
        "books": merged_books,
    }
    stats = {
        "existing": len(existing),
        "added": len(added),
        "shelf": len(shelf),
        "duplicates": existing_duplicates + shelf_duplicates,
        "public": len(merged_books),
    }
    return result, stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH)
    parser.add_argument(
        "--baseline",
        type=Path,
        action="append",
        default=[],
        help="Additional public/local archive payload to union before the shelf sync (repeatable)",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--cached-pages", type=int)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    archive = read_archive(args.data)
    if args.baseline:
        archive["books"] = list(archive.get("books", [])) + [
            {key: value for key, value in book.items() if key != "sourcePage"}
            for baseline_path in args.baseline
            for book in read_archive(baseline_path).get("books", [])
        ]
    if args.cached_pages:
        shelf = read_cached_shelf(args.cache_dir, args.cached_pages)
        pages = args.cached_pages
    else:
        shelf, pages = fetch_shelf(args.cache_dir, max(1, args.workers))

    merged, stats = merge_archive(archive, shelf, pages)
    output = args.output or args.data
    write_archive(output, merged)
    print(json.dumps({"output": str(output), **stats}, ensure_ascii=False))


if __name__ == "__main__":
    main()
