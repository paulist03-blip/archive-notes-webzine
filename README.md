# Paul Archive Notes

Static webzine archive for books, records, art notes, and daily AI work essays.

## Structure

- `index.html`: main webzine page
- `archive.html`: archive index
- `daily-ai-work.html`: daily AI work index
- `forum.html`: forum page shell
- `book-archive.html`: Aladin shelf-based book review queue
- `posts/`: article pages
- `assets/`: styles, scripts, fonts, and local images

## Editorial Rules

- Book and record reviews must not use local inventory data as review material.
  Do not check, cite, or summarize local stock exports, seller pages, used-shop
  state, price, sale status, copy condition, or possession notes unless the user
  explicitly asks for inventory work.
- Reviews should be based on the work itself: argument, structure, edition or
  translation context for books; performance, interpretation, recording history,
  label data, and repertoire context for records.
- Retailer or catalog pages may be used only to confirm basic bibliographic
  metadata or obtain a usable cover image. They must not shape the review's
  critical claims.
- Public article text should not include phrases such as price, sale price,
  stock, used, best condition, good condition, or ownership memo.

## Publishing Routine

1. Edit article files in `posts/` and update the relevant index/archive pages.
2. Run local checks before publishing:

```bash
python3 work/check_static_site.py
python3 work/check_text_quality.py
python3 work/check_record_cover_resolution.py
python3 work/check_book_archive_cover_resolution.py
```

3. For record posts, prefer exact high-resolution cover sources. The cover check
   must verify visible record covers at 500x400px or better before publishing.
4. For the book archive, refresh cached Aladin shelf pages and rebuild the public
   review queue:

```bash
python3 work/build_book_archive_data.py --input-dir /tmp --pages 10 --min-price 15000 --output assets/book-archive-data.js
```

5. Commit and push to `main`.
6. The connected hosting platform deploys the latest `main` branch automatically.
