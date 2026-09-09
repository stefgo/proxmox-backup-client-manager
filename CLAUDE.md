# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Proxmox Backup Client Manager (PBCM)** is a centralized management system for `proxmox-backup-client` instances. It consists of three workspaces in an npm monorepo:

- **`server/backend`** – Fastify API server (control plane, WebSocket hub)
- **`server/frontend`** – React SPA (Vite + Tailwind + Zustand)
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
npm run typecheck -w server/frontend       # tsc against the installed UI library
npm run typecheck:local-ui -w server/frontend  # ... against a sibling checkout
npm run build -w shared                    # Rebuild shared types after changes
```

Since there are no tests, `typecheck` is the primary safety net — run it after any
change that touches the UI library's API.

### Testing

There are no automated tests in this project.

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
- The **client agent** runs completely offline-capable: it stores downloaded job configs in its own SQLite DB and runs backups via `node-cron` independently of the server connection.
- Both server and client use **SQLite** (`better-sqlite3`) with **umzug** migrations. DB files live at `server/backend/data/server.db` and `client/data/client.db`.

### Frontend State Management

State is split across Zustand stores in `server/frontend/src/stores/`:
- `useUIStore` – sidebar, modals, filters, notifications
- `useClientStore` – client list and online/offline status (fed by WebSocket)
- `useClientDetailStore` – selected client data, history, jobs
- `useGlobalJobsStore` – centralized backup job configs
- `useRepositoryStore` / `useRepositorySnapshotStore` – PBS repository data

WebSocket updates from `/ws/dashboard` flow into these stores; the frontend does not poll.

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
[`release.yml`](.github/workflows/release.yml) on every push to `main` (stable)
and `dev` (prerelease on the `beta` channel), derives the next number from the
commit types since the last tag, writes `CHANGELOG.md` and the root
`package.json`, and pushes the tag. **Never bump a version or create a `v*` tag
by hand.**

- **The commit message is the only input the version comes from**, so it is
  checked like code: commitlint (`@commitlint/config-conventional`) fails a PR
  whose commits are not Conventional Commits. A `Fix:` instead of `fix:`
  produces no release at all and nothing else would go red. `subject-case` is
  deliberately off -- the subjects are German and capitalise nouns.
- The **root `package.json` is the single source of truth** for the version.
  The workspace manifests keep their own `1.0.0`; they are private and never
  published, and nothing reads them.
- The tag is what produces images, so a release and its container images cannot
  drift apart -- but `build.yml`'s `v*.*.*` filter does not see it: a tag pushed
  over `GITHUB_TOKEN` creates no workflow run, so `release.yml` dispatches the
  build on the tag ref itself. Only a stable tag does; that dispatch is what
  moves `latest`. Pushing to `dev` publishes a rolling `:dev` image instead.
- Everything that needs the version string derives it in the same order --
  build argument, then root `package.json`, then git. That order lives in
  [`scripts/generate-version.sh`](scripts/generate-version.sh) and, mirrored, in
  `server/frontend/vite.config.js`. Only the client agent ships a `dist/VERSION`
  file; the backend has none, because nothing reads it.

See `docs/development.md` for the workflow details.

## Code Style

- **Indentation**: 4 spaces in all workspaces, no tabs. No formatter is configured — match the surrounding file.
- **TypeScript**: strict mode everywhere
- **Frontend linting**: ESLint with `react-hooks` and `react-refresh` plugins
- **UI components**: `@stefgo/react-ui-components` (3.x) – custom external library,
  published to GitHub Packages; `npm install` needs `NPM_TOKEN` in the environment.
- **Colours**: pick the *role*, never the palette — `bg-success`, `text-error`,
  `bg-badge-info-bg`. The library defines each role once and redefines it inside
  its `.dark` block, so a colour is one class and never needs a `dark:` twin.
  Status pills are the `Badge` component, not hand-built spans.
- **Icons**: passed as components (`icon={Save}`), never as elements — the
  surface sets the size and `aria-hidden` itself.
- **Quotes**: `'single'` in `server/frontend`, `"double"` in `shared`, `client` and
  `server/backend`. The split is a fact of the codebase, not an accident — the
  frontend runs about 250 single-quoted imports against 70 the other way, the three
  Node workspaces the reverse — and with no formatter to enforce either, flipping one
  side would be a diff nothing maintains. **A file picks one and stays with it**; that
  is the part worth checking in review.
- **Loading state**: one full-panel spinner, `components/LoadingIndicator`. A second
  hand-built one is how the first two came to look different.

## Key Docs

Detailed documentation lives in `/docs/`:
- `backend.md` – Controllers, services, WebSocket protocol
- `frontend.md` – Routing, stores, component conventions
- `client.md` – Agent lifecycle, scheduler, executor
- `api.md` – Full REST and WebSocket API spec
- `tunnel.md` – Outbound clients and the SSH reverse tunnel (setup, protocol, test protocol)
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
`main` publishes — `dev` is the prerelease channel, and a site alternating between
the stable and the beta state would be worse than one that lags.
