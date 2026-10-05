# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Proxmox Backup Client Manager (PBCM)** is a centralized management system for `proxmox-backup-client` instances. It consists of three workspaces in an npm monorepo:

- **`server/backend`** – Fastify API server (control plane, WebSocket hub)
- **`server/frontend`** – React SPA (Vite + Tailwind + TanStack Query, Zustand for UI state)
- **`client`** – Lightweight Node.js agent running on backed-up machines
- **`shared`** – Shared TypeScript types, Zod schemas, and constants used by all workspaces

## Commands

### Root-level
```bash
npm install          # Install all workspace dependencies
npm run build        # Build all workspaces (shared → rest)
npm run dev:server   # Backend in watch mode
npm run dev:frontend # Frontend Vite dev server (localhost:5173)
npm run dev:client   # Client agent in watch mode
npm run clean        # Remove all build artifacts
npm run lint         # ESLint over shared, client and server/backend
npm run lint:frontend # ESLint over server/frontend (its own config)
npm test             # Vitest, once, over shared, server/frontend, client and server/backend
npm run test:watch   # ... in watch mode
```

`build` names its workspaces one by one instead of using `--workspaces`, because
`shared` has to be built first and the rest need its output. `--workspaces` would
run `shared` a second time, and its ordering guarantee is only the position of
`shared` in the `workspaces` array -- too implicit for something the other three
builds depend on. **A new workspace has to be added to that list by hand.**

There is no `start:frontend`: the frontend is a Vite SPA that builds into
`server/dist/public`, which the backend serves itself
([`index.ts`](server/backend/src/index.ts) registers it as the static root). So
`npm run start:server` starts the frontend too. To serve the built bundle on its
own -- to check a production build without the backend -- use
`npm run preview -w server/frontend`.

### Per-workspace
```bash
npm run lint -w server/frontend            # ESLint (frontend only)
npm run typecheck -w server/frontend       # tsc against the installed UI library, and over vite.config.ts
npm run typecheck:local-ui -w server/frontend  # ... against a sibling checkout
npm run build -w shared                    # Rebuild shared types after changes
npm run typecheck -w shared                # tsc over shared including its tests
npm run typecheck -w client                # ... over the agent including its tests
npm run typecheck -w server/backend        # ... over the backend including its tests
```

The tests cover logic only, so `typecheck` stays the safety net for everything that
renders — run it after any change that touches the UI library's API.

### Testing

Vitest, configured once in [`vitest.config.mts`](vitest.config.mts) at the root with
one project per workspace (`shared`, `frontend`, `client`, `backend`). `npm test` runs
all four.

- **A test lives next to its module**: `foo.ts` → `foo.test.ts`.
- **Logic only.** Every project runs in the `node` environment; there is no DOM and
  no Testing Library. Logic that sits inside a hook or a component is moved into a
  module of its own first — `features/clients/lib/archivePaths.ts` and `jobForm.ts` came
  out of `useJobForm` that way — and tested there. The same holds for a class with side
  effects in `client` or `server/backend`: what `Scheduler` decides lives in
  `features/SchedulePlan.ts`.
- **The tests read `shared` from source**, through the `development` export
  condition, which every project but `shared` sets. They need no
  `npm run build -w shared` and never see a stale `dist`.
- **`shared`, `client` and `server/backend` build with `tsconfig.build.json`**, which
  leaves `*.test.ts` out of `dist`. `tsconfig.json` still includes them — it is what the
  editor and `npm run typecheck -w <workspace>` read. Vitest does not check types, so
  that script (and the frontend's `typecheck`) is what does.
- **A backend test never opens the installation's files.** `core/Database.ts` opens
  `server/data/server.db` and `config/AppConfig.ts` reads — and may write — `config.yaml`
  the moment they are imported; the agent's `core/Config.ts` and `core/Identity.ts` do the
  same on their side. A test of a module that imports one of them replaces it with
  `vi.mock`. `server/backend/src/testing/memoryDatabase.ts` gives an in-memory database
  on the current schema; the directory is left out of the build.
- **A comment that describes an edge case is a test that is missing.** Write it.

### Docker (development)
```bash
docker compose -f compose.dev.yaml up --build
# server-dev on :3000, client-dev on :3001
```

## Architecture

### Communication Flow

```
Browser ──REST /api/v1/*──► Backend (Fastify)
        ──WS /ws/dashboard──►         │
                                      │
Agent ────WS /ws/agent────────────────┘
```

- The **`ProxyService`** in the backend is the central hub: it manages active agent WebSocket connections, caches job states, and broadcasts updates to dashboard clients.
- The **client agent** runs completely offline-capable: it keeps its job configs in its own data files and runs backups independently of the server connection.
- The **server** uses **SQLite** (`better-sqlite3`) with **umzug** migrations (`server/backend/data/server.db`). The **client** keeps JSON files in `client/data` (`PBCM_CLIENT_DATA_DIR`) through `client/src/core/DataStore.ts`: `jobs.json` (the only copy of the job configuration), `schedule.json`, and one file per run under `history/` -- a run stays there until the server has acknowledged it, which is what lets the server send the webhooks: a run that ends while the server is away is reported late, not lost -- up to 500 unacknowledged runs (`MAX_UNSYNCED` in `repositories/JobHistoryRepository.ts`), beyond which the oldest are dropped so an agent cut off for weeks does not fill its disk. Writes are atomic (temp file, fsync, rename); a damaged `jobs.json` is set aside, never overwritten. A `client.db` of an older version is imported once with `node:sqlite` (`core/LegacyImport.ts`) — jobs and schedule state only.

### Frontend State Management

Two kinds of state, kept apart:

- **Server data** lives in the TanStack Query cache and is read through the hooks in
  `server/frontend/src/queries/` -- one module per area (`clients`, `clientDetail`,
  `jobs`, `repositories`, `history`, `webhooks`, `scheduler`, `fileSystem`, `tokens`,
  `users`). `lib/queryClient.ts` holds the one `QueryClient`, `lib/queryKeys.ts` every key.
  **No component and no store fetches a list by itself**; a new endpoint that is read
  gets a query there.
- **Client state** lives in Zustand: `stores/useUIStore` (sidebar collapsed) and nothing
  else. **`stores/` makes no request.**
- **Every key in the browser's storage** lives once in `lib/storageKeys.ts` (`STORAGE_KEYS`,
  `pbcm.<area>.<what>`) -- no key literal anywhere else. A rename forgets the stored value;
  each is a preference set again with one click, so it needs no migration.

WebSocket updates from `/ws/dashboard` are written into the cache by `WebSocketProvider`;
the frontend does not poll (no refetch on focus, no retry). The rule each message applies
is a pure function in `lib/cacheUpdates.ts`, written with `setQueryData` and an updater,
so an entry nobody has read is not created by a message. A socket reconnect invalidates
everything the server does not push on connect (`isPushedOnConnect` in `lib/queryKeys.ts`)
-- there is no `resyncKey` to list in an effect. A new cache area the server pushes on
connect has to be added there. The `case` labels and the backend's senders name a message
by `WS_EVENTS`, never by a string literal.

`isPending` is what a route waits on before it says "not found". A hand-kept `loaded`
flag next to a list is how that used to be done; do not bring it back.

### Routing

One route tree, `features/app/routes.tsx` (`createBrowserRouter`), and three things read
off it rather than kept beside it:

- **Paths** live in `lib/paths.ts`: `ROUTES` holds every pattern once, `paths` builds the
  ones with parameters. **No path literal outside that file** -- not in a `navigate(...)`,
  not in the tree.
- **The sidebar** is the areas carrying `handle: { nav }`. A new route below an area needs
  no second entry anywhere.
- **Back** is the parent in the tree, through `useBackPath()`. **Nothing goes into
  `location.state`**; what has to survive the round trip (the open tab, a search) is passed
  along as the query string, so it survives a reload too.

A form is a route, never a state flag of the page that opens it. A route whose subject
does not exist throws `NotFoundError` once its list is no longer pending; the area's
`errorElement` shows the card.

The settings form (`pages/Settings.tsx`) is the deliberate exception: it loads once into
a draft, so the invalidation after a reconnect cannot overwrite what is typed.

### Forms

An editor's state is a draft, its baseline and how the save went, and
`hooks/useEntityForm.ts` holds all three. **No editor keeps what it saves in `useState`**;
what it may keep there is UI state -- an open panel, a half-typed list entry, the result of a
test -- which is not saved and so does not make the form dirty.

- **The draft is checked against the schema the backend parses the request with**, from
  `shared`. A schema an editor needs does not stay local to a controller.
- The draft is as typed, the schema describes the request: `toInput` builds the request,
  `fieldOf` maps an issue's path back to the field, `rules` add what only the form knows. All
  three are pure functions in the feature's `lib/` (`jobForm.ts`, `webhookForm.ts`, ...) and
  are tested there; the hook's own logic is `lib/entityForm.ts`.
- **A disabled save button has a visible reason at a field** -- through the control's `error`
  prop, or a label-less `FormField` around a list that has no control.
- **Saving is a mutation in `queries/`**, which also invalidates what the save changed.
- **Unsaved work is asked about once**, in `hooks/useUnsavedChangesGuard.ts`, through the
  router's blocker -- so the sidebar and the back button ask too. An editor calls `close()`;
  after a save that leaves the page it calls `leave()`. Do not write another "confirm, then
  navigate".

### The contract between server and dashboard

Both directions are described once, as Zod schemas in `shared`, and both ends hang on them:

- **REST**: `shared/src/responses.ts` holds one schema per response shape. The frontend
  reaches the server only through `lib/api.ts` -- `api.get(path, schema)` -- which parses
  every answer and throws `ApiError` with the server's `error` text. **No `.json()`
  outside `lib/api.ts`, no `as` on response data.** `publicApi` is the same client for the
  unauthenticated endpoints, where a 401 must not log out.
- **WebSocket**: `DashboardMessageSchema` in `shared/src/dashboardMessages.ts` is a
  discriminated union of every `/ws/dashboard` message. `ProxyService.broadcastToDashboard`
  takes only a member of it; `WebSocketProvider` dispatches in a `switch` ending in
  `assertNever`. **A new message type goes into the union first** -- the frontend's
  `typecheck` then fails until it has a case.
- **A list the server delivers whole is a bare array; one it delivers in pages is
  `{ items, total }`.** `GET /api/v1/history` is the only paged one. `total` is what no page
  can tell -- an envelope around a whole list would only repeat its length, which is why the
  `{ success, count, data }` that endpoint once had is gone.
- **A response schema describes what the server sends, not what an editor accepts.** A
  nullable SQLite column arrives as `null` (`ClientViewSchema`, not `ClientSchema`), and a
  job is checked for its shape only (`BackupJobViewSchema`), so one stored by an older
  agent does not take the whole list off the screen.

### Shared Library

Any type, schema, or constant used across workspaces lives in `shared/`. After modifying `shared/src/`, run `npm run build -w shared` (or the root `npm run build`) before the other workspaces will pick up the changes.

### Backend Route Structure

- Unauthenticated: `POST /api/login`, `/api/auth/*` (OIDC)
- Protected (JWT required): `/api/v1/users`, `/api/v1/clients`, `/api/v1/repositories`, `/api/v1/tokens`, job/history/snapshot endpoints
- WebSocket: `/ws/dashboard` (browser), `/ws/agent` (client agent)

### Configuration

Both the backend and client are configured via a `config.yaml` file (auto-generated on first run). Key backend settings include `jwtSecret`, optional OIDC config, and retention policies. The client config stores `server_url`, `client_id`, and `client_secret` (set on first registration).

Environment variables of note:
- `LOG_LEVEL` / `LOG_FORMAT` (both)
- `NODE_ENV`
- `VITE_USE_LOCAL_UI` / `VITE_UI_COMPONENTS_PATH` (frontend) — set `VITE_USE_LOCAL_UI=true`
  to build against a sibling checkout of the UI library instead of the installed
  package. **Off by default**: a build must not depend on a checkout that CI and
  containers do not have. When you set it, use `tsconfig.local-ui.json` with it
  (`npm run typecheck:local-ui`), or the compiler and the bundler check two
  different versions of the same module. The flag swaps three things that
  have to move together — the bundler's module resolution, Tailwind's `content`
  glob, and the **preset**. The preset was the one that used to stay behind: it
  carries the theme, so a local build ran new components on the published
  theme, and the mismatch surfaced as a colour that was in neither source tree.

## Versioning and Releases

`semantic-release` owns the version. It runs from
[`release.yml`](.github/workflows/release.yml), which is **`workflow_dispatch`
only and refuses any branch but `main`**: a release is an action, not a side
effect of pushing. It derives the next number from the commit types since the
last tag, writes `CHANGELOG.md` and the root `package.json`, and pushes the tag.
**Never bump a version or create a `v*` tag by hand.**

- The workflow takes two inputs. **`dry_run`** (default on) prints the next
  version and changes nothing. **`bump`** (`auto` | `major`) is the *only* way a
  major version is created -- no commit text can produce one. A run that was
  asked for and produces no release **fails**, rather than going green with no
  result.
- **A `BREAKING CHANGE:` footer raises the minor position, not the major one**
  (`releaseRules` on the commit-analyzer). It still renders as its own
  `BREAKING CHANGES` section in the changelog.
- **The commit message is the only input the version comes from**, so it is
  checked like code -- but by `.githooks/commit-msg`, not by CI. The commitlint
  step in `ci.yml` is bound to `pull_request` and this repository is maintained
  without pull requests, so it never fired; ten of ten commits after `v1.4.0`
  were non-conformant and released nothing. `core.hooksPath` is set by the root
  `prepare` script. A `Fix:` instead of `fix:` is now rejected locally.
- **Commit messages are written in English** — subject and body. This is the one
  place where the repository's German prose does not apply: the messages become
  `CHANGELOG.md` and the GitHub release notes, which are read by the same
  audience as `docs/`, and that is English throughout. The existing history is
  German and not worth rewriting, so it stays mixed; the rule applies going
  forward.
- `subject-case` stays off. It forbids `sentence-case`, which is the natural form
  for an English subject (`fix: Validate the schedule when reading it`). The type
  is what triggers a release, not the capitalisation behind it.
- **`feat!: …` does not work** and is rejected by the local `no-breaking-bang`
  rule: the Angular preset's `headerPattern` contains no `!`, so such a commit is
  read as typeless and triggers nothing. Use the footer.
- The **root `package.json` is the single source of truth** for the version.
  The workspace manifests keep their own `1.0.0`; they are private and never
  published, and nothing reads them.
- The tag is what produces images, so a release and its container images cannot
  drift apart -- but `build.yml`'s `v*.*.*` filter does not see it: a tag pushed
  over `GITHUB_TOKEN` creates no workflow run, so `release.yml` dispatches the
  build on the tag ref itself. That dispatch is what moves `latest`.
- Pushing to `main` or `dev` publishes a rolling `:main` / `:dev` image and
  nothing else -- no tag, no version, no changelog entry. `:main` is the state
  released to everyone, `:dev` the one for developers; `sha-<short>` accompanies
  both as the immutable pointer.
- Everything that needs the version string derives it in the same order --
  build argument, then root `package.json`, then git. That order lives in
  [`scripts/generate-version.sh`](scripts/generate-version.sh) and, mirrored, in
  `server/frontend/vite.config.ts`. Only the client agent ships a `dist/VERSION`
  file; the backend has none, because nothing reads it.

See `docs/development.md` for the workflow details.

## Code Style

- **Indentation**: 4 spaces in all workspaces, no tabs. No formatter is configured — match the surrounding file.
- **TypeScript**: strict mode everywhere
- **Linting**: two configs, one per kind of code, because a file must not be
  matched by both. `eslint.config.mjs` at the root covers `shared`, `client` and
  `server/backend` as Node TypeScript (typescript-eslint recommended, no type
  information) and ignores `server/frontend`; the frontend's own config adds the
  `react-hooks` and `react-refresh` plugins. A new Node workspace is covered by the
  root config without another file. Errors fail the run; no rule is downgraded to a
  warning. `prefer-const` runs with `ignoreReadBeforeAssign`,
  for the `let` a closure reads before anything assigns it.
- **UI components**: `@stefgo/react-ui-components` (4.x) – custom external library,
  published to GitHub Packages; `npm install` needs `NPM_TOKEN` in the environment.
- **Colours**: pick the *role*, never the palette — `bg-success`, `text-error`,
  `bg-badge-info-bg`. The library defines each role once and redefines it inside
  its `.dark` block, so a colour is one class and never needs a `dark:` twin.
  Status pills are the `Badge` component, not hand-built spans.
- **Icons**: passed as components (`icon={Save}`), never as elements — the
  surface sets the size and `aria-hidden` itself.
- **Quotes**: `'single'` in `server/frontend`, `"double"` in `shared`, `client` and
  `server/backend`. The split is a fact of the codebase, not an accident — the three
  Node workspaces use double quotes throughout, and flipping them would be a diff
  nothing maintains. The frontend side is enforced: its ESLint config sets
  `quotes: ['error', 'single', { avoidEscape: true }]`, so `npm run lint:frontend`
  rejects a double-quoted string (and `--fix` repairs it). In the Node workspaces
  nothing enforces it — **a file picks one and stays with it**; that is the part worth
  checking in review.
- **Loading state**: one full-panel spinner, `components/LoadingIndicator`. A second
  hand-built one is how the first two came to look different.
- **Lists**: a list describes each column once, as `columns` on `DataMultiView` --
  never as `tableDef` next to `listColumns`. The library has the row's two blocks
  (`listGroups`), the actions column (`actionsColumn`) and the paging (`listPagination`). A sort's `colIndex`
  counts the table's columns only.
- **A read that failed**: `components/QueryError`, with a title that says what could not be
  loaded. It shows the server's message below it.
- **A message that stays in the page** -- a refused save, the result of a test -- is the
  library's `Alert`, and a caption above something that is no library control its
  `FieldLabel`. Neither is written out as a class string.

## Key Docs

Detailed documentation lives in `/docs/`:
- `backend.md` – Controllers, services, WebSocket protocol
- `frontend.md` – Routing, query cache and stores, component conventions
- `client.md` – Agent lifecycle, scheduler, executor
- `api.md` – Full REST and WebSocket API spec
- `tunnel.md` – Outbound clients and the SSH reverse tunnel (setup, protocol, test protocol)
- `webhooks.md` – Webhooks: who sends them (the server), events, delivery, template language
- `install-server.md` – Server installation, Docker Compose only
- `install-client.md` – Client agent installation, Docker Compose only
- `setup.md` – Configuration reference: `config.yaml` (server and client), env vars,
  address checks, client identity
- `development.md` – Dev environment, release pipeline, the documentation site itself
- `index.md` – Landing page of the published site; **not** a copy of the README, and
  the only page that exists solely for the site

`plan-*.md` are working documents (one still a draft). They are excluded from the
published site via `exclude_docs` in `mkdocs.yml` and stay readable on GitHub only.

### The docs are rendered twice

`docs/` is both the GitHub-browsable directory and the `docs_dir` of
[`mkdocs.yml`](mkdocs.yml), published to
<https://stefgo.github.io/proxmox-backup-client-manager/> by
[`docs.yml`](.github/workflows/docs.yml) on pushes to `main`. **Every page has to
render in both**, which constrains two things:

- **A link out of `docs/` must be absolute.** `../.github/workflows/release.yml`
  resolves on GitHub and nowhere else — MkDocs cannot follow a path outside its
  `docs_dir`, and `--strict` fails the build on it. Use the full
  `https://github.com/stefgo/…/blob/main/…` URL.
- **`api.md` has a hand-written TOC with GitHub anchors** — the emoji is dropped and
  the leading space becomes a dash (`#-authentication`). `mkdocs.yml` sets
  `pymdownx.slugs.slugify(case=lower)` for exactly that reason. Changing the slugify
  function silently breaks 53 links; the check is that every `href="#…"` in
  `site/*/index.html` matches a generated `id`.

The workflow is deliberately **not** part of `ci.yml`/`release.yml`: that chain is
the single gate on a release, and a documentation typo must not block one. Only
`main` publishes — `dev` is the developer channel, and a site alternating between
the released and the in-development state would be worse than one that lags.
