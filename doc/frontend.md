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
| `/client/:clientId`   | `Dashboard.tsx` | Detail view of a client.                          |
| `/repository/:repoId` | `Dashboard.tsx` | Detail view of a repository.                      |

> **Note:** The `Dashboard` internally uses state (`view`) to switch between tabs and detail views without reloading the entire page. URLs are kept in sync.

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
was hung into its existing `<form>`; it now takes the second shape, one `Card` per endpoint.

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
  property of the editor, so the editor renders it — see the action bar below.
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
    - Opens the add-client wizard (one **+ Add** button; the connection mode is the wizard's first step). The wizard replaces the list in the work area — it is not a modal, just like `ClientEditor`.
    - Deletes clients, reconnects outbound ones.

### Client Editor (`ClientEditor.tsx`)

A container, not a form: it selects the live client from `useClientStore` by id and stacks
one card per resource.

- **`ClientIdentityCard`** — header (`StatusDot`, id, last seen), connection mode `Badge`,
  agent version, display name, target address, `Save Client`. The address is
  validated in the field against `normaliseTargetAddress` from `@pbcm/shared`, the same
  function the backend uses, so a rejected address never has to make the round trip.
- **`ClientTunnelCard`** — shown for **every** client, in either connection mode: the tunnel is
  a route to the PBS and is optional on both sides of the WebSocket. It holds the SSH
  credentials and nothing else — stored means *available*, and which backups take the tunnel
  is set per job in `JobTunnelSettings`. Two states in one card, keyed on what `GET /tunnel`
  answers: a `404` is not an error but "no credentials yet", and the card becomes a setup form
  whose **Test & Set Up** does test and `POST` in one action, as the wizard does. **Remove**
  deletes them behind a `ConfirmDialog`.
  A `StatusDot` beside the title, exactly as in the card above — whether a connection is up is
  answered in one idiom on every client surface, and the tunnel's four states map onto the
  dot's four tones; it appears only once there is a tunnel to report on. Forwards and
  `lastUsedAt` come from `client.tunnel`, which `TUNNEL_UPDATE` keeps current in the store; the
  `GET /tunnel` call supplies only the stored configuration. `Test Connection` sends the form's
  values, `Save Tunnel` writes them, and a fingerprint mismatch surfaces a **Trust this host
  key** block (see `doc/tunnel.md`).

- **Action bar** — the editor's own, `sticky bottom-0` as the last child of the stack. As the
  last child its resting place is the end of the editor, so it settles there once the operator
  has scrolled all the way down and floats at the bottom of the viewport for the whole way
  there. The page itself is the scroll container; nothing above it clips a sticky child. It
  holds `Close`, and <kbd>Esc</kbd> does the same. Both cards report their dirty state upwards
  through `onDirtyChange`, so the bar is the one place that can see an unsaved edit in either
  and warn about it — neither card can, and the operator leaving is exactly when it matters.

The bar and <kbd>Esc</kbd> are the *only* exits: neither card carries a close control of its
own any more. That is the point — an exit inside a card is reachable only when that card is on
screen. Closing discards unsaved edits without asking; the warning in the bar is the whole of
the safety net, deliberately, because a confirm dialog exists nowhere else in this frontend.

Saving does not close the editor — both cards behave alike. The caller passes a client that may
be a stale snapshot, which is why the live one is read from the store instead.

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
             └─ outbound → 2 Agent → 3 SSH → [Test & Create]
```

The inbound branch ends *at* step 2: **Create** issues the registration token and
shows it in a `Modal` (`InboundTokenDialog.tsx`), and closing that dialog leaves
the wizard. The token is deliberately not a step — it exists on the server from
the moment it appears, so there is nothing left to go back to, and a step that
issued it on entry issued a second one on every remount.

- `AddClientWizard.tsx` — the framing `Card`, the step lists per branch, and both
  create requests (`POST /v1/tokens` for inbound, `POST /v1/clients/outbound` for
  outbound). It renders inline in the dashboard work area (`ManagedClients`
  swaps it in for `ClientList`); the outbound branch carries an SSH key, a
  connection test and a fingerprint confirmation, which is more than a dialog
  should hold. The step index is **controlled** here: swapping the step array is the
  branch, and only this component knows it happened.
- `useAddClientForm.ts` — all form state, one level above the steps. `Wizard`
  renders the current step alone, so a step holding its own inputs would lose
  them on the way back. Inbound and outbound are separate objects, so switching
  the mode and switching back costs nothing.
    - It also owns the rule that any change to an SSH field discards a completed
      tunnel test: the fields and the fingerprint confirmation now sit two steps
      apart, and without it one could confirm a fingerprint for one host and
      create the client against another.
- `InboundTokenDialog.tsx` — the issued token, in a modal. The backdrop does not
  dismiss it: the token list stores the token hashed, so this is the only time it
  is shown in full.
- `steps/` — one file per step, all presentational. The outbound branch's length
  depends on `useTunnel`, the switch on `StepOutboundAgent` — which decides whether SSH
  credentials are stored, not whether backups use them: with it on,
  `StepOutboundSsh` follows and **Test & Create** runs the tunnel test and the
  create request back to back; with it off there is no SSH step and **Create**
  registers the client directly. A failure of either is reported into the step
  that is currently last, rather than moving the flow on. The wizard clamps its
  controlled step index, because turning the switch off removes the step behind
  the current one.
    - The switch sits on the *Agent* step and not beside the connection mode in
      step 1 on purpose: the mode cannot be revised, the tunnel can, and putting
      the two side by side would suggest otherwise.

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
2. `RepositorySnapshotRestore` (in `features/repositories`):
    - Selects Repository -> Snapshot -> Archive (e.g., `root.pxar`).
    - Target path input on the client.
3. `POST /api/v1/clients/:id/restore`: Triggers the restore command on the client.

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
