#!/usr/bin/env python3
import re
from pathlib import Path


files = [
    Path("index.html"),
    Path("archive.html"),
    Path("book-archive.html"),
    Path("forum.html"),
    Path("daily-ai-work.html"),
    *Path("posts").glob("*.html"),
]
missing = []

for path in files:
    text = path.read_text(encoding="utf-8")
    for attr in ("href", "src"):
        for value in re.findall(fr'{attr}="([^"]+)"', text):
            if value.startswith(("http", "#", "mailto:")):
                continue
            clean = value.split("#", 1)[0]
            if not clean:
                continue
            target = (path.parent / clean).resolve()
            if not target.exists():
                missing.append((str(path), attr, value))

print({"checked": [str(path) for path in files], "missing": missing})
