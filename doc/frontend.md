# 🎨 Frontend Documentation

This documentation describes in detail the architecture, components, and state management of the frontend (`server/frontend`). The application is a **Single Page Application (SPA)** based on React, Vite, TypeScript, and Tailwind CSS.

## 📂 Project Structure

The structure follows a **Feature-First Approach**, where code belonging to a specific domain area is grouped together.

```
src/
├── components/       # Atomic, reusable UI components (Buttons, Inputs)
├── features/         # Feature modules (Domain Logic)
│   ├── auth/         # Authentication & Context
│   ├── clients/      # Client management, lists, detail views
│   ├── dashboard/    # Dashboard layout elements (Sidebar, Header)
│   └── repositories/ # PBS Repository management
├── layouts/          # Page layouts (e.g., DashboardLayout)
├── pages/            # Main pages (Entry points for routes)
├── stores/           # Global State Management (Zustand)
├── hooks/            # Global Custom Hooks
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

## 📦 State Management (Zustand)

We use **Zustand** for global state management to avoid "Prop Drilling".

### `useClientStore`

Manages all data related to clients, jobs, and history.

**State:**

- `clients`: List of all clients (incl. online status).
- `selectedClientId`: Currently selected client.
- `history`: Job history of the selected client.
- `configuredJobs`: Backup jobs of the selected client.
- `fileList`: Cached file list for the file browser.
- `isLoading`: Loading indicator for global operations.

**Actions:**

- `fetchClients(token)`: Loads the list of all clients.
- `fetchClientData(id, token)`: Concurrently loads history and jobs for a client.
- `triggerBackupJob(...)`: Manually triggers a backup job.
- `fetchFileList(...)`: Loads file system contents (Lazy Loading).

### `useRepositoryStore`

Manages Proxmox Backup Server (PBS) repositories.

**State:**

- `repositories`: List of configured PBS.
- `snapshots`: List of snapshots of a selected repository.

**Actions:**

- `fetchRepositories(token)`: Loads repositories from the backend.
- `fetchSnapshots(repo, token)`: Loads snapshots from the PBS via backend proxy.

---

## 🧱 UI Component Reference

These components (`src/components/`) are generic and do not contain business logic.

### `Button`

Standard button with variants.

- **Props**:
  - `variant`: `'primary'` (Orange), `'secondary'` (Gray/Dark), `'danger'` (Red), `'ghost'` (Transparent).
  - `size`: `'sm'`, `'md'`, `'lg'`.
  - `isLoading`: Shows a spinner and disables the button.
  - `icon`: ReactNode for icons.

### `Input` & `Select`

Form elements with consistent styling.

- **Props**: `label` (Heading), `error` (Error message, red), `fullWidth` (100% width), `icon` (Input icon on the left).
- **Ref**: Both components forward refs (`forwardRef`) for use with `react-hook-form` or similar.

### `Card`

Container with header and body.

- **Props**: `title` (Left header), `action` (Right header, e.g., buttons).

### `ActionMenu`

"Kebab" menu (Three dots) for context-sensitive actions.

- **Props**: `actions`: Array of objects `{ label, onClick, icon, variant }`.

---

## 🧩 Feature Details

### ManagedClients (`features/clients`)

This is the "Controller" for the client overview. It connects the UI (`ClientList`) with the logic (`useClientStore`, API calls).

- **Functionality**:
  - Displays list of clients.
  - Generates registration tokens (calls `POST /api/v1/tokens`).
  - Displays the token modal.
  - Deletes clients.

### ClientOverview (`features/clients`)

The detail view of a client. It consists of multiple tabs/sections:

1. **Stats**: Tiles for jobs, snapshots, and history (also act as a tab switcher).
2. **Configured**: List of configured backup jobs (`ClientJobList`) and editor.
3. **Snapshots**: List of available snapshots (`RepositorySnapshotList`). A restore can also be started here (`RepositorySnapshotRestore`).
4. **History**: Execution logs (`ClientHistoryList`).

### Restore Flow

The restore process is complex and distributed across:

1. `useRepositoryStore`: Loads available snapshots from the PBS.
2. `RepositorySnapshotRestore` (in `features/repositories`):
   - Selects Repository -> Snapshot -> Archive (e.g., `root.pxar`).
   - Target path input on the client.
3. `POST /api/v1/clients/:id/restore`: Triggers the restore command on the client.

---

## 🎨 Styling & Theming

- **Tech Stack**: Tailwind CSS.
- **Dark Mode**: Supported via `dark:` class. The `dark` class is set on the `<html>` tag (controlled by `ThemeContext`).
- **Primary Color**: `#E54D0D` (Proxmox Orange).
- **Design System**: Flat design, rounded corners (`rounded-lg`, `rounded-xl`), subtle shadows.
