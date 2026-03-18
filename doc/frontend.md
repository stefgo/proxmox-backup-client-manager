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
3. **Snapshots**: List of available snapshots (`RepositorySnapshotList`). A restore can also be started here (`RepositorySnapshotRestore`). This component is also reused in the **Repository Overview** for a global view of all snapshots in a repository.
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
