# Site-Wide Language Switching

- Scope: all 905 public HTML pages, with 27 missing script references added.
- Existing essays, issue navigation, archive order, book records, image files, URLs and form values are preserved.
- A language selection is stored across same-origin pages and synchronized between tabs. Cookies provide a fallback when local storage is unavailable.
- Common interface labels translate immediately. English essay translation uses the existing server-side OpenAI endpoint, with paragraph context, complete-response validation and bounded browser/server caches.
- Newly rendered search results, filter options, forum posts, accessible labels, image alternatives and document titles participate in translation. Typed input and editable fields never enter translation requests.
- Long archive lists translate near the reading position. Regular essays translate their full text. Switching back to Korean aborts the pending browser request and restores the captured source exactly.

## Deployment Dependency

Production currently has no `OPENAI_API_KEY`. Add it securely to the existing Vercel project's Production environment, then redeploy and run the real-provider verification. Never place the key in client assets or Git.

Client success-path tests use synthetic translations and do not establish actual literary translation quality. The live API probe reports readiness separately from page/deployment verification.

## Verification

```sh
node work/sync-language-coverage.mjs
node work/test-language-api.mjs
node work/verify-language-switch.mjs
node work/verify-language-switch.mjs --public
```

Browser interaction checks: `work/language-browser-check.js` via Playwright CLI; widths 1280, 390 and 320; preference persistence, tabs, blocked storage, exact restoration, cancellation, dynamic content, cache eviction, search/filter values, errors and retry.

Provider references: [OpenAI JSON output guidance](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat), [Vercel function duration configuration](https://vercel.com/docs/functions/configuring-functions/duration).
