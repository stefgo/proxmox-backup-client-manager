# Plan: commit validation, branch roles and an explicit release

**Status:** stages 1 and 2 implemented · **Created:** 2026-09-09 · **Rev. 2**

> Written in English to match the rest of `docs/`, like the previous plan documents.
> Excluded from the published site through `exclude_docs: plan-*.md` in `mkdocs.yml`;
> readable on GitHub only.
>
> Stages 1 and 2 (M1, M5, M2, M3, M4, M18, M19, M6, M7, M8, M20) are implemented.
> Deviations from Rev. 1:
> - **M4 needed only the trigger line.** The existing `type=ref,event=branch` rule already
>   yields the branch name as the image tag, which for a push to `main` *is* `:main`. The
>   additional `type=raw` entry planned in section 4 was dropped as redundant.
> - `release.yml` gained a `Nur main darf releasen` step rather than a job-level `if`, so a
>   dispatch on the wrong branch fails visibly instead of being skipped silently.
> - `docs/development.md` carried two further stale statements outside the *Release* section:
>   `dev` described as the prerelease channel in *Documentation Site*, and a reference to
>   "the two `plan-*.md` files" (there is one). Both corrected.
> - Stages 3 (M9–M15) and 4 (M16, M17) remain open.

## 1. What prompted this

A review of the build and version pipeline found that the mechanism the project relies on
to produce releases has never run.

`ci.yml` guards the commit format with commitlint, but the step carries
`if: github.event_name == 'pull_request'`, and the workflow's push trigger excludes `main`
and `dev`. The repository is maintained without pull requests — all 62 merges are local
`Merge branch 'dev'` commits. **There is no path on which commitlint fires.**

The effect is measurable. Since `v1.4.0` there are ten non-merge commits on `main`:

```
Refactor screenshot handling in documentation to use light/dark image pairs…
Add screenshot generation scripts and fixtures for documentation
Refactor README to update documentation links…
Update documentation to include full name "Proxmox Backup Client Manager (PBCM)"…
Fix comment formatting in logo.svg for clarity and consistency
…
```

Conventional-commit conformant: **0 of 10.** Every one of these pushes started `release.yml`,
passed typecheck and lint, reported green — and produced no release. This is precisely the
failure mode `CLAUDE.md` describes as the reason the commitlint step exists.

Three further observations shaped the target model:

- **`dev` currently carries nothing.** `main` is 16 commits ahead, `dev` is 0 ahead. The last
  eight commits went straight to `main`, bypassing the branch entirely.
- **The beta channel was never a stabilisation phase.** `v1.3.2` on 2026-03-29, then five
  months without a release, then 13 betas in eight days (2026-09-01 to 09-09), and `v1.4.0`
  fourteen minutes after `beta.13`. That is a build-and-test loop, not a maturing process.
- **It is not free.** `CHANGELOG.md` holds the complete `1.4.0` entry *and* 13 beta sections
  below it listing the same commits again, plus 13 tags, 13 GitHub releases and 13 image builds
  for a single shipped state.

## 2. Requirements

Set by the maintainer, and the basis for everything in section 3:

1. Everything pushed to `main` produces a `:main` package — an intermediate state released to
   everyone, without a release.
2. Everything pushed to `dev` produces a `:dev` package — an intermediate state for developers.
3. An official release happens **only on `main`, and only on explicit request**.
4. Any branch can produce a `:branch-name` package on explicit request.

Additionally: a `BREAKING CHANGE` is normally a **minor**. A major release happens only
explicitly.

## 3. Target model

```
  local topic branches         dev  ──push──►  :dev image
  feat/… fix/…                 main ──push──►  :main image
  (never pushed)                 │
                                 └── Actions ▸ Release ▸ Run workflow
                                        └─► tag v1.5.0 ─► :1.5.0, :1.5, :latest

  any branch ── Actions ▸ Build ▸ Run workflow ──► :branch-name, :sha-abc1234
```

`dev` keeps its role as the developer channel but loses its version numbers: it produces an
image, not a release. Releases become an action rather than a side effect of pushing.

**Version arithmetic after the change:**

| Situation | Result |
| :--- | :--- |
| `fix:`, `perf:`, `revert:` since the last release | patch |
| `feat:` among them | minor |
| a `BREAKING CHANGE:` footer among them | **minor** (was: major) |
| release triggered with `bump: major` | **major** |
| only `docs:`/`chore:`/`refactor:`/… | no release — the run fails, by design |

## 4. Measures

Numbering is stable; stages are in section 5. Each measure states the observable end state,
because without a test suite that is the only acceptance criterion available.

### Stage 1 — prerequisite

**M1 — `commit-msg` hook, hooks under version control**
*Action:* Add commitlint as a `commit-msg` hook, move it and the existing `pre-push` hook to
`.githooks/`, point `core.hooksPath` there.
*Files:* new `.githooks/`, `package.json`
*Result:* `git commit -m "Update documentation"` is rejected locally, naming the permitted
types. `git commit -m "docs: Installationsanleitung ergänzt"` passes. The commit class that
produced zero releases from ten commits can no longer be created. Both hooks live in the
repository, are visible in `git log` and survive a fresh clone. The `pre-push` hook currently
exists only in `.git/hooks` of one working copy and would be lost on any new machine.

**M5 — Unify the `v` prefix**
*Action:* `version=${GITHUB_REF_NAME#v}` in the `prepare` job.
*Files:* `.github/workflows/build.yml`
*Result:* The frontend shows `1.5.0`, the client reports `1.5.0`, the Docker tag reads `1.5.0`
and the root `package.json` says `1.5.0` — four of four identical. Today the first two carry a
`v` the other two do not.

### Stage 2 — the model change

**M2 — Release on request**
*Action:* Drop the `push` trigger, add `workflow_dispatch` with a `dry_run` input and a
`bump: auto | major` input, guard the branch to `main`, detect the release through
`@semantic-release/exec` instead of comparing `git rev-parse HEAD`, and **fail the run when no
release was produced**.
*Files:* `.github/workflows/release.yml`, `package.json`
*Result:* Pushing to `main` no longer releases. *Actions → Release* offers a **Run workflow**
button with a dry-run checkbox; the dry run writes the next version number to the log and
changes nothing. A real run either produces tag, GitHub release, CHANGELOG commit and image
build in full — or turns **red** stating that no releasable commits are present. A dispatch on
any other branch aborts with a clear message.

The current detection infers "a release happened" from `HEAD` having moved, which only holds
while `@semantic-release/git` is in the plugin list. Removing that plugin would silently stop
all image builds.

**M3 — Remove the beta channel**
*Action:* `"branches": ["main"]`.
*Files:* `package.json`
*Result:* No further `-beta.n` versions, tags, releases or images. `CHANGELOG.md` grows only by
real releases; the 13 repeated sections per cycle disappear. Versions step from `1.4.0` to
`1.5.0`.

**M4 — `:main` and `:dev` as rolling images**
*Action:* `push: branches: ["main", "dev"]`, add the tag rule
`type=raw,value=main,enable={{is_default_branch}}`.
*Files:* `.github/workflows/build.yml`
*Result:* After every push to `main`, `ghcr.io/stefgo/pbcm-server:main` and the client images
are current; after every push to `dev`, `:dev` is. Both also receive an immutable
`sha-<short>` tag. `latest` still moves only on a stable release. Verify with
`docker buildx imagetools inspect ghcr.io/stefgo/pbcm-server:main`.

Requirement 4 needs no measure — `workflow_dispatch` and `type=ref,event=branch` already
produce a branch-named image today. Slashes become hyphens (`feat/x` → `:feat-x`), because
Docker tags cannot contain `/`.

**M18 — Control over major releases**
*Action:* `releaseRules: [{ "breaking": true, "release": "minor" }]` on the commit-analyzer,
plus `@semantic-release/exec` with
`analyzeCommitsCmd: 'test "$FORCE_MAJOR" = "true" && echo major || true'`, driven by the `bump`
input from M2.
*Files:* `package.json`, `.github/workflows/release.yml`
*Result:* A `BREAKING CHANGE` footer raises the minor position, not the major one, and still
renders as its own `BREAKING CHANGES` section in the changelog and the release notes. A major
appears only when `major` is selected when triggering the release workflow. No commit text can
cause one.

*Mechanism:* the commit-analyzer evaluates custom rules **before** its defaults and falls back
to the defaults only when no custom rule matched, so a single rule suffices. semantic-release
reduces the `analyzeCommits` results of all plugins to the **highest** release type, which is
what lets the exec plugin override the analyzer.

*Caveat:* because the override is independent of the commit types, a forced major would also
produce `2.0.0` from a state holding only `docs:` commits. The dry run from M2 is the guard.

**M19 — Reject the exclamation-mark form**
*Action:* A local commitlint plugin rule in `commitlint.config.mjs` rejecting a header with `!`
before the colon, pointing at the `BREAKING CHANGE:` footer in its message.
*Files:* `commitlint.config.mjs`
*Result:* `git commit -m "feat!: Umbau"` is rejected locally.

*Why:* the Angular preset that semantic-release uses (`conventional-changelog-angular` 9.4.0)
carries `headerPattern: /^(\w*)(?:\((.*)\))?: (.*)$/` — **no `!`**. Verified against the
installed parser:

| Commit | Parsed type | Consequence |
| :--- | :--- | :--- |
| `feat: Neue Ansicht` | `feat` | minor |
| `fix(client): Zeitplan` | `fix` | patch |
| `feat: Neu` + `BREAKING CHANGE:` footer | `feat` + 1 note | major → **minor** after M18 |
| `feat!: Neue Ansicht` | **`undefined`** | **no release** |

commitlint waves `feat!:` through — the exclamation mark is valid Conventional Commits — and
semantic-release then fails to recognise the commit as typed at all. After M18 there is a
second reason: `!` reads as "major" to a human while this project means "minor".

**M6 — Protect `:main` from the registry cleanup**
*Action:* `exclude-tags: latest,main,dev,*.*.*,*.*`, correct the outdated justification comment.
*Files:* `.github/workflows/cleanup-packages.yml`
*Result:* The nightly 02:00 run leaves `:main` untouched. The comment above the setting
currently records that `main` is deliberately absent because that tag was already broken and
`delete-partial-images` should clear it — a reason that no longer applies once `:main` is a
production tag.

**M7 — User documentation**
*Action:* Extend the image table by `:main`, explain the distinction to `latest` and `:dev`.
*Files:* `docs/install-server.md`, `docs/install-client.md`
*Result:* The table has four rows and a self-hoster can decide which tag to use without asking.
The misreading "`:main` sounds more trustworthy than `:latest`" is ruled out because the
difference is stated next to it.

**M8 — Correct `CLAUDE.md`**
*Action:* Rewrite the *Versioning and Releases* section for the new model.
*Files:* `CLAUDE.md`
*Result:* The project instructions describe the actual pipeline. The sentences about the
automatic push trigger and the beta channel on `dev` disappear. Follow-up work starts from
correct assumptions — this very discrepancy is what made the first pass of the review treat
commitlint as functioning.

**M20 — Developer documentation**
*Action:* Rework *Release* and *Deployment* in `docs/development.md` and add a new
*Commits and Versioning* section.
*Files:* `docs/development.md`
*Result:* A developer finds in one place which commit types exist, which of them produce a
version, how a breaking change is written, why the exclamation mark does not exist, how a
release is triggered and how a major comes about. No statement on the page contradicts the
workflows any more.

Five statements in the current *Release* section become wrong, one of them already is:

| Today | After |
| :--- | :--- |
| "runs on every push to `main` and `dev`" | wrong (M2) |
| ASCII diagram `push to main └─► release.yml` | wrong (M2) |
| "**`dev`** produces a prerelease on the `beta` channel" | wrong (M3) |
| "a `!` **or** a `BREAKING CHANGE:` footer the major" | **already wrong** — `!` produces nothing |
| "commitlint enforces that in `ci.yml` on every pull request" | wrong (M1) |

New *Commits and Versioning* section, contents:

- the eleven permitted types and which of them produce a version bump
- the `BREAKING CHANGE:` footer with an example — raises the **minor** position
- why `feat!:` does not work, and that M19 rejects it
- the hooks from M1, and the one-off `git config core.hooksPath .githooks` after a fresh clone
- `subject-case` is switched off — German subjects capitalising nouns are intended
- the escape hatch `[skip release]`, which removes a single commit from the analysis

The section stays inside `development.md` rather than becoming its own page: the page is
already the *Contributing* entry in the navigation, and a second page means a `nav` entry in
`mkdocs.yml` plus cross-links that have to stay in sync.

### Stage 3 — housekeeping

**M9 — Replace `NPM_TOKEN` with `GITHUB_TOKEN`**
*Result:* One fewer secret, and no image build can fail on an expired PAT while CI stays green.
`ci.yml` already resolves the `@stefgo` scope with `GITHUB_TOKEN`, which suggests the PAT is
redundant — to be confirmed by a test run before removal.

**M10 — Skip `verify` on a tag dispatch**
*Result:* The release path checks once instead of twice; a release is shorter by a full
`npm ci` + build + typecheck + lint.

**M11 — `paths-ignore` for documentation commits**
*Result:* A push touching only `docs/**` or `*.md` no longer triggers four image builds. For
the last ten commits: 40 builds saved.

**M12 — `SECURITY.md`**
*Result:* GitHub shows a security policy and a reporting path. A vulnerability report arrives
privately instead of as a public issue — relevant for software holding JWT secrets, PBS
credentials and optional OIDC configuration.

**M13 — Remove the rollup workaround**
*Result:* The *Install native rollup binary* step disappears from `ci.yml` and the matching
`RUN` line from `Dockerfile.server`; `npm ci` suffices on both platforms. Root cause is a
`package-lock.json` generated on macOS that lacks the Linux optional dependencies.

**M14 — Dependabot for `github-actions` only**
*Result:* A new major of an action arrives as a pull request instead of quietly ageing.
Expected volume: a few per year. npm is deliberately excluded — four workspaces would produce
a flood of pull requests with no test suite to catch regressions.

**M15 — Prune stale local branches**
*Result:* `git branch` lists current work instead of 18 entries reaching back to February.

### Stage 4 — separate projects

**M16 — Health endpoint, `HEALTHCHECK`, smoke test**
*Action:* Add a health route to the backend, a `HEALTHCHECK` to the images, and a pipeline step
that starts the freshly built server image and queries it.
*Result:* Three things at once. A `GET /health` answers — there is none today. A hung backend
is marked `unhealthy` by Docker, which is what finally makes `restart: unless-stopped` work for
self-hosters instead of keeping a dead process alive. And the pipeline **fails the build when
no answer comes** — the first automated proof that a published image starts at all. With no
test suite in the project, this is the largest gain in confidence per line invested.

**M17 — Consolidate the ARM client**
*Action:* Build the client per architecture by digest and merge into one manifest, as the
server already does; retire `pbcm-client-arm64` through a deprecation cycle.
*Result:* Only `ghcr.io/stefgo/pbcm-client` remains and `docker pull` selects the architecture
itself. One Dockerfile instead of two that already diverge — `Dockerfile.client` builds on
`bookworm-slim`, `Dockerfile.client.arm64` on `trixie-slim`.

**Breaking change.** The name appears in seven places across `README.md`, `compose.yaml` and
four documentation pages, and in every ARM user's compose file. Keep publishing the old image
for one release cycle, announce it in the changelog, and only then remove it from
`cleanup-packages.yml`.

Side note: the ARM variant pulls a third-party `.deb` pinned to `4.1.4-1` without a checksum.
A `sha256sum` verification belongs with this work.

## 5. Sequence

| Stage | Measures | Character |
| :--- | :--- | :--- |
| 1 | M1, M5 | Small, self-contained, independent of the model change |
| 2 | M2, M3, M4, M18, M19, M6, M7, M8, M20 | One unit — see below |
| 3 | M9, M10, M11, M12, M13, M14, M15 | Housekeeping, any time |
| 4 | M16, then M17 | Separate projects, not appendages |

Stage 2 belongs together: M4 without M6 endangers the new `:main` tag, and M2/M3/M18 without
M7/M8/M20 leave documentation asserting something other than what the workflows do.

**Standing rule:** every measure that changes behaviour carries its documentation change in the
same step. M20 is the bracket that catches the sections no single measure touches directly.

## 6. Rejected

| Proposal | Reason |
| :--- | :--- |
| Pin actions to commit SHAs | Not a standard for this class of project; produces update noise for a single maintainer |
| Dependabot for npm | Four workspaces → a flood of pull requests with no test suite as a net |
| A `{{major}}` Docker tag (`:1`) | A floating `:1` is a support liability with database migrations, not a feature |
| Abolish `dev` (originally proposed) | Requirements 1 and 2 solve the problem better: `dev` stays and loses only its version numbers |

## 7. Verification

After stage 2 the following must hold:

- `git commit -m "Update docs"` is refused; `docs: …` passes.
- `git commit -m "feat!: x"` is refused.
- A push to `dev` updates `:dev`, a push to `main` updates `:main`; neither creates a tag.
- *Actions → Release* with `dry_run` prints a version number and changes nothing.
- A release run on a state without `feat:`/`fix:` commits turns red.
- A `BREAKING CHANGE` footer produces a minor; `bump: major` produces a major.
- `mkdocs build --strict` passes — it is the only link check the repository has.
- No statement in `development.md`, `install-server.md` or `CLAUDE.md` contradicts the workflows.

## 8. Background references

- Permitted types, read from the installed `@commitlint/config-conventional`:
  `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`
- Default release rules of `@semantic-release/commit-analyzer`: `breaking → major`,
  `revert → patch`, `feat → minor`, `fix → patch`, `perf → patch`; everything else releases
  nothing
- `subject-case` is switched off in `commitlint.config.mjs`, with the reason given there:
  German subjects capitalise nouns
- semantic-release filters commits whose message contains `[skip release]` or `[release skip]`
  before analysis
