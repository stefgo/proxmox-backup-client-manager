/**
 * The demo data every screenshot is taken of.
 *
 * These are plain objects rather than JSON files on purpose: half the values are
 * timestamps, and they have to be expressed *relative* to the frozen clock in
 * capture.mjs. A stored JSON file would either carry absolute dates that drift out of
 * the dashboard's 24-hour history window as the file ages, or dates recomputed at read
 * time -- which is what `ago()` does, only readably.
 *
 * The shapes follow the schemas in shared/src/schemas.ts. Nothing type-checks them,
 * because the interception in capture.mjs answers with them as raw JSON; when an API
 * shape changes, this file has to be corrected by hand. See README.md.
 */

/** The instant every screenshot is taken at. Any date below is measured from here. */
export const FIXED_NOW = new Date("2026-05-12T09:32:00.000Z");

const ago = (ms) => new Date(FIXED_NOW.getTime() - ms).toISOString();
const ahead = (ms) => new Date(FIXED_NOW.getTime() + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const CLIENT_IDS = {
    web: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    db: "2c8e7ade-cade-4c3e-8c6e-bc9efcced5fe",
    mail: "3da9f8be-dbef-4d4f-9d7f-cdaf0ddef60a",
    nas: "4eb0091f-ecf0-4e50-ae80-de0b1eef071b",
};

export const clients = [
    {
        id: CLIENT_IDS.web,
        hostname: "web-01.example.lan",
        displayName: "Web Frontend",
        status: "online",
        lastSeen: ago(12 * 1000),
        version: "1.6.2",
        connectionMode: "inbound",
        inboundAllowedIp: "10.20.0.0/24",
        ipAddress: "10.20.0.14",
        tunnelConfigured: false,
    },
    {
        id: CLIENT_IDS.db,
        hostname: "db-01.example.lan",
        displayName: "PostgreSQL Primary",
        status: "online",
        lastSeen: ago(8 * 1000),
        version: "1.6.2",
        connectionMode: "inbound",
        inboundAllowedIp: "10.20.0.0/24",
        ipAddress: "10.20.0.21",
        tunnelConfigured: true,
    },
    {
        id: CLIENT_IDS.mail,
        hostname: "mail-01.example.lan",
        displayName: "Mail Relay",
        status: "online",
        lastSeen: ago(31 * 1000),
        version: "1.6.1",
        connectionMode: "outbound",
        outboundTargetAddress: "mail-01.example.lan:3001",
        tunnelConfigured: false,
    },
    {
        id: CLIENT_IDS.nas,
        hostname: "nas-01.example.lan",
        displayName: "Archive NAS",
        status: "offline",
        lastSeen: ago(2 * DAY + 3 * HOUR),
        version: "1.5.0",
        connectionMode: "inbound",
        inboundAllowedIp: null,
        ipAddress: "10.20.0.9",
        tunnelConfigured: false,
    },
];

/**
 * `secret` is a placeholder, not a redaction: the list endpoint returns the stored
 * repository rows, and a screenshot of a real one would publish a PBS API token.
 */
const pbsMain = {
    repositoryId: "pbs-main",
    baseUrl: "https://pbs.example.lan:8007",
    datastore: "tank",
    fingerprint: "a4:6f:2b:91:c8:0d:75:3e:11:aa:cf:62:98:40:d7:5b",
    username: "backup@pbs",
    tokenname: "pbcm",
    secret: "••••••••",
};

const pbsOffsite = {
    repositoryId: "pbs-offsite",
    baseUrl: "https://pbs-offsite.example.net:8007",
    datastore: "vault",
    fingerprint: "d1:03:9e:57:ba:4c:28:6f:35:e0:71:cd:8a:19:46:b2",
    username: "backup@pbs",
    tokenname: "pbcm",
    secret: "••••••••",
};

export const repositories = [
    { ...pbsMain, id: "pbs-main", status: "online" },
    { ...pbsOffsite, id: "pbs-offsite", status: "online" },
];

/** Status answers for GET /api/v1/repositories/:id/status, keyed by repository id. */
export const repositoryStatus = {
    "pbs-main": { status: "online" },
    "pbs-offsite": { status: "online" },
};

const schedule = (interval, unit, weekdays = []) => ({ interval, unit, weekdays });

const jobsByClient = {
    [CLIENT_IDS.web]: [
        {
            id: "5fc11a20-fd01-4f61-bf91-ef1c2ff01820",
            name: "Nightly root filesystem",
            schedule: schedule(1, "days"),
            scheduleEnabled: true,
            createdAt: ago(96 * DAY),
            lastRunAt: ago(7 * HOUR + 28 * MIN),
            nextRunAt: ahead(16 * HOUR + 32 * MIN),
            archives: [
                { name: "root.pxar", path: "/" },
                { name: "www.pxar", path: "/var/www" },
            ],
            repository: pbsMain,
            encryption: { enabled: true },
        },
    ],
    [CLIENT_IDS.db]: [
        {
            id: "60d22b31-0e12-4072-c0a2-f02d30012931",
            name: "PostgreSQL dumps",
            schedule: schedule(6, "hours"),
            scheduleEnabled: true,
            createdAt: ago(140 * DAY),
            lastRunAt: ago(2 * HOUR + 12 * MIN),
            nextRunAt: ahead(3 * HOUR + 48 * MIN),
            archives: [{ name: "pgdump.pxar", path: "/var/backups/postgres" }],
            repository: pbsMain,
            encryption: { enabled: true },
            tunnel: { required: true },
        },
        {
            id: "71e33c42-1f23-4183-d1b3-013e41123a42",
            name: "Weekly offsite copy",
            schedule: schedule(1, "weeks", ["sunday"]),
            scheduleEnabled: true,
            createdAt: ago(140 * DAY),
            lastRunAt: ago(3 * DAY + 4 * HOUR),
            nextRunAt: ahead(3 * DAY + 20 * HOUR),
            archives: [{ name: "pgdump.pxar", path: "/var/backups/postgres" }],
            repository: pbsOffsite,
            encryption: { enabled: true },
            tunnel: { required: true },
        },
    ],
    [CLIENT_IDS.mail]: [
        {
            id: "82f44d53-2034-4294-e2c4-124f52234b53",
            name: "Mailboxes",
            schedule: schedule(12, "hours"),
            scheduleEnabled: true,
            createdAt: ago(61 * DAY),
            lastRunAt: ago(4 * HOUR + 5 * MIN),
            nextRunAt: ahead(7 * HOUR + 55 * MIN),
            archives: [{ name: "vmail.pxar", path: "/var/vmail" }],
            repository: pbsMain,
            encryption: { enabled: false },
        },
    ],
    [CLIENT_IDS.nas]: [
        {
            id: "93055e64-3145-43a5-f3d5-235063345c64",
            name: "Media archive",
            schedule: schedule(1, "weeks", ["saturday"]),
            scheduleEnabled: false,
            createdAt: ago(210 * DAY),
            lastRunAt: ago(9 * DAY),
            archives: [{ name: "media.pxar", path: "/srv/media" }],
            repository: pbsOffsite,
            encryption: { enabled: false },
        },
    ],
};

/** GET /api/v1/jobs answers with one entry per client, each carrying that client's jobs. */
export const jobsResponse = Object.entries(jobsByClient).map(([clientId, jobs]) => ({
    clientId,
    jobs,
}));

export const jobsFor = (clientId) => jobsByClient[clientId] ?? [];

const clientOf = (id) => clients.find((c) => c.id === id);

/**
 * One history row. `endTime` null means the run is still going -- the list renders it as
 * running, which is what puts a live row in the screenshot instead of a wall of green.
 */
const run = ({ id, clientId, jobId, name, status, startedAgo, durationMs, exitCode = 0 }) => {
    const client = clientOf(clientId);
    return {
        id,
        clientId,
        jobId,
        name,
        type: "backup",
        status,
        startTime: ago(startedAgo),
        endTime: durationMs === null ? null : ago(startedAgo - durationMs),
        exitCode: durationMs === null ? null : exitCode,
        stdout: null,
        stderr:
            status === "failed"
                ? "Error: unable to open chunk store '/mnt/vault' - No such file or directory"
                : null,
        hostname: client.hostname,
        displayName: client.displayName,
    };
};

const historyRows = [
    run({
        id: "h-0009",
        clientId: CLIENT_IDS.db,
        jobId: "60d22b31-0e12-4072-c0a2-f02d30012931",
        name: "PostgreSQL dumps",
        status: "running",
        startedAgo: 3 * MIN,
        durationMs: null,
    }),
    run({
        id: "h-0008",
        clientId: CLIENT_IDS.mail,
        jobId: "82f44d53-2034-4294-e2c4-124f52234b53",
        name: "Mailboxes",
        status: "success",
        startedAgo: 4 * HOUR + 5 * MIN,
        durationMs: 3 * MIN + 41 * 1000,
    }),
    run({
        id: "h-0007",
        clientId: CLIENT_IDS.db,
        jobId: "60d22b31-0e12-4072-c0a2-f02d30012931",
        name: "PostgreSQL dumps",
        status: "success",
        startedAgo: 2 * HOUR + 12 * MIN,
        durationMs: 6 * MIN + 12 * 1000,
    }),
    run({
        id: "h-0006",
        clientId: CLIENT_IDS.web,
        jobId: "5fc11a20-fd01-4f61-bf91-ef1c2ff01820",
        name: "Nightly root filesystem",
        status: "success",
        startedAgo: 7 * HOUR + 28 * MIN,
        durationMs: 11 * MIN + 4 * 1000,
    }),
    run({
        id: "h-0005",
        clientId: CLIENT_IDS.db,
        jobId: "71e33c42-1f23-4183-d1b3-013e41123a42",
        name: "Weekly offsite copy",
        status: "failed",
        startedAgo: 9 * HOUR + 40 * MIN,
        durationMs: 48 * 1000,
        exitCode: 1,
    }),
    run({
        id: "h-0004",
        clientId: CLIENT_IDS.db,
        jobId: "60d22b31-0e12-4072-c0a2-f02d30012931",
        name: "PostgreSQL dumps",
        status: "success",
        startedAgo: 14 * HOUR + 12 * MIN,
        durationMs: 5 * MIN + 55 * 1000,
    }),
    run({
        id: "h-0003",
        clientId: CLIENT_IDS.mail,
        jobId: "82f44d53-2034-4294-e2c4-124f52234b53",
        name: "Mailboxes",
        status: "success",
        startedAgo: 16 * HOUR + 5 * MIN,
        durationMs: 3 * MIN + 2 * 1000,
    }),
    run({
        id: "h-0002",
        clientId: CLIENT_IDS.db,
        jobId: "60d22b31-0e12-4072-c0a2-f02d30012931",
        name: "PostgreSQL dumps",
        status: "success",
        startedAgo: 20 * HOUR + 12 * MIN,
        durationMs: 6 * MIN + 30 * 1000,
    }),
    run({
        id: "h-0001",
        clientId: CLIENT_IDS.web,
        jobId: "5fc11a20-fd01-4f61-bf91-ef1c2ff01820",
        name: "Nightly root filesystem",
        status: "success",
        startedAgo: 31 * HOUR + 28 * MIN,
        durationMs: 10 * MIN + 51 * 1000,
    }),
    run({
        id: "h-0000",
        clientId: CLIENT_IDS.nas,
        jobId: "93055e64-3145-43a5-f3d5-235063345c64",
        name: "Media archive",
        status: "success",
        startedAgo: 9 * DAY,
        durationMs: 52 * MIN,
    }),
];

export const historyResponse = {
    success: true,
    count: historyRows.length,
    data: historyRows,
};

/**
 * The per-client endpoint returns the agent's own HistoryEntry shape, which has
 * `jobConfigId` where the global rows have `jobId` and carries no hostname at all.
 */
export const historyFor = (clientId) =>
    historyRows
        .filter((r) => r.clientId === clientId)
        .map(({ jobId, hostname, displayName, clientId: _c, ...rest }) => ({
            ...rest,
            jobConfigId: jobId,
        }));

/**
 * GET /api/v1/repositories/:id/snapshots. Note the shape: the endpoint answers in the
 * camelCase SnapshotSchema, not the hyphenated form PBS itself returns -- the backend
 * translates on the way through.
 *
 * `backupTime` is a Unix timestamp in seconds, which is why these are not ISO strings
 * like every other date in this file.
 *
 * `backupId` is the client's **UUID**, not its hostname: useClientDetailStore matches
 * snapshots to a client with `s.backupId === clientId`, so hostnames here would leave the
 * detail page's Snapshots tile reading 0 with the rows sitting right there in the answer.
 */
const secondsAgo = (ms) => Math.floor((FIXED_NOW.getTime() - ms) / 1000);

const snapshot = (backupId, agoMs, sizeGiB, verified = true) => ({
    backupType: "host",
    backupId,
    backupTime: secondsAgo(agoMs),
    files: [
        { filename: "root.pxar.didx", cryptMode: "encrypt", size: Math.round(sizeGiB * 1024 ** 3) },
        { filename: "catalog.pcat1.didx", cryptMode: "encrypt", size: 2_314_112 },
        { filename: "index.json.blob", cryptMode: "none", size: 1_284 },
    ],
    size: Math.round(sizeGiB * 1024 ** 3),
    owner: "backup@pbs!pbcm",
    verification: verified
        ? { state: "ok", lastVerify: secondsAgo(agoMs - 2 * HOUR) }
        : undefined,
});

export const snapshotsByRepository = {
    "pbs-main": [
        snapshot(CLIENT_IDS.db, 2 * HOUR + 12 * MIN, 18.4),
        snapshot(CLIENT_IDS.db, 8 * HOUR + 12 * MIN, 18.3),
        snapshot(CLIENT_IDS.web, 7 * HOUR + 28 * MIN, 6.1),
        snapshot(CLIENT_IDS.db, 14 * HOUR + 12 * MIN, 18.3),
        snapshot(CLIENT_IDS.mail, 4 * HOUR + 5 * MIN, 3.7),
        snapshot(CLIENT_IDS.web, 31 * HOUR + 28 * MIN, 6.0),
    ],
    "pbs-offsite": [
        snapshot(CLIENT_IDS.db, 3 * DAY + 4 * HOUR, 18.1),
        snapshot(CLIENT_IDS.nas, 9 * DAY, 412.8, false),
    ],
};

export const me = { username: "admin" };

/**
 * GET /api/auth/config, which the login page asks before deciding what to render.
 * "local" is the username/password form; "oidc" replaces it with a single sign-in button.
 */
export const authConfig = { type: "local" };

/**
 * The three endpoints the agent's own status and register pages poll.
 *
 * Field names come from client/src/web/server.ts, not from a schema -- these routes
 * return plain object literals, so there is nothing shared to check them against.
 */
export const agent = {
    registered: {
        "/api/status/auth": { hasAuthToken: true },
        "/api/status/server": {
            serverUrl: "https://pbcm.example.lan:3000",
            serverReachable: true,
        },
        "/api/status/connection": { connected: true },
    },
    unregistered: {
        "/api/status/auth": { hasAuthToken: false },
        "/api/status/server": { serverUrl: null, serverReachable: false },
        "/api/status/connection": { connected: false },
    },
};
