# Development & Deployment Guide

This document describes the setup of the development environment as well as the build management and deployment for the Proxmox Backup Client Manager.

## Development Environment

Development is performed entirely within Docker containers to ensure a consistent environment and cleanly handle the dependency on the `proxmox-backup-client`.

### Prerequisites

- Docker and Docker Compose (or Docker Desktop)
- Environment variables file. You **must** create a `.env` file manually in the root directory (this file is excluded from git).

### Starting the Development Environment

The development environment is configured and started using the `compose.dev.yaml` file:

```bash
docker compose -f compose.dev.yaml up --build
```

This starts two services:

1. **server-dev**: The backend server with the UI. Based on `docker/Dockerfile.server.dev`.
   - Starts in watch mode (`npm run dev -w server/backend`).
   - Port `3000` is exposed externally.
   - Local source code (`server`, `shared`) is mounted into the container. Code changes take effect immediately.
2. **client-dev**: The client. Based on `docker/Dockerfile.client.dev`.
   - Runs explicitly on the `linux/amd64` architecture (since the `proxmox-backup-client` primarily supports this).
   - Starts in watch mode (`npm run dev -w client`).
   - Port `3001` is exposed externally.
   - Local source code (`client`, `shared`) is mounted.
   - Has access to the host file system (`/:/mnt`) for backup purposes in development mode.

The `node_modules` folders are isolated as volumes within the container. This prevents conflicts between the host system (e.g., macOS or Windows) and the container (Linux) regarding platform-specific dependencies.

## Documentation Site

The pages in `docs/` are served twice: GitHub renders them as plain Markdown, and
[MkDocs Material](https://squidfunk.github.io/mkdocs-material/) publishes them to
<https://stefgo.github.io/proxmox-backup-client-manager/>. **A page has to work in
both.** Two things follow from that:

- **Links out of `docs/` have to be absolute.** A relative `../.github/workflows/...`
  resolves on GitHub and nowhere else. Use the full `https://github.com/...blob/main/...`
  URL instead.
- **The hand-written table of contents in `api.md` uses GitHub's anchors** — the emoji is
  dropped and the leading space becomes a dash, hence `#-authentication`. `mkdocs.yml`
  configures `pymdownx.slugs.slugify(case=lower)` precisely so that MkDocs produces the
  same ids. Do not swap the slugify function without checking those 53 links.

To preview locally:

```bash
python3 -m venv .venv-docs && source .venv-docs/bin/activate
pip install -r requirements-docs.txt
mkdocs serve          # http://localhost:8000, live reload
```

`requirements-docs.txt` pins the version, so the preview and the published site render
identically.

That is enforced by [`docs.yml`](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/.github/workflows/docs.yml),
whose two jobs run on different refs because they answer different questions.

**The build runs everywhere** — every branch and every pull request that touches `docs/`,
`mkdocs.yml`, `requirements-docs.txt` or the workflow itself. `mkdocs build --strict` turns
a dead internal link, a nav entry without a file or a page missing from the nav into a
failure, and it is the only automated link check this repository has. Running it on `main`
alone would mean every dead link is found after it was published, which is late for the one
check that exists.

**Only `main` deploys.** `dev` is the developer channel, and a site flipping between the
released and the in-development state would be worse than one that lags behind by a release.
Every other ref stops after the strict build; it does not even upload the artefact.

The workflow is **deliberately separate** from `ci.yml`/`release.yml`: that chain is the
release path, and a typo in a documentation page must not be able to block a release. A
Python toolchain has no business in it either.

The `plan-*.md` files are excluded from the site via `exclude_docs`. They are working
documents; they stay readable on GitHub but are not in the published navigation or the
search index.

### Screenshots

The images in `docs/assets/screenshots/` are generated, not captured by hand:

```bash
npm run screenshots              # rebuild the frontend, then capture
npm run screenshots -- --no-build
npx playwright install chromium  # once, before the first run
```

No backend, database, PBS or agent is involved. Playwright serves the built bundle from a
local static server and answers every `/api/**` call from `scripts/screenshots/fixtures.mjs`,
which is also what lets a client appear **online** — online means a live agent WebSocket,
so a capture against a real database would document a dead system.

Two consecutive runs produce byte-identical PNGs: the clock is frozen, the timezone is
pinned to UTC, and the version in the header comes from the root `package.json` instead of
from `git describe`. Without those three, every run would rewrite all fourteen files.

Nothing type-checks the fixtures — they are serialised straight to JSON — so an API shape
change has to be followed there by hand. A run that has fallen behind says so: an endpoint
with no fixture logs `! unmocked GET /api/v1/…`, and **a clean run prints no warnings**.
`scripts/screenshots/README.md` has the details.

`index.md` carries the five light/dark pairs. Each is a `<figure>` holding **two images**,
their `src` ending in Material's `#only-light` and `#only-dark` markers; Material hides
the wrong one with `[data-md-color-scheme=slate] img[src$="#only-light"]` and its
counterpart.

That marker is the mechanism that works, and the reason is worth keeping: it switches on
the `data-md-color-scheme` attribute, which is what **the palette toggle sets**. A
`<picture>` with a `prefers-color-scheme` source was tried first and is wrong here — a
media query can only see the *operating system* setting, so a reader who switched the site
to dark on a light desktop got a dark page with light screenshots.

The cost is that GitHub ignores the fragment and renders both images of a pair stacked, on
that one page. The published site is the primary artifact, so it wins.

Raw HTML is safe **only on `index.md`**: MkDocs rewrites paths in Markdown links but not
in HTML attributes, and every other page is published a directory deep
(`install-server/index.html`), where assets resolve as `../assets/…` while GitHub still
wants `assets/…`. `index.md` is the site root, the one place the two forms agree.

Every other page therefore embeds a **single dark image** with ordinary Markdown syntax —
dark because that is what the application starts in. `capture.mjs` marks those shots
`themes: ["dark"]` so no unused light variant is produced.

## Review Before the Commit

There is no test suite, so `npm run typecheck -w server/frontend` and a review of the diff are
the only two gates that exist. Typecheck catches the API drift; the review has to catch
everything else, and it is worth running at the points below rather than at random.

Run `/code-review` in Claude Code on the working tree, or `/code-review <PR#>` on a pull
request. The level decides the breadth: `medium` for a routine change, `high` when the diff
crosses the frontend/backend boundary. `/code-review ultra` starts a multi-agent review in the
cloud — reserve it for a whole feature branch, since it is the expensive one and has to be
started by hand.

**When it pays off:**

- **A feature branch, before the PR.** This is the one that matters. Every defect found later
  in `ClientEditor` was already visible in the diff of `c01d0d1`, where it was still a
  one-line fix.
- **A change that touches an existing screen additively.** Adding a section to a component
  that already works produces a harmless-looking diff even when the addition breaks the
  screen's underlying assumption — see *Forms and Save Actions* in `frontend.md`.
- **A change that spans frontend and backend.** A route and its caller are usually written in
  separate passes, and each is plausible alone. Whether the pair is right is only visible with
  both sides on screen.
- **A new mode, flag or enum variant.** The interesting part is never the variant itself, it is
  the consumers that were written before it existed.

**When it does not pay off:** a cross-cutting sweep — renaming colour roles, translating UI
strings, migrating a library version. Those diffs touch many files through one narrow lens and
a review of them finds only what that same lens sees. Do not mistake such a pass for a check of
the files it touched: `ClientEditor` was modified five times after its defects were introduced,
every time by a sweep of this kind, and none of them was ever going to notice.

## GitHub Actions

Six workflows. The rule that shapes all of them: **a release is an action, not a
side effect of pushing.** No push ever produces a version number -- that happens
only in
[`release.yml`](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/.github/workflows/release.yml),
dispatched by hand, on `main`.

The second rule is that there is exactly one set of checks.
[`ci.yml`](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/.github/workflows/ci.yml)
is *called* by `build.yml` and `release.yml` through `workflow_call` rather than
copied into them, so the gate in front of a release cannot drift away from the one
a topic branch gets.

| Event | What runs |
| :--- | :--- |
| Push to a topic branch | `ci.yml` — typecheck and lint |
| Pull request | `ci.yml`, plus commitlint over the pull request's commit range |
| Dependabot pull request | the same, and `dependabot-auto-merge.yml` merges it into `dev` once those checks pass |
| Push to `dev` | `build.yml` (which calls `ci.yml`): images `:dev` and `:sha-<short>`, smoke test. **No version.** |
| Push to `main` | the same, tagged `:main`. **No version.** |
| Push or pull request touching `docs/` | `docs.yml` builds the site with `--strict`; `build.yml` skips it via `paths-ignore` |
| … when that push is on `main` | `docs.yml` deploys it to GitHub Pages as well |
| *Actions ▸ Create Release ▸ Run workflow* on `main` | `release.yml`: branch guard → `ci.yml` → semantic-release → tag → dispatches `build.yml` on the tag ref and waits for it |
| Nightly at 02:00 UTC | `cleanup-packages.yml` prunes GHCR |

Three of the six are described in their own right further down:
[Release](#release) covers `release.yml`, [Documentation Site](#documentation-site)
covers `docs.yml`, [Registry cleanup](#registry-cleanup) covers
`cleanup-packages.yml`. What follows is the other two.

### ci.yml — the check layer

Runs on every branch **except** `main` and `dev`. Those two are covered by
`build.yml`, which calls this workflow itself; listing them here as well would run
every check twice for every push. A single job, `verify`:

| Step | Why it is written the way it is |
| :--- | :--- |
| Pin npm | Node 22 ships npm 10, the lockfile was written by npm 11. The two do not agree about the optional peers of `@commitlint/read`, so `npm ci` fails under the version that did not write the lockfile. The number is read out of `packageManager` in `package.json` — one source, not a second literal. |
| commitlint | Bound to `pull_request`, and this repository is maintained without pull requests, so in practice the local hook is what fires — see [The hooks](#the-hooks). |
| `npm run build` | Builds `shared` first, then every workspace. This *is* the typecheck for `shared`, `server/backend` and `client`, and the Vite build for the frontend. |
| `npm run typecheck -w server/frontend` | The workspace script, deliberately, and not a second spelling of it: `typecheck` picks `tsconfig.json`, `typecheck:local-ui` the sibling-checkout variant, and CI has to stay on the first. Calling `tsc` directly here meant the two could drift with nothing noticing. |
| `npm run lint -w server/frontend` | ESLint. |
| Cleanup coverage | Compares the image names in `build.yml` with the list in `cleanup-packages.yml` and fails on a name that is only in the first. See [Registry cleanup](#registry-cleanup) for why that list is written out by hand. |

The job sets `VITE_USE_LOCAL_UI: "false"`, because `vite.config.js` would
otherwise alias `@stefgo/react-ui-components` to `../../../react-ui-components` —
a checkout that exists on a developer machine and nowhere else. It is the same
value the Dockerfile passes to its Vite build.

Concurrency cancels the run still in flight when a topic branch is pushed again —
the first of three pushes in a row is nobody's answer. The group carries
`github.workflow`, which is the **caller's** name when these checks are reached
through `workflow_call`, so a `build.yml` or `release.yml` run lands in its own
group and cannot cancel a plain branch run, or be cancelled by one. Tags are
exempt from the cancellation, exactly as in `build.yml`.

### build.yml — the job graph

```
verify  ──►  prepare  ──┬──►  build-client   (matrix: amd64 · arm64, native runners)  ──┐
  │                     │                                                               │
(ci.yml)                └──►  build-server   (matrix: amd64 · arm64, native runners)  ──┤
                                                                                        ▼
                                            everything above pushes by digest,        smoke
                                            nothing carries a tag yet                   │
                                                                                        ▼
                                                                                     publish
                                                                          (manifest + every tag)
```

**Nothing is tagged until the smoke test has passed.** That is the shape of this
workflow: all four build jobs push their layers to GHCR by digest and stop there,
`smoke` starts those digests, and only `publish` attaches `dev`, `sha-…`, `1.5.0`
and `latest`. While tagging happened in the build jobs, `latest` moved to an image
nobody had ever started and the smoke test could only report the fact afterwards.

- **`verify`** is `ci.yml`, reused rather than restated. Nothing is built before
  it is green.
- **`prepare`** is the single source of the version string, consumed by every job
  below it. On a tag it strips the leading `v` (`v1.5.0` → `1.5.0`), so the string
  baked into the image matches the Docker tag, the root `package.json` and a
  locally built image; otherwise it produces `<branch>-<short sha>`. It also emits
  the three fully qualified image names. Those are composed here rather than
  declared as a workflow-level `env` so that the registry host is written exactly
  once: an `env` entry cannot reference another entry of the same block, and a
  job's `env` cannot read the `env` context at all. It can read `needs`, which is
  the route taken.
- **`build-client`** builds the two agent images on native runners
  (`ubuntu-latest` and `ubuntu-24.04-arm`), no QEMU, under two separate image
  names. See [Architectures](#architectures-multi-arch) for why they are not one
  manifest.
- **`build-server`** builds the same way and is what later becomes a real
  multi-arch manifest.
- Both push with `push-by-digest=true`, and both hand their digest on as a
  workflow artefact — an empty file whose *name* is the digest, because a matrix
  job cannot set an output of its own.
- **`smoke`** starts each digest and asks it whether it is alive. See
  [Smoke test](#smoke-test).
- **`publish`** assembles the server manifest from both digests and tags all three
  images with `docker buildx imagetools create`. One `metadata-action` run covers
  them — the tag rules are identical — and the step splits the result by image
  name again, matching on the name *plus a colon* so that `pbcm-client` does not
  also claim every `pbcm-client-arm64` reference.

A build that fails the smoke test leaves its digests in the registry untagged.
Nothing has to remove them by hand: `delete-untagged` in the nightly
[Registry cleanup](#registry-cleanup) sweeps them. The flip side is a window —
between the push and the tag — in which a fresh image is untagged and a cleanup
running at that moment would treat it as rubbish. The window existed before, since
the server was always pushed by digest first; the smoke test widens it by a few
minutes.

Two details in the triggers are easy to misread:

- **The `v*.*.*` tag filter almost never fires.** semantic-release pushes the tag
  over `GITHUB_TOKEN`, and GitHub creates no workflow run for such a push. The
  filter covers a tag pushed by hand; the route a real release takes is the
  `workflow_dispatch` that `release.yml` fires on the tag ref, described under
  [Release](#release).
- **`paths-ignore` (`docs/**`, `**.md`) applies to branch pushes only.** Neither a
  tag nor a dispatch is affected by it, so a documentation-only commit skips four
  image builds without the release path ever being touched.

Concurrency follows the same split: a second push to `dev` cancels the build still
running, because its image is about to be pointless — but a tag build is never
cancelled, since its image is the artefact of a release.

### Action updates

`dependabot.yml` watches the actions — and only the actions; the npm side is left
out on purpose, and the file says why. It opens one grouped pull request a month,
prefixed `ci:` so the bump releases nothing.

That much was already true while six actions drifted up to two major versions
behind. Opening the pull request was never the problem: **this repository is
maintained without pull requests**, so the monthly one waited, exactly as the
commitlint step in `ci.yml` waited for a pull request that never came. An update
that is opened and never merged is not a slower update, it is none.

`dependabot-auto-merge.yml` closes that loop. It fires on a pull request whose
actor is `dependabot[bot]` and puts it into auto-merge, so GitHub merges it as
soon as the checks are green and leaves it open when they are not.

Two deliberate choices in it:

- **It targets `dev`, not `main`.** `ci.yml` runs on the pull request, but an
  action bump is mostly about actions `ci.yml` never touches —
  `docker/build-push-action`, the artifact pair, `metadata-action`. The only thing
  that exercises those is `build.yml`, and `build.yml` runs *after* a merge, not
  before one. On `dev` that means a bad bump breaks the developer image and the
  smoke test says so, which is what the dev channel is for; `main` stays the state
  released to everyone until `dev` is merged into it.
- **It needs "Allow auto-merge" enabled** under *Settings ▸ General ▸ Pull
  Requests*. Without that setting the step fails loudly rather than falling back to
  merging unchecked — the backlog is the better of those two outcomes.

## Build Management

The production container images are based on multi-stage builds in the following files:

- `docker/Dockerfile.server`
- `docker/Dockerfile.client`

These files ensure that all TypeScript modules (`shared`, `client`, `server/frontend`, `server/backend`) are built inside a `builder` stage first. The compiled files and production-only dependencies (`npm ci --omit=dev`) are then copied into the final, lightweight `runner` image (based on `debian:bookworm-slim` or `node:22-bookworm-slim`).

### Architectures (Multi-Arch)

- **Server**: Supports both `linux/amd64` and `linux/arm64`. This is enabled because the server relies solely on Node.js.
- **Client**: Built per architecture from its own Dockerfile (`Dockerfile.client` for `linux/amd64`, `Dockerfile.client.arm64` for `linux/arm64`) and published under two separate image names. They stay two image names rather than one manifest because the binary differs in origin: `amd64` installs `proxmox-backup-client` from the official `download.proxmox.com/debian/pbs-client` repository, while `arm64` installs a community build (wofferl/proxmox-backup-arm64), since Proxmox publishes no arm64 package.

## Commits and Versioning

The commit message is the **only** input the version number comes from, so it is
checked like code. `commitlint.config.mjs` extends
`@commitlint/config-conventional` and permits eleven types. Only four of them
produce a version:

| Type | Effect |
| :--- | :--- |
| `feat` | **minor** – 1.4.0 → 1.5.0 |
| `fix`, `perf`, `revert` | **patch** – 1.4.0 → 1.4.1 |
| `build`, `chore`, `ci`, `docs`, `refactor`, `style`, `test` | no release |

The seven types in the last row are not second-class -- they are how a change
that ships nothing to a user is recorded. A documentation commit *should* be a
`docs:` commit and *should* release nothing.

A scope is optional and free-form (`fix(client): …`); there is no `scope-enum`
and no plan for one.

**Write commit messages in English**, subject and body. They become `CHANGELOG.md`
and the GitHub release notes, which are read by the same audience as these pages.
The existing history is German and not worth rewriting, so it stays mixed; the
rule applies from here on.

`subject-case` is switched off. It forbids `sentence-case`, the natural form for
an English subject (`fix: Validate the schedule when reading it`), and it would
also flag every older German commit. The type is what triggers a release, not the
capitalisation behind it.

### Breaking changes

A breaking change raises the **minor** position here, not the major one. Write
it as a footer, separated by a blank line:

```
feat(client): Konfigurationsformat auf YAML umgestellt

BREAKING CHANGE: config.json wird nicht mehr gelesen; siehe docs/setup.md
```

The footer still renders as its own `BREAKING CHANGES` section in `CHANGELOG.md`
and in the release notes -- only the version arithmetic changes. A **major**
comes from the release workflow alone, see below.

**`feat!: …` does not work and is rejected by commitlint.** semantic-release
reads commits with the Angular preset, whose `headerPattern` is
`/^(\w*)(?:\((.*)\))?: (.*)$/` -- it contains no `!`. A commit written that way
falls through the pattern, is read as *typeless* and triggers nothing at all,
while commitlint's own parser would happily accept it. The local rule
`no-breaking-bang` closes that gap and points at the footer instead.

### The hooks

The check runs locally, through `.githooks/commit-msg`. It is not in `ci.yml`
where one would look first: that step is bound to `pull_request`, and this
repository is maintained without pull requests -- so it never fired. Between
`v1.4.0` and the introduction of the hook, ten of ten commits were
non-conformant and produced no release between them.

`.githooks/` also holds `pre-push`, which allows pushing `main` and `dev` only
and keeps topic branches local. Both are activated by `core.hooksPath`, which
the root `prepare` script sets on every `npm install`:

```bash
git config core.hooksPath .githooks   # runs automatically via `npm install`
```

Should a single commit need to stay out of the version calculation, the string
`[skip release]` anywhere in its message removes it from the analysis.

## Release

`semantic-release` owns the version number; nobody tags by hand. A release is an
**action, not a side effect of pushing**: it is started from
*Actions ▸ Create Release ▸ Run workflow*, and only on `main` --
[`release.yml`](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/.github/workflows/release.yml)
rejects every other branch. The rejection is its own `guard` job, ahead of the
checks: the condition is known the moment the workflow is dispatched, so a
mis-click costs a second instead of a full typecheck-and-lint cycle. Past the
guard, a release is gated by exactly the `ci.yml` checks a pull request gets.

```
Actions ▸ Create Release ▸ Run workflow   (main)
  └─► release.yml → semantic-release
        ├─ commits CHANGELOG.md + package.json   [skip ci]  (no second build)
        ├─ pushes tag v1.5.0
        └─ gh workflow run build.yml --ref v1.5.0
              └─► build.yml → images to GHCR
                    └─ gh run watch --exit-status   (the release job waits)
```

The last arrow is a `workflow_dispatch`, not the `on: tags` filter, and the
detour is not decoration: semantic-release pushes the tag over `GITHUB_TOKEN`,
and GitHub creates no workflow run for such an event -- `workflow_dispatch` and
`repository_dispatch` are the only exceptions. Without that step a release ends
at the tag and never produces an image. The dispatch targets the **tag** ref, so
`github.ref` inside `build.yml` is `refs/tags/v1.5.0` and its semver and `latest`
rules apply; dispatching `main` instead would tag the images `main` again.

**The release job then waits for that build.** `gh workflow run` reports nothing
about the run it starts, so the step looks the run up and follows it with
`gh run watch --exit-status`. Firing and forgetting would let the release go green
on a dispatch, and a build that fails afterwards would leave a tag, a GitHub
release and a changelog entry with no images behind them — precisely the outcome
this workflow refuses everywhere else. If it does fail, a final step says so in
words: the version exists and cannot be taken back, the fix is to re-run *Build
Images* on the tag, and a second release is not needed.

The workflow takes two inputs:

- **`dry_run`** (default **on**) -- runs `semantic-release --dry-run`: the next
  version number appears in the log, nothing is written, no tag, no image. Turn
  it off to release for real. The default is deliberately the harmless one; a
  mis-click costs a dry run instead of moving `latest` for every self-hoster.
- **`bump`** (`auto` | `major`) -- `auto` derives the bump from the commit types.
  `major` forces one. This is the **only** way a major version comes about; no
  commit text can produce one.

`bump: major` works through a second `analyzeCommits` plugin
(`@semantic-release/exec`, see `package.json`), because semantic-release reduces
the results of all such plugins to the *highest* release type. It is independent
of the commits, so a forced major would also produce `2.0.0` from a state holding
nothing but `docs:` commits -- which is what the dry run is there to catch.

**A release run that produces nothing fails.** With an automatic trigger "nothing
to do" is the normal case; for a run someone asked for it is an error, and the
workflow reports it as one instead of going green with no result.

`package.json` in the repository root carries the released version. The
workspace manifests are private, never published and keep their own `1.0.0`.

To build an image from any other branch, dispatch the build manually -- it is
tagged with the branch name and the short SHA, never with `latest`. Slashes
become hyphens, because a Docker tag cannot contain one:

```bash
gh workflow run build.yml --ref feat/my-branch   # -> :feat-my-branch
```

## Deployment

Images are built and published by GitHub Actions, not from a developer machine.
[`build.yml`](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/.github/workflows/build.yml) runs on every push to `main` and
`dev`, on `v*.*.*` tags and on manual dispatch -- which is how a release reaches
it, see [Release](#release) -- and pushes to GHCR:

- `ghcr.io/<owner>/pbcm-server` – a real multi-arch manifest (`linux/amd64`,
  `linux/arm64`), built natively per architecture and merged afterwards
- `ghcr.io/<owner>/pbcm-client` – `linux/amd64`
- `ghcr.io/<owner>/pbcm-client-arm64` – `linux/arm64`, a separate image name
  rather than a manifest entry

Which tag ends up where:

| Trigger | Tags | Moves `latest` |
| :--- | :--- | :--- |
| Push to `main` | `main`, `sha-<short>` | no |
| Push to `dev` | `dev`, `sha-<short>` | no |
| Release tag `v1.5.0` | `1.5.0`, `1.5`, `latest` | **yes** |
| Dispatch on a branch | `<branch>`, `sha-<short>` | no |

`:main` and `:dev` are rolling pointers without a version: `:main` is the state
released to everyone, `:dev` the one for developers. Neither creates a tag or a
CHANGELOG entry -- that is what the release workflow is for. `sha-<short>`
accompanies each of them as the immutable counterpart, for pinning a specific
build. Only a release moves `latest`.

### Smoke test

`build.yml` starts what it just built and asks it whether it is alive: `docker run` on
the server image and on the agent image, then `GET /api/health` on both until they answer
or a minute passes.

**This is the only place in the pipeline where the images are ever executed.**
Everything before it proves that the code compiles, not that the result runs -- an image
whose entrypoint died on the first start used to pass every other job. With no test suite
in this project, it is the single automated statement that an artefact works at all.

**It is a gate, not a report.** The build jobs push by digest and attach no tag; only
`publish`, which runs after this job, turns a digest into `dev`, `1.5.0` or `latest`. A
release therefore cannot move `latest` to an image that has never started -- which it
could while the tags were applied during the build and this job ran last.

It runs on both architectures, because the two agent images are genuinely different
builds: `amd64` installs `proxmox-backup-client` from the Proxmox repository, `arm64` a
community `.deb`, and they sit on different Debian generations.

Since there is no tag yet, the images are addressed by digest -- `<image>@sha256:…`, read
from the artefact each build job left behind. That is more precise than a tag anyway: it
is exactly the artefact this run produced for this architecture, with nothing left for
docker to choose.

### Registry cleanup

[`cleanup-packages.yml`](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/.github/workflows/cleanup-packages.yml) prunes GHCR
every night. It uses `dataaxiom/ghcr-cleanup-action` rather than the more obvious
`actions/delete-package-versions`, and the reason is worth keeping: a multi-arch
build pushes its per-architecture images and its attestations **untagged** --
only the manifest list carries the tag.

```
pbcm-server:dev  ─┬─► sha256:9c55…  linux/arm64      ┐
                  ├─► sha256:72f7…  linux/amd64      │ each one an untagged
                  ├─► sha256:41be…  attestation      │ version of the package
                  └─► sha256:434a…  attestation      ┘
```

An action that deletes "untagged versions" therefore hollows out the tagged
images from underneath. That is not hypothetical: it is how `pbcm-server:main`
came to be a tag whose four children all return 404. The cleanup in use knows
which children belong to a kept tag, and `delete-partial-images` removes the
manifests that already lost theirs.

`validate: true` re-checks that after every run — but **only as a warning; the
action never fails on it**, and a warning in the log of a job that runs at two in
the morning is not far from no check at all. A step of the workflow's own
therefore repeats the check and *fails*: it walks the manifest list of each
protected tag and resolves every child digest individually, because a hollowed-out
image still lists its platforms in the index and only fetching the child shows
that they are gone. A failing run on a `schedule` trigger is what GitHub sends a
notification mail about, which is the whole point of the exercise.

The workflow also carries a `concurrency` group: the action is documented as
unsafe to run twice against the same package, and a manual run can otherwise meet
the nightly one.

**The images are listed by name**, and a new one has to be added there by hand —
which is what the coverage check in `ci.yml` enforces. The action can discover
them by wildcard (`packages: pbcm-*`, `expand-packages: true`), but only with a
**classic** PAT carrying `delete:packages`. That is an unattended nightly delete
right over every container of the account, held in a repository secret, and the
one credential in the pipeline that would expire — the same trade that was already
decided against for [`npm_token`](#registry-authentication). Three names in a file
are the cheaper side of it.

`latest` and `dev` are excluded from every rule, and so is anything shaped like a
version: a deleted `1.3.2` breaks whoever pinned it, so release images are meant
to accumulate. A manual run defaults to `dry_run: true`:

```bash
gh workflow run cleanup-packages.yml            # logs only
gh workflow run cleanup-packages.yml -f dry_run=false
```

### Registry authentication

The builds install `@stefgo/react-ui-components` from GitHub Packages, which
refuses anonymous reads even for public packages. The Dockerfiles therefore
expect a BuildKit secret named `npm_token`:

```dockerfile
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN=$(cat /run/secrets/npm_token) npm ci
```

Where the value comes from:

- **CI** – the automatic `GITHUB_TOKEN`, in every workflow. The package is public,
  and reading a public package is all the token needs to do. `build.yml` used to
  pass a separate `NPM_TOKEN` repository secret here, a classic PAT with
  `read:packages`; it was the only ingredient of the pipeline with an expiry date,
  and an expired one would have broken the image builds while `ci.yml` stayed
  green. The secret still exists as a fallback but nothing reads it.
- **Local builds** – `NPM_TOKEN` in the environment or in the root `.env`; both
  `compose.yaml` and `compose.dev.yaml` declare the secret as
  `environment: NPM_TOKEN`. A personal access token with `read:packages` does it.

Without it `npm ci` fails with `401 Unauthorized` on the `@stefgo` scope.

### Building locally

```bash
NPM_TOKEN=ghp_… docker compose build
```

This builds the images under their GHCR names (`ghcr.io/stefgo/pbcm-server:latest`
and `ghcr.io/stefgo/pbcm-client:latest`) for the local architecture only, which
shadows a pulled image of the same tag until the next `docker compose pull`.

For a multi-arch build use `docker buildx build` directly and pass the secret
explicitly:

```bash
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --secret id=npm_token,env=NPM_TOKEN \
    --file docker/Dockerfile.server \
    --tag <registry>/pbcm-server:latest \
    --push .
```

### Usage in Production

`compose.yaml` points at the published images, so a target host needs nothing
but the compose file, the two config files and a login to GHCR:

```bash
echo $NPM_TOKEN | docker login ghcr.io -u <user> --password-stdin
docker compose pull
docker compose up -d
```

The login is only required while the packages are private; public packages pull
anonymously.

Two things to keep in mind:

- On an ARM host, point `pbcm-client` at `ghcr.io/stefgo/pbcm-client-arm64:latest`.
  The client ships as two image names, not one multi-arch manifest, so Docker
  cannot pick the right variant on its own. The server image is a real manifest
  and needs no override.
- The services keep their `build:` sections, so `docker compose build` still
  works for a local test. It overwrites the GHCR tag in the local image store,
  and the next `docker compose pull` restores the published one.
