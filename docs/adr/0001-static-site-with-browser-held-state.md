# Static site with no backend; user state stays in the browser

watchdog is a static Astro site deployed to GitHub Pages. A scheduled GitHub Action runs the Sweep and bakes the result into the build, so the app has no server, accounts or database. The user's Stack, Triage statuses, settings and Inbox cursor live in `localStorage`, with a JSON export and import for moving between devices. Alerts happen when the app opens, not through push, because push needs a server and a stored subscription.

Considered: a small backend or a hosted service for sync and push. Rejected because it adds an operated service, credentials and user data for a tool whose value is the free, offline-capable feed.

Consequences: state does not sync across devices without export and import, and it is lost if the browser data is cleared. The GitHub issue hand-off is a prefilled link, never an API call with a token. Everything the app fetches at runtime comes from its own origin.
