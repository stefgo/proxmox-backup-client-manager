# Security Policy

## Supported versions

Only the most recent release receives fixes. There are no maintenance branches for
older versions — if you run an older one, upgrading is the fix.

| Version | Supported |
| :------ | :-------- |
| Latest release | ✅ |
| Anything older | ❌ |

The rolling `:main` and `:dev` images are development artefacts, not releases. Report
problems you find there just the same, but expect the fix to arrive in the next release
rather than as a separate patch.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting instead: go to the
[Security tab](https://github.com/stefgo/proxmox-backup-client-manager/security) and
choose **Report a vulnerability**. The report is visible only to the maintainer, and the
discussion stays private until a fix is released.

Helpful things to include:

- Which component is affected — server, client agent, or the web frontend
- The version or image tag you are running
- What an attacker can achieve, and what access they need to start
- A reproduction, however rough

This is a single-maintainer project. Expect an initial reply within a few days rather
than within hours, and expect the fix to arrive with the next release.

## Where the sensitive parts are

If you are looking for somewhere to start, these are the areas where a defect would
matter most:

- **`jwtSecret`** in the server's `config.yaml` — it signs every session token. The file
  is generated on first start and must not be world-readable.
- **PBS credentials and fingerprints** — the server stores repository passwords and
  certificate fingerprints, and distributes them to agents as part of a job snapshot.
- **Agent registration** — a client authenticates with a `client_id` / `client_secret`
  pair over `/ws/agent`.
- **OIDC configuration**, when enabled — an alternative path into the same session
  handling as `POST /api/login`.
- **The SSH reverse tunnel** — outbound clients reach the PBS repository through a
  lease-based port forward, and the fingerprint is the only basis of trust on that path.
  See [`docs/tunnel.md`](docs/tunnel.md).

## Scope

In scope: this repository — the server, the client agent, the shared library, the
container images published under `ghcr.io/stefgo/pbcm-*`, and the workflows that build
them.

Out of scope: `proxmox-backup-client` and Proxmox Backup Server themselves (report those
to [Proxmox](https://www.proxmox.com/en/about/security-and-privacy)), the community ARM64
build of the CLI ([wofferl/proxmox-backup-arm64](https://github.com/wofferl/proxmox-backup-arm64)),
and anything that requires an attacker to already hold administrative access to the host.
