# Screenshot job

Regenerates every screenshot in `docs/assets/screenshots/`.

```bash
npm run screenshots              # rebuild the frontend, then capture
npm run screenshots -- --no-build
```

The first run downloads Chromium:

```bash
npx playwright install chromium
```

## What it does not need

No backend, no database, no PBS and no agent. The dashboard's REST calls are answered
inside the browser by Playwright's request interception, and the built bundle is served
by `serve.mjs`. That is what makes a run reproducible on a fresh checkout and in CI --
and it is also why an "online" client can appear at all: online means a live agent
WebSocket on the real server, so a capture against a real database would show a dead
system.

Authentication is skipped the same way. The SPA decides it is logged in from the
non-httpOnly `pbcm_auth` cookie the server sets beside the JWT, so the capture sets that
flag itself. It grants nothing: every request it would authorise is answered by the mock.

## Reproducibility

Two consecutive runs produce byte-identical PNGs. Three things arrange that, and
breaking any of them turns every commit into a fourteen-file image diff:

- **The clock** is frozen to `FIXED_NOW` in `fixtures.mjs`, so "2 hours ago" stays two
  hours ago.
- **The timezone** is pinned to UTC and the locale to `en-US`, so the same commit renders
  the same on a laptop in Berlin and a runner in London.
- **The version** in the header is read from the root `package.json` and passed to the
  build as `VITE_APP_VERSION`. Left alone, `vite.config.js` appends the commit hash and,
  on a dirty working tree, `-dirty`.

## Keeping the fixtures honest

`fixtures.mjs` follows the schemas in `shared/src/schemas.ts`, but **nothing checks that
it still does** -- the objects are serialised straight to JSON by the interception, so
neither `tsc` nor Zod ever sees them. When an API response shape changes, this file has
to be corrected by hand.

The failure is quiet by design elsewhere and loud here: an endpoint with no fixture logs
`! unmocked GET /api/v1/…` during the run. **A clean run prints no warnings.** A shape
that changed without the path changing is the case that slips through -- the page renders
empty or wrong, which is why the output is worth looking at rather than only counting.

Two details that are easy to get wrong, both learned by getting them wrong:

- Snapshot `backupId` is the client's **UUID**, not its hostname. `useClientDetailStore`
  matches with `s.backupId === clientId`.
- `/api/v1/repositories/:id/snapshots` answers in the camelCase `SnapshotSchema`, not the
  hyphenated shape PBS itself returns. The backend translates on the way through.

## Adding a shot

Add an entry to `DASHBOARD_SHOTS` or `AGENT_SHOTS` in `capture.mjs`, then embed the file
in a page under `docs/`.

A route that cannot be opened cold needs an `open` callback. `/client/:id` is the example:
it resolves its client out of the Zustand store, and on a direct load the guard in
`App.tsx` redirects to the list before the first fetch returns -- so the shot navigates
there the way an operator does, by clicking the row.

Height is fitted per page, not fixed: `fitToContent` measures the bottom of `main`'s last
child and resizes the viewport to it. It deliberately does not use `main.scrollHeight` --
`main` is a flex child filling the viewport, and a scroll container never reports less
than its own client height, so on a short page that number just echoes the height being
replaced.

## In the documentation

`docs/index.md` embeds its five shots as a raw `<picture>` with a `prefers-color-scheme`
source, so GitHub and the published site each show one image of the pair. **Only that page
may do this.** MkDocs rewrites paths in Markdown links but not in HTML attributes, and
every other page is published a directory deep (`install-server/index.html`), so its
assets resolve as `../assets/…` there while GitHub still wants `assets/…`. `index.md` is
the site root, the one place the two forms agree.

Every other page embeds a **single dark image** with ordinary Markdown syntax. Shots used
only there carry `themes: ["dark"]` in `capture.mjs`, so no unused light variant is
written. The agent's two pages are single images for a different reason:
`client/src/web/public/styles.css` defines one dark palette and no light one.
