#!/usr/bin/env python3
"""Build the public book archive data from cached Aladin shelf pages.

The public data intentionally omits transaction details. The price threshold is
used only as an internal filter for deciding whether an item enters the review
queue.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from datetime import date
from pathlib import Path


SOURCE_URL = "https://www.aladin.co.kr/shop/usedshop/wshopitem.aspx?SC=1025829"
SELLER_NAME = "하이데거"

DEFAULT_DAILY_PICK_IDS = ["392078900", "394591541", "392079279"]
LOW_RES_EXCLUDED_IDS = {
    "389004172",  # 독이 든 양분
    "388491240",  # 서정시에 관하여
    "385738636",  # VERMEER
    "385718334",  # 금강경, 깨지지 않는 법
    "385052161",  # 풍경 수채화 (스프링)
}

DAILY_PICK_NOTES = {
    "392078900": {
        "label": "History",
        "title": "소련 붕괴의 순간",
        "subtitle": "제국은 무너지는 날보다 오래전부터 내부 문법을 잃는다.",
        "review": (
            "주보크의 책은 소련 해체를 하루의 사건이 아니라 권력 언어, 경제의 피로, "
            "공화국들의 이해관계, 엘리트의 판단 착오가 겹쳐진 긴 균열로 읽게 한다. "
            "우리 웹진의 Issue 07이 다루었던 감시와 침묵의 문제와도 자연스럽게 이어진다. "
            "체제가 무너질 때 사람들은 갑자기 진실을 발견하는 것이 아니라, 이미 알고 있던 "
            "불안을 더는 모른 척할 수 없게 된다."
        ),
    },
    "394591541": {
        "label": "Art & City",
        "title": "비엔나 1900년",
        "subtitle": "도시는 그림, 건축, 장식, 심리학이 동시에 흥분하던 실험실이 된다.",
        "review": (
            "1900년 전후의 비엔나는 한 도시라기보다 감각의 압축 파일에 가깝다. "
            "클림트와 분리파, 장식과 실내, 커피하우스와 정신분석이 같은 시간대에서 "
            "서로를 흔든다. 이 책은 미술 섹션과 책장 작업을 잇는 좋은 관문이다. "
            "작품 하나를 설명하는 글에서 도시 전체의 시각 언어로 확장할 때, 우리가 "
            "어떤 식으로 이미지를 읽어야 하는지 보여줄 수 있다."
        ),
    },
    "392079279": {
        "label": "Classic Thought",
        "title": "우파니샤드",
        "subtitle": "사유는 의식의 바깥 절차에서 내면의 질문으로 방향을 바꾼다.",
        "review": (
            "우파니샤드는 종교 고전이면서 동시에 사유의 리듬을 훈련하는 책이다. "
            "제의의 언어가 자기, 호흡, 지식, 해방의 질문으로 옮겨갈 때 동양 고전은 "
            "신비한 문장들의 박물관이 아니라 사고의 엄격한 실험장이 된다. 책장 아카이브에서 "
            "이 책은 철학과 종교, 번역과 고전 읽기를 함께 묶는 기준점으로 삼기 좋다."
        ),
    },
}


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def high_res_cover(url: str) -> str:
    return url.replace("/coversum/", "/cover500/").replace("/cover150/", "/cover500/")


def infer_theme(title: str, metadata: str) -> str:
    haystack = f"{title} {metadata}"
    if any(word in haystack for word in ["전쟁", "대전", "소련", "러시아", "중세", "르네상스", "역사", "왕", "유대인"]):
        return "역사"
    if any(word in haystack for word in ["철학", "우파니샤드", "불안의 서", "정관정요", "문학이론", "마음"]):
        return "철학/고전"
    if any(word in haystack for word in ["미학", "비엔나", "건축", "바느질", "디자인", "예술", "쿡북"]):
        return "예술/문화"
    if any(word in haystack for word in ["기계", "의학", "뇌", "식물", "자연사", "우주"]):
        return "과학/지식"
    return "인문/문학"


def parse_page(path: Path, page_number: int) -> list[dict[str, object]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    blocks = re.findall(r"<td width='25%' valign=top>(.*?)</td></tr></table></td>", text, re.S)
    books: list[dict[str, object]] = []

    for position, block in enumerate(blocks, start=1):
        item_id = re.search(r"ItemId=(\d+)", block)
        title = re.search(r"class='bo'><b>(.*?)</b></a>", block, re.S)
        image = re.search(r'<img src="(https?://image\.aladin\.co\.kr/[^"]+)"', block)
        metadata = re.search(r"<span class='gw'>(.*?)<br\s*/?></span>", block, re.S)
        prices = re.findall(r"p1_bold['\"]>([0-9,]+)</span>", block)

        if not (item_id and title and image and metadata and prices):
            continue

        item = {
            "id": item_id.group(1),
            "title": clean_text(title.group(1)),
            "metadata": clean_text(metadata.group(1)),
            "itemUrl": f"https://www.aladin.co.kr/shop/wproduct.aspx?ItemId={item_id.group(1)}",
            "imageUrl": high_res_cover(image.group(1)),
            "page": page_number,
            "position": position,
            "_internalPrice": int(prices[-1].replace(",", "")),
        }
        item["theme"] = infer_theme(str(item["title"]), str(item["metadata"]))
        books.append(item)

    return books


def public_book(item: dict[str, object], rank: int, daily_ids: set[str]) -> dict[str, object]:
    visible = {
        "id": item["id"],
        "rank": rank,
        "title": item["title"],
        "metadata": item["metadata"],
        "theme": item["theme"],
        "itemUrl": item["itemUrl"],
        "imageUrl": item["imageUrl"],
        "sourcePage": item["page"],
        "reviewStatus": "오늘의 세 권" if item["id"] in daily_ids else "리뷰 큐",
    }
    return visible


def build_data(input_dir: Path, pages: int, min_price: int, daily_pick_ids: list[str]) -> dict[str, object]:
    parsed: list[dict[str, object]] = []
    for page_number in range(1, pages + 1):
        page_path = input_dir / f"aladin_bookshelf_1025829_p{page_number}.html"
        if not page_path.exists():
            raise FileNotFoundError(f"Missing cached page: {page_path}")
        parsed.extend(parse_page(page_path, page_number))

    eligible_before_cover_filter = [item for item in parsed if int(item["_internalPrice"]) >= min_price]
    eligible = [item for item in eligible_before_cover_filter if item["id"] not in LOW_RES_EXCLUDED_IDS]
    daily_ids = [item_id for item_id in daily_pick_ids if any(item["id"] == item_id for item in eligible)]
    if len(daily_ids) < 3:
        daily_ids.extend(str(item["id"]) for item in eligible if item["id"] not in daily_ids)
        daily_ids = daily_ids[:3]

    daily_id_set = set(daily_ids)
    public_books = [public_book(item, rank, daily_id_set) for rank, item in enumerate(eligible, start=1)]
    public_daily = []
    for item_id in daily_ids:
        book = next(book for book in public_books if book["id"] == item_id)
        note = DAILY_PICK_NOTES.get(item_id, {})
        public_daily.append({**book, **note})

    return {
        "source": {
            "label": "알라딘 책 작업 서가",
            "seller": SELLER_NAME,
            "url": SOURCE_URL,
            "capturedAt": date.today().isoformat(),
            "pagesScanned": pages,
            "parsedCount": len(parsed),
            "eligibleCount": len(eligible),
            "coverExcludedCount": len(eligible_before_cover_filter) - len(eligible),
            "publicNote": "거래 세부 문구는 글로 옮기지 않고, 내부 선별 기준을 통과한 책만 리뷰 큐에 보관합니다.",
        },
        "dailyPicks": public_daily,
        "books": public_books,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, default=Path("/tmp"))
    parser.add_argument("--pages", type=int, default=10)
    parser.add_argument("--min-price", type=int, default=15000)
    parser.add_argument("--output", type=Path, default=Path("assets/book-archive-data.js"))
    parser.add_argument("--daily-pick-id", action="append", dest="daily_pick_ids")
    args = parser.parse_args()

    daily_pick_ids = args.daily_pick_ids or DEFAULT_DAILY_PICK_IDS
    data = build_data(args.input_dir, args.pages, args.min_price, daily_pick_ids)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    args.output.write_text(f"window.PAUL_BOOK_ARCHIVE = {payload};\n", encoding="utf-8")
    print(
        "book archive data written: "
        f"{args.output} ({data['source']['eligibleCount']} eligible / {data['source']['parsedCount']} parsed)"
    )


if __name__ == "__main__":
    main()
