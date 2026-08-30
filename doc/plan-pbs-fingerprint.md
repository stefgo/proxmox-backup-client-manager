# Plan: manage the PBS certificate fingerprint and keep it current

**Status:** implemented · **Created:** 2026-08-30 · **Rev. 3**

> All building blocks are in place. Deviations from Rev. 2:
> - `CertProbe` does **not** set SNI when the address is an IP (RFC 6066; Node will reject it in future).
> - The write-back path in the client uses `JobRepository.updateConfig` instead of `upsert`, so that
>   the schedule columns are not overwritten with stale copies.
> - Building block 5 uses `core/InsecureHttp.ts` (`https.request`) instead of an undici agent —
>   `undici` is not a dependency of the client, and two call sites do not justify adding one.
> - Distribution skips jobs without an `id`: a `JOB_SAVE_CONFIG` without one creates a **new** job on
>   the client side and would duplicate the schedule.
> - The new UI texts are English, matching the rest of the repository feature (the tunnel wizard is
>   German — the mix is pre-existing, not new).

## 1. What prompted this

After the PBS certificate was renewed, the backup of the outbound client `zeus` failed:

```
WARNING: certificate fingerprint does not match expected fingerprint!
expected: 49:88:dc:78:...:e6:ce
certificate validation failed - Certificate fingerprint was not confirmed.
```

The direct (inbound) clients kept running unchanged. The cause:

`proxmox-backup-client` checks in two stages. First the regular OpenSSL validation (CA chain +
hostname); if that succeeds, `PBS_FINGERPRINT` is **not evaluated at all**. Only when it fails does
the fingerprint comparison come into play.

- **Inbound:** the target is `https://pbs.internal.g4l-online.de` → CA check succeeds → fingerprint irrelevant.
- **Outbound:** the target is `127.0.0.1:<lease port>` (`TunnelClient.buildRepositoryValue`) → the
  hostname can never match → the fingerprint is the only basis of trust → a stale value breaks the run.

The stored value dates from 2026-02-27 and nobody holds it against reality:
`RepositoryController.update` only writes to the server DB, and the clients keep the fingerprint as a
frozen copy in the job snapshot (`Handlers.handleJobSave`).

## 2. Guiding principle

> A fingerprint may be adopted automatically when an **instance independent of it** attests to its
> authenticity — the CA chain during a handshake with `rejectUnauthorized: true` against the **real
> hostname**. Where that attestation cannot be had (self-signed), a human decides.

Who performs the check is secondary — what matters is whether it happens somewhere the real hostname
is available.

| Case | CA check possible by | Fingerprint source |
|---|---|---|
| Inbound, CA-valid | the client itself | measured itself, the server is informed for the record |
| Inbound, self-signed | nobody, automatically | the confirmed value supplied by the server |
| Outbound/tunnel | the server only (the client sees just `127.0.0.1`) | the server, just in time via the lease |

## 3. Shared foundation: `CertProbe`

A helper needed in **both** workspaces (server and client). Implementing it as a module in
`shared/src/` would be the obvious move, but fails because `shared` is so far purely type- and
schema-based and therefore importable in the browser — a `node:tls` import would break the frontend
build. **Decision: two slim copies**, `server/backend/src/services/CertProbe.ts` and
`client/src/core/CertProbe.ts`, with identical signatures.

```ts
export interface CertProbeResult {
    reachable: boolean;
    fingerprint?: string;      // normalised: lowercase, with colons
    caValid: boolean;          // handshake with rejectUnauthorized:true succeeded
    notAfter?: string;         // expiry date, for display in the UI
    error?: string;
}

export async function probeCertificate(
    baseUrl: string,
    timeoutMs = 5000,
): Promise<CertProbeResult>;
```

Implementation:

1. Host and port from `baseUrl` (`new URL`), default port 8007.
2. `tls.connect({ host, port, servername: host, rejectUnauthorized: true, timeout })`.
   Success → `caValid: true`.
3. On `ERR_TLS_CERT_ALTNAME_INVALID` / `DEPTH_ZERO_SELF_SIGNED_CERT` and similar: a second attempt
   with `rejectUnauthorized: false`, purely to **measure** the fingerprint at all → `caValid: false`.
4. Fingerprint from `socket.getPeerCertificate().fingerprint256`.

**Critical details:**

- `fingerprint256` returns uppercase (`49:88:DC:...`), the DB holds lowercase. Every comparison goes
  through a normalisation function (`toLowerCase()`, whitespace stripped) — otherwise the check
  reports drift where there is none.
- In the **client**, `rejectUnauthorized: true` must be set explicitly. `client/src/web/server.ts:110`
  and `:179` set `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` process-wide and never reset it;
  relying on the default there would mean never validating and adopting unconditionally.
  → See building block 5.
- A probe failure (PBS unreachable) is **never** a reason to abort a backup run. It always falls back
  to the stored value.

## 4. Building block 0 — `repositoryId` in the job snapshot (prerequisite for block 2)

**Goal:** a job knows which repository it belongs to. Today it only carries an anonymous copy of the
credentials, and any mapping would have to guess via `baseUrl` + `datastore`.

### Good news: no SQL migration needed

On the client, the repository sits as **JSON in the `config` column** of the `jobs` table
(`Handlers.handleJobSave` builds `configObj` and stores it via `JobRepository.upsert`). On the server
side there is no job table at all — the server keeps jobs only in the volatile
`ProxyService.jobCache`. An extra field in the JSON is therefore **backwards compatible without any
schema change to the DB**; old records simply do not have it.

### Changes

- `shared/src/schemas.ts`, `RepositorySchema` (l. 3–10): `repositoryId: z.string().optional()`.
  Optional, so existing jobs still validate. Then `npm run build -w shared`.
- `JobRepositorySelect.tsx` l. 48–56: `handleSelect` currently copies exactly the six fields of
  `RepositorySchema` and **discards the `id`** of the `ManagedRepository`. Add `repositoryId: repo.id`
  here — from then on every newly saved job carries the ID.
- `isCurrentRepo` (ibid. l. 66–70) compares `baseUrl` + `datastore` + `username`. It can move to the
  ID once the backfill phase is complete — **not** right away, or existing jobs will look like
  "no repository selected" in the editor.

### Backfill for existing jobs

In `ProxyService.refreshJobCache(clientId)` (l. 46–61), that is **whenever a client connects**, do it
once:

1. Pick out jobs without `repository.repositoryId`.
2. Resolve them against `RepositoryConfigRepository.findAll()` via `base_url` + `datastore`.
3. **Exactly one** match → write back a `JOB_SAVE_CONFIG` with the added ID, and log it.
4. No match or an ambiguous one → skip and warn. The job keeps working, only the distribution from
   block 2 does not reach it.

The backfill is idempotent and does nothing once complete. The fallback mapping via `baseUrl` +
`datastore` in block 2 stays as a safety net and can be removed once no more warnings appear.

## 5. Building block 1 — server: check and adopt in the repository properties

**Goal:** the operator sees expected and actual, and can adopt deliberately.

### Backend

- `server/backend/src/services/CertProbe.ts` (new, see §3).
- `RepositoryController.probeCertificate` (new) — GET `/api/v1/repositories/:repositoryId/certificate`.
  Response:
  ```json
  {
    "storedFingerprint": "49:88:...",
    "measuredFingerprint": "ab:cd:...",
    "matches": false,
    "caValid": true,
    "notAfter": "2026-11-27T10:00:00Z",
    "reachable": true
  }
  ```
- Route in `server/backend/src/routes/api.ts` alongside the other `/repositories/...` entries (l. 133–155).
- Adoption needs **no** new endpoint: the frontend writes the measured value via the existing
  `PUT /api/v1/repositories/:repositoryId`.

### Frontend

- `useRepositoryStore`: `probeCertificate(id, token)`, analogous to `checkRepositoryStatus`.
- `RepositoryEditor.tsx`: a **"Check certificate"** button next to the fingerprint field (l. 85–90).
  Result display:
  - identical → green note "Fingerprint is up to date", plus the expiry date;
  - differing + `caValid` → the measured value and an **"Adopt"** button (which fills the field);
  - differing + `!caValid` → a **warning** stating explicitly that authenticity could not be
    confirmed, adoption only after checking out of band
    (`proxmox-backup-manager cert info` on the PBS);
  - unreachable → a neutral note, no change.
- Additionally: the differing fingerprint most recently reported by a client (§7) is shown here, if
  there is one.

**Without block 2 an adoption here stays server-side** — the clients do not get it yet.

## 6. Building block 2 — the distribute button

**Goal:** roll the confirmed value out to all connected clients deliberately. A conscious operator
action, **not** an automatic fan-out on every `PUT`.

- `RepositoryController.distribute` (new) — POST `/api/v1/repositories/:repositoryId/distribute`.
- Sequence:
  1. `ProxyService.getAllCachedJobs()` returns `{ clientId, jobs }` for all **connected** clients.
  2. Filter jobs: primarily via `repository.repositoryId` (block 0), otherwise via
     `baseUrl` + `datastore` for jobs not yet migrated.
  3. Per match, `ProxyService.sendRequest(clientId, WS_EVENTS.JOB_SAVE_CONFIG, { requestId, job })`
     with an updated `repository.fingerprint` — exactly the path from `JobController.save`.
  4. Then `ProxyService.refreshJobCache(clientId)`.
- Response: `{ updated: n, clients: [...], skippedOffline: [...] }`.
- UI: a **"Distribute to connected clients"** button in the repository view, with a confirmation
  dialog and a result message.
- **Offline clients:** reported by name as skipped — nothing more (decision §10.2). They receive the
  value on the next regular job save, the next manual distribution, or through block 3.

## 7. Building block 3 — client: measure for yourself when the CA attests to it

**Goal:** inbound clients keep themselves current, even without server contact.

- `client/src/core/CertProbe.ts` (new, see §3).
- In `Executor.ts`, in the block that sets `PBS_FINGERPRINT` (l. 358–380):

```ts
if (jobConfigData.repository) {
    let fingerprint = repo.fingerprint;

    // Tunnelled runs do not measure for themselves: the target is 127.0.0.1, where the CA
    // check cannot succeed. There the lease supplies the value (block 4).
    if (!jobConfigData.tunnel?.required) {
        const probe = await probeCertificate(repo.baseUrl);
        if (probe.caValid && probe.fingerprint) {
            fingerprint = probe.fingerprint;      // the CA attests to authenticity
        }
    }
    if (fingerprint) env.PBS_FINGERPRINT = fingerprint;
}
```

- **Persisting:** if the measured value differs from the stored one and `caValid` holds, the job
  snapshot is updated via `JobRepository.upsert`, so the next offline run has it too.
- **Reporting back:** a new event `FINGERPRINT_OBSERVED` (client → server) in
  `shared/src/constants.ts` and `shared/src/types.ts`:
  ```ts
  FINGERPRINT_OBSERVED: { req: { repositoryId?: string; baseUrl: string; fingerprint: string; caValid: boolean }; res: void }
  ```
  Sent via `Connection.send`, received in `WebSocketController` (pattern: the other client→server
  events from l. 388 onwards).

  **The server writes nothing but a log entry in response** (decision §10.4) — no automatic adoption
  into the DB. Otherwise a compromised client could set the expected value for everyone else.
  Adoption stays with block 1. The most recently reported value is additionally included in the
  repository object of the API response, so §5 can display it.

## 8. Building block 4 — tunnel: the fingerprint via the lease

**Goal:** outbound clients get the value just in time, because they cannot determine it themselves.

- `shared/src/schemas.ts`: extend `TunnelAcquireResultSchema` (l. 289–296) with
  `fingerprint: z.string().optional()`. Then `npm run build -w shared`.
- `WebSocketController.handleTunnelAcquire` (l. 407–465): after `resolveTunnelTarget` the repository
  is known. Before granting the lease:
  ```ts
  const probe = await probeCertificate(repo.base_url);
  const fingerprint = probe.caValid && probe.fingerprint
      ? probe.fingerprint          // CA-attested → fresh
      : repo.fingerprint;          // otherwise the stored, confirmed value
  ```
  and include it in the `TUNNEL_ACQUIRE_RESULT` payload.
- **The lease is never refused because of the probe.** If it fails, the stored value applies.
- If `caValid` holds and the value differs from the DB, the difference is logged (adoption via
  block 1, not here — consistent with §7).
- `client/src/features/Executor.ts` l. 481–489 (backup) and l. 786–796 (restore):
  ```ts
  lease = await TunnelClient.acquire(runId, jobId);
  env.PBS_REPOSITORY = TunnelClient.buildRepositoryValue(jobConfigData.repository, lease);
  if (lease.fingerprint) env.PBS_FINGERPRINT = lease.fingerprint;   // new
  ```
- `TunnelClient.acquire` passes the new field through in `TunnelLease`.

With that, in the tunnel case the fingerprint is a **property of the lease** rather than a frozen
snapshot value — the class of failure from §1 disappears there entirely.

## 9. Building block 5 — clean up `NODE_TLS_REJECT_UNAUTHORIZED` (prerequisite for block 3)

`client/src/web/server.ts:110` and `:179` disable TLS validation process-wide and permanently, while
what is actually meant is only the connection to the PBCM server during registration and status
queries.

- Replace it with a locally scoped undici `Agent` carrying `connect: { rejectUnauthorized: false }`,
  attached solely to those two `fetch` calls.
- The rest of the process then validates normally again.

Without this step, block 3 is protected only by the explicit `rejectUnauthorized: true` in
`CertProbe` — which holds, but is a silent dependency that breaks at the next `fetch`.

## 10. Decisions taken

1. **Introduce `repositoryId`** (rather than guessing via `baseUrl` + `datastore` forever) →
   block 0, §4. No SQL migration needed, backfill when a client connects.
2. **No queue for offline clients.** They are reported by name as skipped during distribution;
   delivery happens incidentally through the regular paths.
3. **`CertProbe` duplicated instead of living in `shared/`** — confirmed, so that `shared` stays
   importable in the browser.
4. **Client reports produce only a log entry**, no automatic adoption and no dashboard channel. The
   most recently reported value is shown in the repository view.

## 11. Order and value

| # | Block | Solves | Effort |
|---|---|---|---|
| 1 | Server: check/adopt | visibility, correct expected value | small |
| 0 | `repositoryId` + backfill | prerequisite for 2 | small |
| 2 | Distribute button | the acute `zeus` problem, without client changes | small |
| 5 | TLS cleanup | prerequisite for 3 | small |
| 3 | Client measures itself | inbound + offline, self-healing | medium |
| 4 | Tunnel lease | outbound permanently, no drift possible | medium |

**1 + 0 + 2 solve the concrete outage immediately and without touching client code.** 3–5 make the
class of failure structurally impossible.

## 12. Test protocol

1. **Baseline:** `zeus` backup with a stale fingerprint → fails reproducibly.
2. **Block 1:** "Check certificate" shows the difference, `caValid: true`, the correct expiry date.
3. **Block 0:** an existing job without `repositoryId` → after the client reconnects the job carries
   the ID, the backfill is noted in the log, a second reconnect writes nothing further.
4. **Block 0, negative:** create a second repository with the same `baseUrl` + `datastore` → the
   backfill skips the job and warns, the job stays runnable.
5. **Block 2:** adopt + distribute → the `zeus` backup runs through. Client offline → reported as
   skipped, no error.
6. **Block 3:** an inbound client against a CA-valid PBS with a deliberately wrong stored fingerprint
   → the run succeeds, the snapshot was corrected, `FINGERPRINT_OBSERVED` produces exactly one log
   entry and **no** DB change.
7. **Block 3, negative:** a PBS with a self-signed certificate → **no** adoption, the stored value
   remains authoritative, a wrong value still leads to failure (the pin works).
8. **Block 4:** renew the PBS certificate, change **nothing** in the UI → the next tunnelled backup
   still runs through (the value came via the lease).
9. **Block 4, negative:** PBS unreachable at the moment of the lease → the lease is granted anyway,
   the stored value is used.
10. **Block 5:** after registering through the client web UI, `NODE_TLS_REJECT_UNAUTHORIZED` is not
    set; a `CertProbe` against a self-signed host still reports `caValid: false`.

## 13. Files affected

**New:** `server/backend/src/services/CertProbe.ts`, `client/src/core/CertProbe.ts`

**Changed:**
- `shared/src/schemas.ts` (`RepositorySchema.repositoryId`, `TunnelAcquireResultSchema.fingerprint`),
  `shared/src/constants.ts` + `shared/src/types.ts` (`FINGERPRINT_OBSERVED`)
  → then `npm run build -w shared`
- `server/backend/src/controllers/RepositoryController.ts`, `server/backend/src/routes/api.ts`,
  `server/backend/src/controllers/WebSocketController.ts`, `server/backend/src/services/ProxyService.ts`
- `server/frontend/src/stores/useRepositoryStore.ts`,
  `server/frontend/src/features/repositories/components/RepositoryEditor.tsx`,
  `server/frontend/src/features/clients/components/job-editor/JobRepositorySelect.tsx`
- `client/src/features/Executor.ts`, `client/src/features/TunnelClient.ts`, `client/src/web/server.ts`
- `doc/api.md` (new endpoints + WS event), `doc/tunnel.md` (§ fingerprint), `doc/backend.md`
