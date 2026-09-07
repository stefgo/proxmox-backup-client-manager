# 🎨 Frontend Documentation

This documentation describes in detail the architecture, components, and state management of the frontend (`server/frontend`). The application is a **Single Page Application (SPA)** based on React, Vite, TypeScript, and Tailwind CSS.

## 📂 Project Structure

The structure follows a **Feature-First Approach**, where code belonging to a specific domain area is grouped together.

```
src/
├── features/         # Feature modules (Domain Logic)
│   ├── app/          # App-level layout (App.tsx, App.css)
│   ├── auth/         # Authentication & Context
│   ├── clients/      # Client management, lists, detail views, job editor
│   ├── history/      # Execution history views
│   ├── jobs/         # Global job list views
│   ├── repositories/ # PBS Repository management & snapshot browser
│   ├── tokens/       # Registration token management
│   └── users/        # User management
├── pages/            # Main pages (Entry points for routes)
│   ├── Login.tsx
│   └── Settings.tsx
├── stores/           # Global State Management (Zustand)
│   ├── useUIStore.ts               # UI state (sidebar, modals, filters)
│   ├── useClientStore.ts           # Client list & connectivity status
│   ├── useClientDetailStore.ts     # Data unique to a selected client
│   ├── useGlobalJobsStore.ts       # Centralized backup job configurations
│   ├── useRepositoryStore.ts       # PBS repository configurations
│   └── useRepositorySnapshotStore.ts # PBS snapshot management
├── hooks/            # Global Custom Hooks
├── index.css         # Global CSS layers (glass-card, field-label)
└── utils.ts          # General utility functions
```

---

## 🚦 Routing & Navigation

Routing is controlled via `react-router-dom` in `App.tsx`.

| Path                  | Component       | Description                                       |
| :-------------------- | :-------------- | :------------------------------------------------ |
| `/login`              | `Login.tsx`     | Authentication page (Local & OIDC).               |
| `/*`                  | `Dashboard.tsx` | Main application (Protected by `ProtectedRoute`). |
| `/clients`                    | `ManagedClients`      | Client list.                                    |
| `/clients/new`                | `AddClientWizard`     | Adds a client, starting with the connection mode. |
| `/client/:clientId`           | `ClientOverview`      | Detail view of a client.                        |
| `/client/:clientId/edit`      | `ClientEditor`        | Name and target address of a client.            |
| `/client/:clientId/tunnel`    | `ClientTunnelEditor`  | Adds, changes or removes the SSH reverse tunnel. |
| `/repositories`               | `ManagedRepositories` | Repository list.                                |
| `/repository/:repoId`         | `RepositoryOverview`  | Detail view of a repository.                    |

Every client form is a route, not a state flag: the URL says what is on screen, a reload
keeps it there, and the browser's back button works. The three editor routes resolve their
client from `useClientStore` and redirect to `/clients` when the id is unknown — a stale
bookmark must not render an editor over `undefined`.

**Where "back" is** is the caller's business, not the editor's: the surface that opens an
editor navigates with `{ state: { from: location.pathname } }`, and the editor reads
`location.state.from` with `/clients` as the fallback. That is why **Edit Client** returns
to the client list from the list, and to `/client/:clientId` from the detail page, while a
directly opened URL still closes onto something sensible.

All three routes are listed in the `clients` entry's `path` array in `pages`, so the
sidebar stays marked while an editor is open.

---

## 🔐 Authentication

Authentication is managed via the `AuthContext` (`src/features/auth/AuthContext.tsx`).

- **Token Storage**: The JWT token is stored in `localStorage`.
- **Provider**: The `AuthProvider` wraps the app and provides `token`, `login(token)`, and `logout()`.
- **Login Flow**:
    1. **Local**: POST to `/api/login` -> Token is received -> `login(token)`.
    2. **OIDC**: Redirect to provider -> Callback with code -> Backend exchanges code for token -> Token is passed to frontend via URL parameter -> `login(token)`.

---

### Modular State Management

We use **Zustand** split into specialized stores to maintain a clean, reactive state.

- **`useUIStore`**: Manages global UI state like sidebar visibility, active notifications, and global search/filter parameters.
- **`useClientStore`**: Holds the master list of registered clients and their real-time online/offline status.
- **`useClientDetailStore`**: Focuses on the currently selected client, managing its local history, job configurations, and activity logs.
- **`useRepositorySnapshotStore`**: Handles listing and browsing available snapshots from the PBS repositories.
- **`useGlobalJobsStore`**: Provides a unified view and management interface for backup job configurations across all registered clients.

---

Generic UI components (Buttons, Inputs, Cards, etc.) are primarily sourced from the external library **`@stefgo/react-ui-components`**. Components within `src/components/` in this project are reserved for domain-specific or complex composite views.

### UI Library Integration

To ensure all Tailwind utility classes used by the external library are included in the build, the `tailwind.config.js` dynamically resolves the library's distribution path:

```javascript
const uiLibDist = path.join(
    path.dirname(require.resolve("@stefgo/react-ui-components/tailwind-preset")),
    "dist/**/*.{js,mjs}",
);
```

### Data Views (`AbstractDataView` Hierarchy)

Most data-driven lists utilize a common base to provide consistent loading, error, and empty states. We use a **Base Component Pattern** (e.g., `BaseJobList`, `BaseRepositorySnapshotList`) to share logic across different views.

- **`DataMultiView`**: The standard container that allows switching between `DataTable` and `DataCard` layouts.
- **`DataTable`**: A generic, column-based tabular view for structured data.
- **`DataList`**: A simpler, row-based list view.
- **`PaginationControls`**: Integrated pagination logic for larger datasets.

### Actions & Buttons

- **`ActionButton`**: Reusable button for common actions (Run, Edit, Delete) with built-in color variants and tooltips.
- **`ActionMenu`**: "Kebab" menu (Three dots) for context-sensitive actions.
- **`DataAction`**: Wrapper to group multiple actions for a specific data item.

### Forms and Save Actions

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
- **The way out belongs to the container, not to its first child.** `ClientEditor`'s exit
  used to hang off `ClientIdentityCard` because that card happened to be first. With a second
  card below it, working the page top to bottom ended with no way out in reach. Closing is a
  property of the editor, so the editor renders it — see the action bar below. `ClientTunnelEditor`
  does the same, for a card that is even longer.
- **A new mode is a review of its siblings.** Adding a variant such as `SshKeyMode`'s `keep`
  changes what the *neighbouring* components receive — `keep` leaves `privateKey` empty, which
  is why `SshHostSetupSnippet` renders a command with a hole in it. When a mode is added, walk
  every consumer of that state under the new value.

---

## 🧩 Feature Details

### ManagedClients (`features/clients`)

This is the "Controller" for the client overview. It connects the UI (`ClientList`) with the logic (`useClientStore`, API calls).

- **Functionality**:
    - Displays list of clients.
    - Deletes clients, reconnects outbound ones.
    - Navigates to the three editor routes: `/clients/new` from the one **+ Add** button (the connection mode is the wizard's first step), `/client/:id/edit` and `/client/:id/tunnel` from the row actions. It holds no editor state of its own — it used to swap four surfaces through the same `div`, which meant the URL described none of them.

### Client Editor (`ClientEditor.tsx`)

A page at `/client/:clientId/edit`, and a container rather than a form: it selects the live
client from `useClientStore` by id and renders the card for the one resource it owns.

- **`ClientIdentityCard`** — header (`StatusDot`, id, last seen), connection mode `Badge`,
  agent version, display name, target address, `Save Client`. The address is
  validated in the field against `normaliseTargetAddress` from `@pbcm/shared`, the same
  function the backend uses, so a rejected address never has to make the round trip.

The SSH tunnel is **not** in this editor. It is a different resource on different endpoints,
and it is not part of what a client *is* but of how a PBS is reached from it — a question that
comes up long after the client exists. It has its own surface, reached from the client list.

#### `ClientTunnelEditor` / `ClientTunnelCard`

Opened from the client list's row action — **Add Tunnel**, or **Edit  Tunnel** when
`client.tunnelConfigured` — for **every** client, in either connection mode: the tunnel is a
route to the PBS and is optional on both sides of the WebSocket. Setting one up and changing
one are one action, not two: the same form on the same endpoints.

`ClientTunnelEditor` is the frame (client name, the close control, Escape, the discard
dialog); `ClientTunnelCard` is the work. The card holds the SSH
credentials and nothing else — stored means *available*, and which runs take the tunnel is set
per job in `JobTunnelSettings` and per restore in `SnapshotRestoreEditor`. Two states in one
card, keyed on what `GET /tunnel` answers: a `404` is not an error but "no credentials yet",
and the card becomes a setup form whose **Test & Set Up** does test and `POST` in one action.
**Remove** deletes them behind a `ConfirmDialog`.

A `StatusDot` beside the title, exactly as in `ClientIdentityCard` — whether a connection is up
is answered in one idiom on every client surface, and the tunnel's four states map onto the
dot's four tones; it appears only once there is a tunnel to report on. Forwards and
`lastUsedAt` come from `client.tunnel`, which `TUNNEL_UPDATE` keeps current in the store; the
`GET /tunnel` call supplies only the stored configuration. `Test Connection` sends the form's
values, `Save Tunnel` writes them, and a fingerprint mismatch surfaces a **Trust this host
key** block (see `doc/tunnel.md`).

Leaving the editor refetches the clients: `tunnelConfigured` is what the row's action label
and its tunnel badge read, and it has just changed.

#### Leaving an editor (both editors)

The exit is an `ActionButton` with an `X`, and the page hands it to the card through the
card's `action` prop so it lands in the **card header** — the same place `AddClientWizard`
and `ClientOverview` already put theirs. This replaced a `sticky bottom-0` bar that both
editors carried in duplicate; the header is the one part of a card that stays in reach at
every scroll position without floating over the content. `ClientTunnelCard` renders the
action in *all* of its states, the load error and the loading placeholder included — an
exit that disappears when a request hangs is an exit that is missing when it is needed.

<kbd>Esc</kbd> does exactly what the button does, guarded by `e.defaultPrevented` so a
select, an autocomplete or the dialog below keeps Escape for itself.

Each card reports its dirty state upwards through `onDirtyChange`. Clean, the click
navigates straight away; dirty, a `ConfirmDialog` asks first — the same component the
tunnel's **Remove** uses. It replaced a passive warning line, which stopped being enough
once the exit moved into the header: it now sits a few pixels from the fields it would
throw away, and a warning the operator has scrolled past protects nothing at that distance.

Saving does not leave either editor. The caller passes a client that may be a stale
snapshot, which is why the live one is read from the store instead.

`StatusDot` (`components/StatusDot.tsx`) takes a **tone** and a **label** separately, because
the domains name the same state differently — a client is `online`, a tunnel is `up`. The
component knows four visual tones and no vocabulary; the caller brings its own word, which the
dot carries in `aria-label`/`title` so no badge beside it has to repeat it. The dots still
inlined in `ClientList` and `RepositoryList` predate it and are the obvious next callers.

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
3. **Snapshots**: List of available snapshots (`RepositorySnapshotList`). A restore can also be started here (`RepositorySnapshotRestore`). This component is also reused in the **Repository Overview** for a global view of all snapshots in a repository.
4. **History**: Execution logs (`ClientHistoryList`).

### Job Editor (`ClientJobEditor.tsx` + `job-editor/`)

One section per aspect of a job, all reading from `JobFormContext` rather than props:
repository, archives, encryption, tunnel, schedule.

- **`JobTunnelSettings`** — whether *this job* reaches its repository through the client's SSH
  reverse tunnel. Per job because one client can have a PBS it reaches directly and another it
  only reaches through the detour; the credentials are the client's, the choice is the job's.
  The switch is disabled while `tunnelAvailable` is false — `useJobForm` reads
  `client.tunnelConfigured` from `useClientStore` for that — so the impossible combination is
  not offered rather than rejected by the backend afterwards. A job already set to use the
  tunnel keeps the switch usable even without a client row in the store, or the setting could
  be seen but never turned off.
- `useJobForm` always sends `tunnel`, including as `false`: omitting it on an update would
  leave the stored route standing, and switching the tunnel off would silently not take.

### Restore Flow

The restore process is complex and distributed across:

1. `useRepositoryStore`: Loads available snapshots from the PBS.
2. `SnapshotRestoreEditor` (in `features/repositories`):
    - Selects Repository -> Snapshot -> Archive (e.g., `root.pxar`).
    - Target path input on the client.
    - **Restore through the SSH reverse tunnel** — the same question `JobTunnelSettings` asks
      of a job, asked here because a restore has no stored config to carry it. It follows the
      *selected* client, not the one the editor was opened for, since the client can still be
      swapped in the form. Shown only when that client has credentials — a client with no
      tunnel has no choice to make, and an inert switch would raise a question the operator
      cannot act on from here — and defaulted to on, because a client that has a tunnel
      usually has it for want of a direct route.
3. `POST /api/v1/clients/:id/restore`: Triggers the restore command on the client. The tunnel
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
| `bg-card` / `bg-card-dark` | Card and panel surfaces                |
| `bg-card-header`         | Card header background                   |
| `text-text-primary`      | Primary text color                       |
| `text-text-muted`        | Secondary / label text                   |
| `border-border`          | Standard border (always with `border`)   |
| `bg-hover`               | Interactive hover backgrounds            |
| `text-primary`           | Brand accent color (Proxmox Orange)      |
| `shadow-premium`         | Elevated card shadow                     |

> **Important**: Always pair `border` with `border-border dark:border-border-dark`. The bare `border` class does not set a color — it defaults to `currentColor`.

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

- **Dark Mode**: The `dark` class on `<html>` is toggled by `ThemeContext`. All tokens have `dark:` variants.
