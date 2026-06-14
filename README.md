# Paul Archive Notes

Static webzine archive for books, records, art notes, and daily AI work essays.

## Structure

- `index.html`: main webzine page
- `archive.html`: archive index
- `daily-ai-work.html`: daily AI work index
- `forum.html`: forum page shell
- `posts/`: article pages
- `assets/`: styles, scripts, fonts, and local images

## Publishing Routine

1. Edit article files in `posts/` and update the relevant index/archive pages.
2. Run local checks before publishing:

```bash
python3 work/check_static_site.py
python3 work/check_text_quality.py
```

3. Commit and push to `main`.
4. The connected hosting platform deploys the latest `main` branch automatically.
