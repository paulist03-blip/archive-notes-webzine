# Anonymous Forum - 2026-10-20

Status: backend permissions applied; configured locally but not deployed.
Owner explicitly approved Firebase terms and free-project creation on 2026-10-20.
Created project `paul-archive-notes-forum` (Paul Archive Notes Forum) and registered
Web app Paul Archive Notes Anonymous Forum. Console verified Spark, $0/month.
Developer Program signup, Gemini opt-in and Google Analytics were disabled in
the creation flow. Existing Vercel hosting was not changed. Owner approved
anonymous authentication and public forum permissions. Anonymous provider is
enabled (automatic account cleanup left off to preserve deletion access).
Created Standard Firestore (default) in asia-northeast3 in production/deny mode,
then published work/firestore.rules; Console returned Success.
Public Web app identifiers are connected in assets/forum-config.js.

Live backend verification on 2026-10-20 passed: anonymous authentication, bounded
unauthenticated public listing (zero posts), denied private ownership/report
access, denied malformed write. The temporary verification identity was removed;
no public test posts, fabricated visitor comments or private reports were created.
Valid post/reply persistence still awaits an end-to-end public release check.

App Check remains unconfigured and unenforced. Classic reCAPTCHA registration is
disabled in the current console, which directs new registrations to Fraud Defense
(reCAPTCHA Enterprise). Google Cloud Console presented a separate initial GCP and
related-service terms dialog; consent checkbox is untouched pending owner approval.
No billing upgrade, payment method, extra provider or promotional signup enabled.
Hold production publication until App Check and remaining release checks finish.

Checks completed:
- Four model tests passed (normalization, limits, safe field projection, config).
- Firestore emulator demo-paul-forum: valid long post, bounded public query,
  private ownership, denied cross-user read/delete/ownership claim, denied burst,
  invalid fields/author/timestamps/oversized body/orphan post, reply creation and
  deletion, private reports, admin report read and owner post tombstone.
- Browser isolated mock: retained input on failed write, long post and reply,
  safe text rendering, report flow and own post/reply deletion. Test-only store
  replacement never reaches production and is not a live shared-storage test.
- Disconnected browser: cannot publish, explicit local draft save/reload works,
  preview is plain text and excluded from translation. No synthetic public posts.
- Desktop 1280px and mobile 390px screenshots inspected, no horizontal overflow.
- All tracked HTML outside forum.html remains byte-for-byte equal to HEAD;
  899 post HTML files retained. git diff --check passed.
- Existing full static checker still reports seven pre-existing /mobile links in
  daily AI work articles. No new forum missing-link failures. Left out of scope.

Next: owner GCP terms approval, configure and enforce Enterprise App Check (update
client provider accordingly), review domain restrictions, then full-root Vercel
deploy and two-browser live write verification with clearly marked test content.
No live visitor data has been created. OpenAI MFA tab was not touched.
