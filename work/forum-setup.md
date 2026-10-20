# Anonymous Forum Setup

The frontend never fabricates visitor participation. Empty configuration keeps
publication disabled. Local drafts are private browser storage, not shared posts.

## Activate

1. Owner signs in to Firebase Console and chooses an existing or new project.
2. Enable Authentication > Sign-in method > Anonymous. No email/password signup.
3. Create Firestore in production mode; review quotas and the selected region.
4. Publish `work/firestore.rules` before adding site configuration.
5. Register a Web app and copy its public apiKey, authDomain, projectId and appId
   to `assets/forum-config.js`. These are public app identifiers, not admin keys.
6. Restrict authorized domains to the production site and necessary development
   hosts. Configure Firebase App Check and set `appCheckSiteKey`, then verify and
   enforce App Check for Firestore. Review authentication quotas and abuse alerts.
7. Deploy the complete canonical site; verify real write/read from two separate
   browser sessions and owner deletion. Never seed pretend visitor comments.

## Data and moderation

- Public content: `anonymousForumPosts/{id}` and nested `replies/{id}`.
- Private deletion ownership and 30-second per-identity write throttle:
  `forumAuthors/{uid}`, its `posts` and `replies` subcollections.
- Private reports: `anonymousForumReports`. Review in Firebase Console regularly.
  Only a trusted server-issued `admin: true` custom claim grants client moderation.
  Never use a public email string or client-selected role as administrator proof.
- Owner deletion clears body, title and work but leaves timestamps and a tombstone
  to preserve replies. An administrator handles additional removal requests and
  retained identifiers under the site's retention policy. Backups/provider logs
  are separate from public removal.
- Anonymous means no public identity or email collection. Firebase still handles
  authentication and connection metadata. Browser storage loss means owner delete
  credentials are lost. Auth persistence and anonymous-account cleanup policies
  should be reviewed by the owner; automatic cleanup can remove deletion access.
- The per-identity throttle is not comprehensive bot protection: identities can
  be reset. App Check, quotas, monitoring and active moderation are prerequisites
  for opening a public write service. Do not promise absolute anonymity.
- Old `forumPosts` data is untouched, not migrated or deleted; the new rules deny
  its client access. Export/review any existing legacy data before migration.

## Verification

Run model tests with `node --test work/forum-model.test.mjs`.
Run `work/forum-rules.test.mjs` inside a Firestore emulator for project
`demo-paul-forum`, never production. The rule tests cover ownership claims,
throttling, timestamps, public field restrictions, replies and private reports.
