# Anonymous Forum - 2026-10-20

Status: implemented locally; not deployed or open for public writes.
Firebase Console is signed in and the new-project form is open. Project name:
Paul Archive Notes Forum. Firebase terms checkbox remains unchecked pending
explicit owner approval. Developer Program signup is disabled. No paid plan.

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

Next: owner terms approval, create free Firebase project, enable anonymous auth,
create Firestore, publish reviewed rules, configure App Check and public Web app
identifiers, then full-root Vercel deploy and two-browser live write verification.
No live visitor data has been created. OpenAI MFA tab was not touched.
