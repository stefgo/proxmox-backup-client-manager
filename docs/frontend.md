# 🎨 Frontend Documentation

This documentation describes in detail the architecture, components, and state management of the frontend (`server/frontend`). The application is a **Single Page Application (SPA)** based on React, Vite, TypeScript, and Tailwind CSS.

## 📂 Project Structure

The structure follows a **Feature-First Approach**, where code belonging to a specific domain area is grouped together.

```
src/
├── features/         # Feature modules (Domain Logic)
│   ├── app/          # Providers (App.tsx), the route tree (routes.tsx), the shell (AppLayout.tsx)
│   ├── auth/         # Authentication & Context
│   ├── clients/      # Client management, lists, detail views, job editor
│   ├── history/      # Execution history views
│   ├── jobs/         # Global job list views
│   ├── repositories/ # PBS Repository management & snapshot browser
│   ├── settings/     # Settings sections (one tab each), their fields and manual runs
│   ├── tokens/       # Registration token management
│   └── users/        # User management
├── pages/            # Main pages (Entry points for routes)
│   ├── Login.tsx
│   └── Settings.tsx
├── queries/          # Server data: one module per area, read through the query cache
│   ├── clients.ts        # Client list, one client, a client's tunnel configuration
│   ├── clientDetail.ts   # A client's jobs, history and snapshots
│   ├── jobs.ts           # Jobs across all clients, their latest runs, start and delete
│   ├── repositories.ts   # Repositories, their status, their snapshots
│   ├── history.ts        # The history list and the "seen" state behind the dot
│   ├── webhooks.ts, scheduler.ts, fileSystem.ts, tokens.ts, users.ts
├── stores/           # Client-only state (Zustand)
│   └── useUIStore.ts     # Sidebar collapsed or not, persisted
├── components/       # Cross-feature components (LoadingIndicator), the discard question
├── hooks/            # Global Custom Hooks (job result toasts, URL search parameters, useBackPath,
│                     #   useEntityForm, useUnsavedChangesGuard)
├── lib/              # Non-React modules
│   ├── api.ts             # The one place a response is read: api.get(path, schema), …
│   ├── apiFetch.ts        # The session half underneath it: the cookie and the 401 → logout
│   ├── queryClient.ts     # The one QueryClient and its defaults
│   ├── queryKeys.ts       # Every cache key, hierarchical
│   ├── cacheUpdates.ts    # What a socket message makes of a cache entry (pure)
│   ├── paths.ts           # Every path, once: the patterns and their builders
│   ├── backPath.ts        # Where "back" is, from the chain of route matches (pure)
│   ├── entityForm.ts      # How a form's draft is compared and checked against its schema (pure)
│   ├── notFound.ts        # NotFoundError, thrown by a route whose subject is gone
│   └── realtimeEvents.ts  # Typed emitter for the high-frequency WS stream
├── index.css         # Global CSS layers (glass-card, field-label)
├── Main.tsx          # Entry point (mounts App)
└── utils.ts          # General utility functions
```

---

## 🚦 Routing & Navigation

One route tree says what lives where, and three things are read off it instead of being
kept beside it: the paths, the sidebar, and where "back" is.

| File | What it holds |
| :--- | :------------ |
| `lib/paths.ts` | `ROUTES` — every path pattern, once — and `paths`, one builder per pattern that takes a parameter (`paths.clientEdit(id)`). **No path literal anywhere else.** |
| `features/app/routes.tsx` | The tree inside the dashboard shell, as route objects. Each `path` is a `ROUTES` entry. |
| `features/app/router.tsx` | `createBrowserRouter`: `/login` beside the shell, the shell around the tree. |
| `features/app/routeElements.tsx` | What the tree renders: the boundaries and the thin wrappers that connect a page to the query cache. |
| `features/app/lazyPages.ts` | The page components, each loaded with its route. |
| `features/app/AppLayout.tsx` | The dashboard shell; the page is its `<Outlet />`. |
| `features/app/RouteError.tsx` | The `errorElement` of every area. |

`/login` stands alone; everything else lives behind `ProtectedRoute` inside the dashboard
shell.

| Path                                    | Component               | Description                                     |
| :-------------------------------------- | :---------------------- | :---------------------------------------------- |
| `/login`                                | `Login`                 | Authentication page (local & OIDC).             |
| `/`                                     | —                       | Redirects to `/clients`.                        |
| `/clients`                              | `ManagedClients`        | Client list.                                    |
| `/clients/new`                          | `AddClientWizard`       | Adds a client, starting with the connection mode. |
| `/clients/:clientId`                    | `ClientOverview`        | Detail view of a client; `?tab=` names the open tab. |
| `/clients/:clientId/edit`               | `ClientEditor`          | Name and target address of a client.            |
| `/clients/:clientId/tunnel`             | `ClientTunnelEditor`    | Adds, changes or removes the SSH reverse tunnel. |
| `/clients/:clientId/jobs/new`           | `ClientJobEditor`       | New job for this client.                        |
| `/clients/:clientId/jobs/:jobId`        | `ClientJobEditor`       | Edit a job; closes onto the client.             |
| `/clients/:clientId/restore/:repoId/:backupType/:backupTime` | `SnapshotRestoreEditor` | Restores one of the client's snapshots. |
| `/jobs`                                 | `ManagedJobs`           | Global job list, plus each job's last run.      |
| `/jobs/new`                             | `ClientJobEditor`       | New job, client picked in the form.             |
| `/jobs/:clientId/:jobId`                | `ClientJobEditor`       | Same editor; closes onto `/jobs`.               |
| `/repositories`                         | `ManagedRepositories`   | Repository list.                                |
| `/repositories/new`                     | `RepositoryEditor`      | Adds a repository.                              |
| `/repositories/:repoId`                 | `RepositoryOverview`    | Detail view of a repository.                    |
| `/repositories/:repoId/edit`            | `RepositoryEditor`      | Repository settings.                            |
| `/repositories/:repoId/restore/:backupType/:backupId/:backupTime` | `SnapshotRestoreEditor` | Restores a snapshot, to a client picked in the form. |
| `/history`                              | `HistoryOverview`       | Global execution history.                       |
| `/users`                                | `UserOverview`          | User management.                                |
| `/tokens`                               | `TokenOverview`         | Registration tokens.                            |
| `/webhooks`                             | `WebhookOverview`       | Webhooks, with their last delivery.             |
| `/webhooks/new`, `/webhooks/:webhookId` | `WebhookEditorRoute`    | Webhook editor with live preview and a test sent by the server. |
| `/settings`                             | `Settings`              | Cleanup settings and scheduler status, one tab per cleanup. |
| `*`                                     | `NotFound`              | —                                               |

A list and everything below it share the plural (`/clients/:clientId`). The singular forms
`/client/…` and `/repository/…` of earlier versions are gone without a redirect; a bookmark
to one lands on the not-found page.

**Every form is a route**, not a state flag: the URL says what is on screen, a reload keeps
it there, the link can be shared, and the browser's back button works. That includes the
repository editor and the restore form, which used to be local state of the page that
opened them.

**The job editor sits under two path families** for the same page — under the client when
it was opened from there, under `/jobs` when it was opened from the list across all
clients. That is deliberate: the sidebar keeps marking the place the operator came from,
and the tree says where each closes onto.

### Where "back" is

An editor closes onto **its parent in the route tree** — `useBackPath()`, which reads the
chain of matches (`lib/backPath.ts` holds the rule as a pure function). Nesting a route is
what decides it: `edit` sits below `/clients/:clientId`, so the client editor closes onto
the client's page, whichever surface opened it and also after a reload. Nothing travels in
`location.state`.

The query string is the part that is passed along. A page that opens a form one level
below itself navigates with its own query (`navigate({ pathname, search })`), and
`useBackPath()` hands it back on the way out — that is how the client page's open tab and a
list's search are still there on return, and why they survive a reload of the editor. A
surface that opens a form which is *not* its child (the client list opening the client
editor) passes nothing, since its query would mean nothing on the page the form closes onto.
A page whose query is its own leaves with `useBackPath({ keepSearch: false })`.

### The sidebar

An area of the tree that carries `handle: { nav }` is a sidebar entry; `navEntries` in
`routes.tsx` reads them off in order. `AppLayout` adds what only the running application
knows — the counts and the dot for unseen failures, by `id` — and marks the entry whose
area the innermost match belongs to (`useMatches()`). No list of the routes below an entry
exists: a route added under `/clients` is marked as *Clients* by being there.

### The document title

The browser tab names what is open and the area it belongs to, most specific first, so a
narrow tab cuts the application's name and not the subject: `web01 · Clients · PBCM`,
`Edit · web01 · Clients · PBCM`. It is read off the handles along the open route
(`lib/pageTitle.ts`): the area's `nav.label`, a `subject` (`client`, `repository`, `job`)
that `AppLayout` resolves from the lists the shell holds anyway, and the `title` of a form.
A subject that has no name yet falls back to the route's `title`, or is left out. **A new
route gets its title in the tree** — no page sets `document.title`.

The webhook editor is called *Webhook*, not by the webhook's name: the shell does not read
the webhook list, and does not start to for a title.

### Not found

Every route below `/clients/:clientId` gets its client from `ClientBoundary`, the layout
route at that path: a spinner while the cached list is pending, the client as outlet
context once it is there (`useRouteClient()`), and a thrown `NotFoundError('client')` once
the list has answered without this id — a stale bookmark must not render an editor over
`undefined`. `RepositoryBoundary` does the same for repositories; `EditJobRoute`, the
restore routes and `WebhookEditorRoute` throw for their own subject.

`RouteError`, the `errorElement` of each area, turns the error into the not-found card. It
replaces the page only, so the shell stays and the URL stays where it was; the router
drops it on the next navigation. Any other error thrown while rendering is shown there as
what it is.

The error is thrown in render, not in a `loader`: the lists live in the query cache and
are kept current by the socket, so a client that is deleted while its page is open is
noticed, which a loader — run once per navigation — would not.

---

## 🔐 Authentication

The session is a cookie the browser manages, and `AuthProvider`
(`src/features/auth/AuthProvider.tsx`) holds only the answer to "is someone logged in".

- **No token in the app.** The JWT lives in `pbcm_session`, an `HttpOnly` cookie no script
  can read; the browser attaches it to every request *and* to the dashboard WebSocket
  handshake on its own. A second cookie, `pbcm_auth`, carries no secret and exists so the
  UI can render the right route without asking the server first.
- **Context** (`AuthContext.ts`, JSX-free so Fast Refresh survives): `isAuthenticated`,
  `username`, `login()`, `logout()`. `login` takes no argument — by the time it is called
  the server has already set the cookies. `username` comes from `GET /api/v1/me`, because
  the page can no longer read it out of the JWT.
- **Local login**: `POST /api/login` with `credentials: 'same-origin'` → server sets both
  cookies → `login()`. `Login.tsx` is the one page using `publicApi` rather than `api`,
  so a wrong password does not get turned into a logout.
- **OIDC**: redirect to the provider → `/api/auth/callback` → the server sets the same two
  cookies and redirects to `/`. The token used to ride back as `/login?token=<JWT>`; a
  query parameter lands in browser history and server logs, which is the reason it moved
  into the cookie.
- **The flag can go stale** — the cookie may outlive an accepted token. It corrects itself
  on the first call, since `lib/apiFetch.ts` turns any `401` into `logout()` centrally and
  the router re-renders onto the login form.

---

### Server data and client state

Two kinds of state, kept apart:

- **Server data lives in the TanStack Query cache.** Everything the server holds -- clients,
  jobs, runs, repositories, snapshots, webhooks, scheduler status -- is read through a hook
  in `src/queries/`, never fetched by a component or a store. `lib/queryClient.ts` holds
  the one `QueryClient`, `lib/queryKeys.ts` every key.
- **Client state lives in Zustand.** That is `useUIStore` and nothing else: whether the
  sidebar is collapsed. `stores/` holds no server data and makes no request.

**The defaults** (`lib/queryClient.ts`) follow from "the frontend does not poll":
no refetch on window focus, none on the browser's `online` event, no retry. An entry
counts as current for 30 seconds, so moving between pages does not ask again. Three
kinds of entry deviate:

| Entry | `staleTime` | Why |
|---|---|---|
| Client list, jobs, latest runs, seen state, scheduler status | `Infinity` | The socket writes every change into them. |
| History pages | `0` | Read again each time they are opened; a `JOB_UPDATE` marks them stale, since a page the server cut cannot be patched in place. |
| Tokens, directory listings | `0` | Nothing pushes into them; read again each time they are opened. |
| A client's tunnel configuration | `gcTime: 0` | Seeds a form, so it is dropped when the form closes. |

**The keys are hierarchical.** `invalidateQueries({ queryKey: queryKeys.clients.all })`
reaches a client's jobs, history and directory listings, because a key matches whatever
it is a prefix of. `queryKeys.test.ts` holds the prefix relations the code relies on.

**What a hook returns.** `isPending` is true until the entry has answered once -- also with
an error. It is what `ClientBoundary`, `RepositoryBoundary` and `EditJobRoute` wait on: an
empty list before that says nothing about whether the thing exists.

**Actions are mutations.** Starting and deleting a job exist once, as `useTriggerJob` and
`useDeleteJob` in `queries/jobs.ts`; the client page and the job list both call them.
Updating and deleting a client change the list at once and put it back if the server
refuses. **Saving a form is a mutation too** -- `useSaveJob`, `useSaveWebhook`,
`useAddRepository` / `useUpdateRepository`, `useCreateTunnel` / `useUpdateTunnel` /
`useDeleteTunnel` -- and the mutation, not the editor, invalidates or rewrites the entries
the save changed. No editor calls `api` to save.

A request made *from* a form that stores nothing is a plain function beside them, not a
cache entry: `testWebhook`, `testTunnelCredentials`, `testStoredTunnel`, `probeCertificate`,
`generateEncryptionKey`. Its answer is shown where it was asked and is gone with the page.

**The settings form is the exception.** `pages/Settings.tsx` loads its values once into a
draft and is deliberately not a cache entry: the invalidation after a reconnect would
read them again and overwrite what is typed and not yet saved.

**The rules a socket message applies to an entry are pure functions** in
`lib/cacheUpdates.ts` -- replace one client's jobs, merge a run into the latest-per-job
list, raise the unseen-failure count. They take what is cached and what arrived and
return what is cached now, which is why they are tested without a socket or a component.

### Job result toasts

`hooks/useJobResultToasts.ts`, mounted once in `AppLayout`, turns finished runs from `jobUpdate`
into toasts on whatever page is open. A **failure** is always reported and stays until
dismissed. A **success** or an **abort** only for a job started from this browser
(`markJobRunAsked` at "Run now"): with many clients, every scheduled run would otherwise raise
one. A run is reported once (an agent re-sends finished runs after a reconnect), and not at
all if it ended before the page was loaded.

### The history page asks for one page (`features/history`)

The History page is the one list the server filters and pages. `GET /api/v1/history` takes
`limit`, `offset`, `status` and `clientId` and answers with `{ items, total }`; the page holds
the rows on screen and no more.

- **The view is the URL.** `lib/historyView.ts` reads `page`, `pageSize`, `status` and
  `clientId` out of the query string and writes them back, so a reload and a shared link land
  on the same rows. A value that does not parse falls back to the default instead of reaching
  the server. All four are written through one setter: the router's `setSearchParams` does not
  queue, so a filter and the page it resets, written by two setters, would be the second alone.
- **A filter shows its first page.** Changing "Failures only" or the client resets `page`.
- **The page before stays up** while the next one loads (`placeholderData: keepPreviousData`),
  so paging does not flash the loading state between two full lists.
- **A page past the end** -- from a link, or because the cleanup removed what was on it --
  moves to the last page that holds a row.
- **`BaseHistoryList` takes `paging`** for this: `mode: 'server'`, the page and the total. The
  embedded lists leave it out and page in the browser, as they hold their whole list.

### The last run of a job (`features/jobs/lib/lastRun.ts`)

Both job lists — the one across all clients and the one on the client page — have a
"Last Run" column (start and duration) and a "Last Status" column beside it, each sortable. Both read `GET /api/v1/history/latest`
through `useLatestPerJob()`, the cache entry "Last Activity" shows and `JOB_UPDATE` keeps
current. `lastRunByJob` keys it by client *and* job, since two clients may hold the same job
id. The badge is `statusBadgeVariant` from `features/history/lib/statusBadge.ts`, the same
mapping the history uses.

### An empty job list (`features/jobs/lib/jobListEmpty.ts`)

`GET /api/v1/jobs` holds a client's jobs only while its agent is connected, so the list
across all clients says "No jobs configured yet" only when every client answered. With no
client online it says that, and leaves out "New Job" -- a job is saved on an agent. With
some offline it names how many could not be asked.

### An offline client (`features/clients/components/ClientOverview.tsx`)

The client page keeps its three tabs while the client is away; what each shows depends on
where its data lives:

- **Jobs** live on the agent. The tab says so instead of "No jobs configured yet", and the
  card shows `–`, not `0`.
- **Snapshots** come from the repositories and are listed as always. Restore is disabled:
  the form browses the client's file system for the target.
- **History** is read from the server's own table — `useStoredClientHistory`, the paged
  `GET /api/v1/history?clientId=…` — because `GET /clients/:id/history` asks the agent.
  Online, the tab shows the agent's list, which `JOB_UPDATE` patches in place.

The tab lists every run, restores included; `clientTab(clientId, 'history')` in
`lib/paths.ts` is the link the notice of a started restore uses.

### Job history rows (`features/history/components/BaseHistoryList.tsx`)

Every history list — "Recent Activity" of a client, the History page, "Last Activity" under
Jobs — renders through `BaseHistoryList`, so the following holds in all of them:

- **What a row says unopened.** Below the name: the event kind and, for a successful backup,
  the size of its snapshot; at the right the start and how long the run took, as one
  statement (`features/history/lib/runSummary.ts`). A run still going has no duration. The run id is in the expanded row, above the output —
  it is looked up, not scanned.
- **The client's name is a link** to its page (`components/EntityLink`), wherever the list
  shows one. A run outlives its client; one whose client is gone reads *Unknown Client* and
  links nowhere.
- **Reading the snapshot.** After a successful backup the agent reads back its snapshot,
  and the run stays `running` meanwhile. The `jobUpdate` for that step carries
  `phase: "snapshot"`, and the status badge reads *reading snapshot* instead of *running*.
  The final update sends `phase: null` explicitly: the cache merges updates with a spread,
  and a phase left out would stay. `useJobResultToasts` needs nothing for this — it reacts
  to final statuses only.
- **Snapshot details.** The expanded row of a successful backup appends the snapshot to the
  log, below the CLI's own output (`features/history/lib/runSnapshotLog.ts`): a line
  `Reading Snapshot <snapshot>`, then one line per archive with its size and, if encrypted
  or signed, the crypt mode — `docker.pxar.didx 1.99MiB (encrypted)`. The manifest is left
  out. The details are part of the history row, so nothing is loaded on expand. A run of an
  older agent has no snapshot and shows its log alone.
- **No details.** A successful backup whose snapshot could not be read gets a warning
  badge *no snapshot details* next to its status, and the reason in the expanded row. It
  does not count towards the dot on "History", which stays for failed runs.

Sizes go through `formatBytes` in `utils.ts` (binary units, as the PBS shows them).

### Talking to the server (`lib/api.ts`)

Every request goes through `api`, and every response is parsed against a Zod schema from
`@pbcm/shared` before a component or the cache sees it:

```ts
const clients = await api.get('/api/v1/clients', ClientListSchema);
await api.put(`/api/v1/clients/${id}`, { displayName }, undefined, { fallback: 'Failed to update client' });
```

- **`api.get(path, schema)`**, **`api.post(path, body?, schema?)`**, **`api.put(…)`**,
  **`api.delete(path)`**. A call without a schema expects no body and resolves to `void`.
- **A refused request throws `ApiError`**, carrying the server's own `error` text and the
  HTTP `status`. `fallback` is what it says when the body has no text. A caller that
  treats a status as an ordinary state branches on it -- `ClientTunnelCard` reads a 404 as
  "no tunnel yet".
- **An answer that does not match its schema throws `ApiError` too**
  (`Unexpected response from GET …`); the Zod issues go to the console.
- **A 401 is not an `ApiError`**: `apiFetch` underneath logs out and throws
  `SessionExpiredError`.
- **`publicApi`** is the same client over plain `fetch`, for the three unauthenticated
  endpoints (`/api/login`, `/api/auth/logout`, `/api/auth/config`), where a 401 is a
  refusal like any other.

**There is no `.json()` outside `lib/api.ts` and no `as` on response data.** The schemas
live in `shared/src/responses.ts`, one per shape, and describe what the server *sends* --
for a row read out of SQLite that is `null`, not a missing key. They are deliberately
looser than the schemas that guard input: `BackupJobViewSchema` checks a job's shape, not
the editor's rules, so a job saved by an older agent still shows.

A new endpoint needs its schema there first. Adding a field to a response without adding
it to the schema is harmless but useless: Zod strips what a schema does not name.

### Two realtime channels, and why

Every message is first read by `features/app/lib/dashboardMessages.ts`, which parses it
against `DashboardMessageSchema` from `@pbcm/shared`; one that does not match is dropped
and reported once per type. `WebSocketProvider` then dispatches in a `switch` over
`message.type` that ends in `assertNever` -- a message type added to the schema without a
case there fails `npm run typecheck -w server/frontend`.

Updates from `/ws/dashboard` reach the app on two paths, and the split is deliberate.

**Into the query cache** go `CLIENTS_UPDATE`, `TUNNEL_UPDATE`, `JOBS_UPDATE`,
`JOB_UPDATE`, `JOB_NEXT_RUN_UPDATE`, `SCHEDULER_STATUS_UPDATE` and `HISTORY_SEEN`. These are
*state*: a handful of messages describing something the whole application reads. The
handler writes them with `setQueryData` and an updater function, which changes an entry
only if it has been read -- a `JOB_UPDATE` before the first fetch does not create half a
list. `CLIENTS_UPDATE` is the one that sets its entry outright: it carries the whole list.

`WEBHOOKS_UPDATE` carries no payload and **invalidates** instead: a page that shows the
webhooks reads them again now, any other finds them stale when it opens. A `JOB_UPDATE`
that reports a successful run does the same to every repository's snapshots.

**After a reconnect the whole cache is invalidated once**, in `socket.onopen`. What the
server pushed while the socket was down is lost, and only `CLIENTS_UPDATE` is sent again
on connect. Everything on screen is read again; the rest is read when it is next shown.

`JOBS_UPDATE` is there because the server's job cache is tied to the agent connection --
`GET /api/v1/jobs` returns nothing for an offline client. Without the broadcast, a
dashboard that was already open kept the list it fetched on mount, and the sidebar's job
count stayed at whatever it was when the page loaded.

**Through `lib/realtimeEvents.ts`** go `logUpdate` and `jobUpdate`. Log lines are a
*stream*: they arrive many times a second for exactly one visible component, and holding
them in the cache would re-render every subscriber on every chunk. `jobUpdate` is both --
the cache takes the run as the new state of its row, and the event is for whoever reacts
to the moment itself, which today is `useJobResultToasts`.

The emitter carries a typed event map, its payload types taken from `@pbcm/shared` — the
same contracts the WebSocket messages are validated against, so the channel cannot drift
from the socket that feeds it. One payload is converted on the way in: `JOB_UPDATE` carries
the agent's `StatusUpdatePayload`, and `historyUpdateFrom` turns it into the history row
the lists hold (`jobConfigId` for `jobId`, `null` for what a running job has not reported). `subscribe(type, handler)` returns the unsubscribe
function, which a `useEffect` can return directly.

Underneath sits **`mitt`** (~200 bytes), not a hand-written registry. The first version of
this module was one: a `Map<string, Set<…>>` that needed a cast, because a
`{ [K in keyof Events]?: Set<Handler<K>> }` cannot be written to through a generic key.
mitt is generic over the event map and has no such gap, so the cast is gone. Two things
stay in this module because mitt deliberately omits them — the unsubscribe function, and
wrapping each handler so one that throws cannot stop the ones behind it. The event map is
a `type` and not an `interface` for a compiler reason: mitt constrains it to
`Record<EventType, unknown>`, and an interface satisfies no index signature it does not
declare.

This was `window.dispatchEvent(new CustomEvent('pbcm:log_update', …))` until the ARC-2
cleanup. The decoupling was right; the transport was not — the payload type was *asserted*
at each listener rather than guaranteed, the events were invisible to the React DevTools,
and every subscriber needed an `as EventListener` cast to compile.

---

Generic UI components (Buttons, Inputs, Cards, etc.) are primarily sourced from the external library **`@stefgo/react-ui-components`**. Components within `src/components/` in this project are reserved for domain-specific or complex composite views.

### UI Library Integration

The library ships a preset that carries both the design tokens and its own `content` glob.
Tailwind merges `darkMode` and `safelist` from a preset but **not** `content` — a `content`
in the project config replaces the preset's entirely, so the library's glob has to be spread
back in by hand:

```javascript
presets: [preset],
content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    ...preset.content,
    ...localUiContent,
],
```

Without `...preset.content`, every class only the library uses — `w-64` for the sidebar, its
grid and positioning utilities — is missing from the output and the layout collapses.

`localUiContent` is the `VITE_USE_LOCAL_UI` path, which builds against a sibling checkout of
the library instead of the installed package. It swaps **three** things that have to move
together: the bundler's module resolution, this content glob, and the **preset** itself. The
preset was the one that used to stay behind — it carries the theme, so a local build ran new
components on the published theme, and the mismatch surfaced as a colour that was in neither
source tree.

### Data Views

Most data-driven lists utilize a common base to provide consistent loading, error, and empty states. We use a **Base Component Pattern** (e.g., `BaseJobList`, `BaseRepositorySnapshotList`) to share logic across different views.

- **`DataMultiView`**: The standard container that allows switching between `DataTable` and `DataCard` layouts.
  A list passes it **one `columns` definition** for both views, never `tableDef` next to
  `listColumns`: two descriptions of the same column drift, and `BaseJobList` asked "is this
  job's client online" in twelve renderers for six columns.
    - The heading is also the list label; `list: { label }` renames it, `label: null` drops it.
    - `table: false` / `list: false` leaves a column out of one view. **A sort's `colIndex`
      counts the table's columns**, so it skips the ones with `table: false`.
    - `render(item, view)` serves both views; `view` is for the cell that has to differ.
    - `components/listColumns.tsx` holds what every list shares: `listGroups()`, the two
      blocks of a list row, and `actionsColumn(render)`, the last column of every list.
- **`DataTable`**: A generic, column-based tabular view for structured data.
- **`DataList`**: A simpler, row-based list view.
- **`PaginationControls`**: Integrated pagination logic for larger datasets.
- **`LoadingIndicator`** and **`components/QueryError`**: what a page shows while its data is
  on the way, and when it could not be read -- what failed, and the server's own words for
  why. No page builds its own.

### Actions & Buttons

- **`ActionButton`**: Reusable button for common actions (Run, Edit, Delete) with built-in color variants and tooltips.
- **`ActionMenu`**: "Kebab" menu (Three dots) for context-sensitive actions.
- **`DataAction`**: Wrapper to group multiple actions for a specific data item.

### Confirmations

Every question before an action, and every notice after a failed one, goes through
`useConfirm()` from the library. `ConfirmProvider` wraps the routes in `App.tsx` and renders
the one dialog that answers; no component keeps a pending request, a busy flag or a
`ConfirmDialog` of its own, and nothing calls `window.alert` or `window.confirm`.

- `confirm(options)` resolves `true` or `false`. An action that is quick to hand off —
  leaving an editor, distributing a fingerprint — runs after the `await`.
- An action whose outcome is worth waiting for — deleting a client, a job, a repository, a
  user, removing the tunnel — goes in `onConfirm`. The dialog stays open and busy until it
  settles; a rejection keeps it open with the error inside it, next to the button that retries.
- `alert(describeFailure(title, error))` from `utils.ts` reports a failure of an action that
  was not asked about first, such as running a job or the cleanups in Settings.

**The texts live in a `confirmations.ts` per feature** (`clients`, `jobs`, `repositories`,
`users`, `webhooks`), one `describeX(...)` per action, returning the complete options including
`variant`. The discard question every editor asks is the one cross-feature entry, in
`components/confirmations.ts`, with each editor's own consequence; `useUnsavedChangesGuard`
is the only caller. A component decides *that* it asks, never *what* the question says or
whether it is `danger`.

### Forms and Save Actions

#### One hook for every editor: `useEntityForm`

An editor's state is three things, and `hooks/useEntityForm.ts` holds them: the **draft**
(what is typed), the **baseline** (what it was when the form opened or was last saved), and
**how the save went**. A component keeps nothing else about what it saves in `useState`.

```tsx
const form = useEntityForm({
    schema: WebhookInputSchema,     // the schema the backend parses the request with
    initial: () => draftFrom(webhook),
    toInput: inputFrom,             // draft → request: text to numbers, lines to a record
    fieldOf: webhookFieldOf,        // issue path → draft field (timeoutMs → timeoutSeconds)
    rules: webhookRules,            // what only the form knows
});

<Input value={form.draft.url} onChange={(e) => form.set('url', e.target.value)} error={form.errors.url} />
<Button type="submit" disabled={!form.canSave} isLoading={form.isSaving}>Save</Button>

await form.submit((input) => saveWebhook({ id, input }));
```

- **The draft is checked against the backend's schema**, from `shared`, on every render. What
  the server would refuse is said at the field before anything is sent, in the schema's own
  words. A schema an editor needs lives in `shared`, not in the controller that parses with it
  -- `ClientUpdateSchema`, `RepositoryInputSchema`, `TunnelCreateSchema`, `TunnelUpdateSchema`
  moved there for this.
- **The draft is as typed; the schema describes the request.** A timeout is text in seconds
  in the field and milliseconds on the wire. `toInput` builds the request, `fieldOf` says
  where an issue on the request is shown. `toInput` throws `DraftFieldError(field, message)`
  when it cannot build one at all (a header line without a colon).
- **`rules` are for what a schema cannot say**: a secret that is required when creating and
  optional when editing, a schedule that needs a start, and a required field in words instead
  of "too small". A rule wins over the schema's message for the same field.
- **A disabled save button has a reason on screen.** `canSave` is "changed, valid, not being
  saved". `errors` is empty until the form is dirty -- an untouched form has a disabled button
  because there is nothing to save -- and from the first change every field that is wrong says
  so. What belongs to no field is `formError`, shown in the footer beside `saveError`.
- **`saved` holds only while the draft equals the baseline**, so no `onChange` has to reset
  it. `submit` makes the stored draft the new baseline; `rebase` is for a draft that differs
  once stored (the repository's secret field goes back to empty).
- **`significant`** narrows what counts as a change when part of the draft is sent nowhere:
  an address under an unticked box, a key mode switched without a key.

Everything the hook computes is a pure function in `lib/entityForm.ts`, and each form's
`toInput`, `rules` and `fieldOf` are pure functions in its feature's `lib/` (`clientForm.ts`,
`tunnelForm.ts`, `jobForm.ts`, `repositoryForm.ts`, `webhookForm.ts`) -- that is where they
are tested, since the tests run without a DOM.

**UI state is not the draft.** An open file browser, a half-typed archive, the result of a
connection test, a "copied" tick: none of it is saved, so none of it makes the form dirty,
and it stays in the component that shows it. The job editor's archive and exclusion panels
hold their own entry until it is confirmed; only then does it enter the draft.

A field is one of the library's controls with its `error` prop. Where there is no control to
hang the message on -- the job's archive list, its repository card -- the list is wrapped in
a `FormField` without a label, which renders the message and wires `aria-describedby`.

`pages/Settings.tsx` and the add-client wizard are not on the hook.

**One screen, one save, one resource.** A screen that writes to a second API resource has
stopped being a form and has to be re-cut — it must not grow a second save button inside the
same `<form>`.

Two shapes are allowed:

- **One submit that covers everything.** The handler issues both requests and reports one
  result. Right when the parts are not independently useful.
- **Two separate `Card`s, each with its own action.** Right when they are — a client's name and
  its SSH credentials are edited on different occasions and fail for different reasons.

What is never allowed is the middle ground: a nested section with its own save button sitting
*above* the form's primary button. The primary button then silently ignores half the fields,
and <kbd>Enter</kbd> in any nested input submits the outer form rather than the section the
cursor is in. `ClientEditor` carried exactly this defect from the moment the SSH tunnel section
was hung into its existing `<form>`. The fix went one step further than one `Card` per
endpoint: the tunnel is now its own surface (`ClientTunnelEditor`), so there is no shared form
left to get this wrong.

Three rules follow from the same reasoning:

- **A "test" button must test what is on screen.** If it validates stored state instead, it
  reports success for a configuration the operator has just replaced. Check which state the
  endpoint reads — `POST /v1/tunnel/test` takes every parameter from the request, while
  `POST /v1/clients/:id/tunnel/test` reads the *key* from the database and takes host, port
  and user from the request. That split is what lets the card test edited values without the
  write-only key ever leaving the backend; it is not a licence to send one endpoint's body to
  the other.
- **The way out belongs to whoever holds the form.** `ClientEditor`'s exit used to hang off
  `ClientIdentityCard` because that card happened to be first. With a second card below it,
  working the page top to bottom ended with no way out in reach. Closing asks about the form,
  so it sits with `useEntityForm` and `useUnsavedChangesGuard` -- in `ClientEditor` for the
  identity card, in `ClientTunnelCard` itself, whose form only exists once the stored
  configuration has arrived.
- **A new mode is a review of its siblings.** Adding a variant such as `SshKeyMode`'s `keep`
  changes what the *neighbouring* components receive — `keep` leaves `privateKey` empty, which
  is why `SshHostSetupSnippet` renders a command with a hole in it. When a mode is added, walk
  every consumer of that state under the new value.

---

## 🧩 Feature Details

### ManagedClients (`features/clients`)

This is the "Controller" for the client overview. It connects the UI (`ClientList`) with the logic (`queries/clients.ts`, API calls).

- **Functionality**:
    - Displays list of clients.
    - Deletes clients, reconnects outbound ones.
    - Navigates to the three editor routes: `/clients/new` from the one **+ Add** button (the connection mode is the wizard's first step), `/clients/:id/edit` and `/clients/:id/tunnel` from the row actions. It holds no editor state of its own — it used to swap four surfaces through the same `div`, which meant the URL described none of them.

### Client Editor (`ClientEditor.tsx`)

A page at `/clients/:clientId/edit`, and a container rather than a form: it selects the live
client from the cache by id (`useClient`) and renders the card for the one resource it owns.

- **`ClientIdentityCard`** — header (`StatusDot`, id, last seen), connection mode `Badge`,
  agent version, display name, target address, `Save Client`. The form is held by
  `ClientEditor` and checked against `ClientUpdateSchema` from `@pbcm/shared`, the schema
  `PUT /clients/:id` parses with -- it normalises the target address through
  `normaliseTargetAddress`, so a rejected address never has to make the round trip.

The SSH tunnel is **not** in this editor. It is a different resource on different endpoints,
and it is not part of what a client *is* but of how a PBS is reached from it — a question that
comes up long after the client exists. It has its own surface, reached from the client list.

#### `ClientTunnelEditor` / `ClientTunnelCard`

Opened from the client list's row action — **Add Tunnel**, or **Edit  Tunnel** when
`client.tunnelConfigured` — for **every** client, in either connection mode: the tunnel is a
route to the PBS and is optional on both sides of the WebSocket. Setting one up and changing
one are one action, not two: the same form on the same endpoints.

`ClientTunnelEditor` supplies the live client; `ClientTunnelCard` is the work, the close
control included. It is two components: a shell that waits for `GET /tunnel` and shows the
loading and error states, and the form, mounted with the first answer and keyed by the
client -- so a later answer (the cache is read again after a reconnect) never overwrites
what is being typed. The card holds the SSH
credentials and nothing else — stored means *available*, and which runs take the tunnel is set
per job in `JobTunnelSettings` and per restore in `SnapshotRestoreEditor`. Two states in one
card, keyed on what `GET /tunnel` answers: a `404` is not an error but "no credentials yet",
and the card becomes a setup form whose **Test & Set Up** does test and `POST` in one action.
**Remove** deletes them after a confirmation.

A `StatusDot` beside the title, exactly as in `ClientIdentityCard` — whether a connection is up
is answered in one idiom on every client surface, and the tunnel's four states map onto the
dot's four tones; it appears only once there is a tunnel to report on. Forwards and
`lastUsedAt` come from `client.tunnel`, which `TUNNEL_UPDATE` keeps current in the cache; the
`GET /tunnel` call supplies only the stored configuration. `Test Connection` sends the form's
values, `Save Tunnel` writes them, and a fingerprint mismatch surfaces a **Trust this host
key** block (see `docs/tunnel.md`).

Creating and removing a tunnel read the clients again (`useCreateTunnel`, `useDeleteTunnel`):
`tunnelConfigured` is what the row's action label and its tunnel badge read, and it has just
changed. A port that is not a number is refused at the field; it is not sent as 22.

#### Leaving an editor (every editor)

The exit is an `ActionButton` with an `X` in the **card header** — the same place
`AddClientWizard` and `ClientOverview` put theirs. This replaced a `sticky bottom-0` bar; the
header is the one part of a card that stays in reach at every scroll position without
floating over the content. `ClientTunnelCard` renders it in *all* of its states, the load
error and the loading placeholder included — an exit that disappears when a request hangs is
an exit that is missing when it is needed.

**Unsaved work is asked about in one place**, `hooks/useUnsavedChangesGuard.ts`, through the
router's `useBlocker`. Every way out is a navigation, so every way out asks the same question
once: the X, <kbd>Esc</kbd>, an entry in the sidebar, the browser's back button. Before, each
editor carried its own copy of "ask, then navigate" behind the X and Escape, and the sidebar
and the back button discarded without a word.

```tsx
const { close, leave } = useUnsavedChangesGuard(form.isDirty, 'repository');
```

- `close()` navigates to the parent in the route tree (`useBackPath`). While the form is
  dirty the blocker stops it and `describeDiscardChanges` asks through `useConfirm()`.
- `leave()` does the same without the question. It is for the navigation that follows a save:
  the form is only clean on the next render, and the blocker would still see the one before.
- <kbd>Esc</kbd> does what the X does, guarded by `e.defaultPrevented` so a select, an
  autocomplete or an open confirmation keeps Escape for itself. `onEscape` lets a page use
  the key up first — the job editor closes an open panel back into the form.
- A reload or a closed tab is not a navigation the router sees; while the form is dirty the
  browser's own `beforeunload` prompt covers it.

A new job, repository or webhook leaves once it is saved — a form that has produced its
entity would only produce a second one. Editing a client, a tunnel, a repository or a job
stays and says so in the footer; the webhook editor leaves after every save.

`StatusDot` (`components/StatusDot.tsx`) takes a **tone** and a **label** separately,
because the domains name the same state differently — a client is `online`, a tunnel is `up`.
The component knows four visual tones and no vocabulary; the caller brings its own word, which
the dot carries in `aria-label`/`title` so no badge beside it has to repeat it. Every status
dot in the lists (clients, repositories, snapshots, jobs) is one; a hand-built `w-2 h-2
rounded-full` dot has no label for a screen reader and drifts from the others' look.

### Add-Client Wizard (`features/clients/components/add-client/`)

Built on `Wizard` and `Stepper` from `@stefgo/react-ui-components`. The flow forks
after step 1:

```
1 Connection ┬─ inbound  → 2 Client (name, allowed IP/CIDR) → [Create] → token dialog
             └─ outbound → 2 Client (name, address, secret) → [Create]
```

The inbound branch ends *at* step 2: **Create** issues the registration token and
shows it in a `Modal` (`InboundTokenDialog.tsx`), and closing that dialog leaves
the wizard. The token is deliberately not a step — it exists on the server from
the moment it appears, so there is nothing left to go back to, and a step that
issued it on entry issued a second one on every remount.

The wizard covers **one** question: how the server and the agent reach each other. An SSH
tunnel is no part of it — that is the route to the PBS, it stays revisable for the client's
whole life, and it is added afterwards from the client list. Tying it to the wizard tied a
reversible decision to an irreversible one and made it look like a property of the mode.

- `AddClientWizard.tsx` — the framing `Card`, the step lists per branch, and both
  create requests (`POST /v1/tokens` for inbound, `POST /v1/clients/outbound` for
  outbound). It is the `/clients/new` route — a page in the dashboard work area,
  not a modal, like the two editors. Its `onClose` / `onCreated` come from the
  route, which navigates back and refetches the list. The step index is
  **controlled** here: swapping the step array is the branch, and only this
  component knows it happened.
- `useAddClientForm.ts` — all form state, one level above the steps. `Wizard`
  renders the current step alone, so a step holding its own inputs would lose
  them on the way back. Inbound and outbound are separate objects, so switching
  the mode and switching back costs nothing.
- `InboundTokenDialog.tsx` — the issued token, in a modal. The backdrop does not
  dismiss it: the token list stores the token hashed, so this is the only time it
  is shown in full.
- `steps/` — one file per step, all presentational. Both branches are two steps
  long: the connection mode, then either the inbound registration details or the
  outbound agent's address and secret. **Create** ends either one. A failure is
  reported into the last step rather than moving the flow on. The wizard still
  clamps its controlled step index, because going back and picking the other mode
  swaps the array underneath it.

Inbound registration details (display name, allowed IP or CIDR network) are carried
by the **registration token**, since the agent registers unattended — see
`POST /api/v1/tokens` in `api.md`.

### ClientOverview (`features/clients`)

The detail view of a client. It consists of multiple tabs/sections:

1. **Stats**: Tiles for jobs, snapshots, and history (also act as a tab switcher).
2. **Configured**: List of configured backup jobs (`ClientJobList`) and editor.
3. **Snapshots**: List of available snapshots (`RepositorySnapshotList`). A restore can also be started here (`SnapshotRestoreEditor`). This component is also reused in the **Repository Overview** for a global view of all snapshots in a repository.
4. **History**: Execution logs and, for a backup, the snapshot it created (`ClientHistoryList`, see *Job history rows*).

### Job Editor (`ClientJobEditor.tsx` + `job-editor/`)

One section per aspect of a job, all reading from `JobFormContext` rather than props:
repository, archives, exclusions, encryption, tunnel, schedule. The context is small: the
form (`useEntityForm` over a `JobDraft`), the client id, the agent's time zone, and whether a
tunnel is available.

- **The draft is one object**, built by `emptyJobDraft(now)` or `jobDraftFrom(job, now)` in
  `features/clients/lib/jobForm.ts` and turned into the request by `jobInputFrom`. It is
  checked against `BackupJobSchema`; `jobRules` adds what the schema leaves open, since the
  backend parses a job with every key optional: a name, at least one archive, a repository,
  a start for an enabled schedule, a key for enabled encryption.
- **Which panel is open is the page's state** (`JobEditorView` in `JobEditorPage`): the form,
  the client list, the repository list, the archive editor or the exclusion editor. It sits
  there because the page decides what <kbd>Esc</kbd> closes -- an open panel first, the page
  after.
- **A panel's own entry is its own state.** `JobArchiveEditor` and `JobExcludeEditor` keep the
  path, the name or the pattern and the directory the browser stands in, list that directory
  themselves (`useClientFiles`), and write into the draft only on confirm.

- **`JobExcludeList` / `JobExcludeEditor`** — the job's `--exclude` patterns. The CLI reads a
  pattern relative to each archive's root, so a directory picked in the file browser is
  rebased by `excludePatternFromPath` onto the deepest archive containing it
  (`/home/stefan/.cache` in `/home` → `/stefan/.cache`); a path in no archive is refused.
  Patterns can also be typed directly. They apply to every archive of the job.

- **`JobTunnelSettings`** — whether *this job* reaches its repository through the client's SSH
  reverse tunnel. Per job because one client can have a PBS it reaches directly and another it
  only reaches through the detour; the credentials are the client's, the choice is the job's.
  The switch is disabled while `tunnelAvailable` is false — `useJobForm` reads
  `client.tunnelConfigured` through `useClient` for that — so the impossible combination is
  not offered rather than rejected by the backend afterwards. A job already set to use the
  tunnel keeps the switch usable even without a client row in the cache, or the setting could
  be seen but never turned off.
- `jobInputFrom` always sends `tunnel`, including as `false`: omitting it on an update would
  leave the stored route standing, and switching the tunnel off would silently not take.

### Restore Flow

The restore process is complex and distributed across:

1. `useRepositorySnapshots` (`queries/repositories.ts`): Loads available snapshots from the PBS.
2. A route of its own, below the client or below the repository. The URL names the
   snapshot (type, id, time); `SnapshotRestoreRoute` reads it from the same snapshot list
   the page it was opened from shows.
3. `SnapshotRestoreEditor` (in `features/repositories`):
    - Selects Repository -> Snapshot -> Archive (e.g., `root.pxar`).
    - Target path input on the client.
    - **Restore through the SSH reverse tunnel** — the same question `JobTunnelSettings` asks
      of a job, asked here because a restore has no stored config to carry it. It follows the
      *selected* client, not the one the editor was opened for, since the client can still be
      swapped in the form. Shown only when that client has credentials — a client with no
      tunnel has no choice to make, and an inert switch would raise a question the operator
      cannot act on from here — and defaulted to on, because a client that has a tunnel
      usually has it for want of a direct route.
4. `POST /api/v1/clients/:id/restore`: Triggers the restore command on the client. The tunnel
   choice travels in that one request as `tunnel: { required }`; the backend rejects a request
   asking for a route the client has no credentials for.

---

## 🎨 Styling & Theming

- **Tech Stack**: Tailwind CSS v3 with `darkMode: "class"`.
- **UI Library**: `@stefgo/react-ui-components` – all generic components (Card, Input, Select, Button, DataTable, StatCard, etc.) come from this library.
- **Tailwind Preset**: The library ships a `tailwind-preset.js` that defines all design tokens. PBCM's `tailwind.config.js` uses it as a preset and also scans the library's `dist/` for class usage:

```js
presets: [require("@stefgo/react-ui-components/tailwind-preset")],
content: ["./src/**/*.{js,ts,jsx,tsx}", uiLibDist],
```

### Design Tokens

All tokens are CSS custom properties defined in the library (`--ruic-*`) and exposed as Tailwind classes:

| Token class              | Usage                                    |
| :----------------------- | :--------------------------------------- |
| `bg-app-bg`              | Main page background                     |
| `bg-card`                | Card and panel surfaces                  |
| `bg-card-header`         | Card header background                   |
| `text-text-primary`      | Primary text color                       |
| `text-text-muted`        | Secondary / label text                   |
| `border-border`          | Standard border (always with `border`)   |
| `bg-hover`               | Interactive hover backgrounds            |
| `text-primary`           | Brand accent color (Proxmox Orange)      |
| `shadow-premium`         | Elevated card shadow                     |

> **Important**: `border-border` sets the colour, `border` only sets the width — a `border`
> without `border-border` falls back to `currentColor`. There is no `dark:` twin: the
> library redefines `--ruic-border` inside its `.dark` block, so one class is correct in
> both themes.

> **Opacity modifiers**: Only `primary` supports `/` opacity modifiers (e.g. `bg-primary/10`). Other tokens use plain CSS variables and cannot be used with `/`.

### CSS Component Layer (`index.css`)

Project-level reusable classes defined via `@layer components`:

| Class         | Usage                                                      |
| :------------ | :--------------------------------------------------------- |
| `.glass-card` | Frosted glass modal overlay (Login, token modals)          |
| `.field-label`| Label styling for native `<select>` and custom form groups |

### UI Components

All forms use the `Input` and `Select` components from the library, which provide consistent label, hint, error, disabled, and dark mode styling out of the box. Native `<input>` elements are only used for checkboxes.

Modal dialogs (UserDialog, TokenModal) and detail headers (ClientOverview, RepositoryOverview) use the `Card` component for consistent framing.

- **Dark Mode**: `ThemeProvider` toggles the `dark` class on `<html>`. There is **no `dark:`
  variant anywhere in `src/`** — and that is the point: every role is defined once in the
  preset and redefined per theme in its `.dark` block, so `bg-card` resolves correctly in
  both. A `dark:` twin in this codebase is a sign that a palette colour was used where a
  role belongs.
