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

## Build Management

The production container images are based on multi-stage builds in the following files:

- `docker/Dockerfile.server`
- `docker/Dockerfile.client`

These files ensure that all TypeScript modules (`shared`, `client`, `server/frontend`, `server/backend`) are built inside a `builder` stage first. The compiled files and production-only dependencies (`npm ci --omit=dev`) are then copied into the final, lightweight `runner` image (based on `debian:bookworm-slim` or `node:22-bookworm-slim`).

### Architectures (Multi-Arch)

- **Server**: Supports both `linux/amd64` and `linux/arm64`. This is enabled because the server relies solely on Node.js.
- **Client**: Built per architecture from its own Dockerfile (`Dockerfile.client` for `linux/amd64`, `Dockerfile.client.arm64` for `linux/arm64`) and published under two separate image names. They stay two image names rather than one manifest because the binary differs in origin: `amd64` installs `proxmox-backup-client` from the official `download.proxmox.com/debian/pbs-client` repository, while `arm64` installs a community build (wofferl/proxmox-backup-arm64), since Proxmox publishes no arm64 package.

## Release

`semantic-release` owns the version number; nobody tags by hand.
[`release.yml`](../.github/workflows/release.yml) runs on every push to `main`
and `dev`, gated by the same `ci.yml` checks a pull request gets:

```
push to main
  └─► release.yml → semantic-release
        ├─ commits CHANGELOG.md + package.json   [skip ci]  (no second build)
        └─ pushes tag v1.4.0
              └─► build.yml (on: tags v*.*.*) → images to GHCR
```

- **`main`** produces a stable release: `v1.4.0`, images tagged `1.4.0`, `1.4`
  and `latest`.
- **`dev`** produces a prerelease on the `beta` channel: `v1.4.0-beta.1`, images
  tagged `1.4.0-beta.1`. A prerelease never moves `latest`. Every push to `dev`
  additionally publishes a rolling `:dev` image, whether or not it releases.
- The version comes solely from the commit types since the last tag: `fix:`
  bumps the patch, `feat:` the minor, a `!` or a `BREAKING CHANGE:` footer the
  major. Commits typed `docs:`, `chore:`, `refactor:` or `build:` release
  nothing.
- commitlint enforces that in `ci.yml` on every pull request, because a
  malformed type silently produces no release.

`package.json` in the repository root carries the released version. The
workspace manifests are private, never published and keep their own `1.0.0`.

To build an image from any other branch, dispatch the build manually -- it is
tagged with the branch name and the short SHA, never with `latest`:

```bash
gh workflow run build.yml --ref feat/my-branch
```

## Deployment

Images are built and published by GitHub Actions, not from a developer machine.
[`build.yml`](../.github/workflows/build.yml) runs on every push to `dev`, on
`v*.*.*` tags (including the prereleases from `dev`) and on manual dispatch, and
pushes to GHCR:

- `ghcr.io/<owner>/pbcm-server` – a real multi-arch manifest (`linux/amd64`,
  `linux/arm64`), built natively per architecture and merged afterwards
- `ghcr.io/<owner>/pbcm-client` – `linux/amd64`
- `ghcr.io/<owner>/pbcm-client-arm64` – `linux/arm64`, a separate image name
  rather than a manifest entry

A stable tag publishes `<version>`, `<major>.<minor>` and `latest`; a prerelease
tag publishes `<version>` only and leaves `latest` where it is. A branch push or
a manual dispatch publishes `<branch>` and `sha-<short>`.

### Registry authentication

The builds install `@stefgo/react-ui-components` from GitHub Packages, which
refuses anonymous reads even for public packages. The Dockerfiles therefore
expect a BuildKit secret named `npm_token`:

```dockerfile
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN=$(cat /run/secrets/npm_token) npm ci
```

Where the value comes from:

- **CI** – the `NPM_TOKEN` repository secret, a classic PAT with `read:packages`
  (see `build.yml`). `ci.yml` gets by with the automatic `GITHUB_TOKEN`, which
  is enough to read a public package.
- **Local builds** – `NPM_TOKEN` in the environment or in the root `.env`; both
  `compose.yaml` and `compose.dev.yaml` declare the secret as
  `environment: NPM_TOKEN`.

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
