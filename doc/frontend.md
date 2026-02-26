# 🎨 Frontend Dokumentation

Diese Dokumentation beschreibt detailliert die Architektur, Komponenten und das State-Management des Frontends (`server/frontend`). Die Anwendung ist eine **Single Page Application (SPA)**, basierend auf React, Vite, TypeScript und Tailwind CSS.

## 📂 Projektstruktur

Die Struktur folgt einem **Feature-First-Ansatz**, bei dem Code, der zu einem bestimmten fachlichen Bereich gehört, zusammen gruppiert wird.

```
src/
├── components/       # Atomare, wiederverwendbare UI-Komponenten (Buttons, Inputs)
├── features/         # Fachliche Module (Domain Logic)
│   ├── auth/         # Authentifizierung & Context
│   ├── clients/      # Client-Verwaltung, Listen, Detailansichten
│   ├── dashboard/    # Layout-Elemente des Dashboards (Sidebar, Header)
│   └── repositories/ # PBS Repository Verwaltung
├── layouts/          # Seiten-Layouts (z.B. DashboardLayout)
├── pages/            # Hauptseiten (Einstiegspunkte für Routen)
├── stores/           # Globales State Management (Zustand)
├── hooks/            # Globale Custom Hooks
└── utils.ts          # Allgemeine Hilfsfunktionen
```

---

## 🚦 Routing & Navigation

Das Routing wird via `react-router-dom` in `App.tsx` gesteuert.

| Pfad                  | Komponente      | Beschreibung                                       |
| :-------------------- | :-------------- | :------------------------------------------------- |
| `/login`              | `Login.tsx`     | Authentifizierungsseite (Local & OIDC).            |
| `/*`                  | `Dashboard.tsx` | Hauptanwendung (Geschützt durch `ProtectedRoute`). |
| `/client/:clientId`   | `Dashboard.tsx` | Detailansicht eines Clients.                       |
| `/repository/:repoId` | `Dashboard.tsx` | Detailansicht eines Repositories.                  |

> **Hinweis:** Das `Dashboard` verwendet intern einen State (`view`), um zwischen Tabs und Detailansichten zu wechseln, ohne die gesamte Seite neu zu laden. URLs werden synchron gehalten.

---

## 🔐 Authentifizierung

Die Authentifizierung wird über den `AuthContext` (`src/features/auth/AuthContext.tsx`) verwaltet.

- **Token Storage**: Das JWT-Token wird im `localStorage` gespeichert.
- **Provider**: Der `AuthProvider` umschließt die App und stellt `token`, `login(token)` und `logout()` bereit.
- **Login Flow**:
  1. **Local**: POST an `/api/login` -> Token wird empfangen -> `login(token)`.
  2. **OIDC**: Redirect zum Provider -> Callback mit Code -> Backend tauscht Code gegen Token -> Token wird via URL-Parameter an Frontend übergeben -> `login(token)`.

---

## 📦 State Management (Zustand)

Wir verwenden **Zustand** für das globale State Management, um "Prop Drilling" zu vermeiden.

### `useClientStore`

Verwaltet alle Daten rund um Clients, Jobs und Historie.

**State:**

- `clients`: Liste aller Clients (inkl. Online-Status).
- `selectedClientId`: Aktuell ausgewählter Client.
- `history`: Job-Historie des ausgewählten Clients.
- `configuredJobs`: Backup-Jobs des ausgewählten Clients.
- `fileList`: Zwischengespeicherte Dateiliste für den Filebrowser.
- `isLoading`: Ladeindikator für globale Operationen.

**Actions:**

- `fetchClients(token)`: Lädt die Liste aller Clients.
- `fetchClientData(id, token)`: Lädt parallel Historie und Jobs für einen Client.
- `triggerBackupJob(...)`: Startet manuell einen Backup-Job.
- `fetchFileList(...)`: Lädt Dateisystem-Inhalte (Lazy Loading).

### `useRepositoryStore`

Verwaltet Proxmox Backup Server (PBS) Repositories.

**State:**

- `repositories`: Liste der konfigurierten PBS.
- `snapshots`: Liste der Snapshots eines ausgewählten Repositories.

**Actions:**

- `fetchRepositories(token)`: Lädt Repositories vom Backend.
- `fetchSnapshots(repo, token)`: Lädt Snapshots via Backend-Proxy vom PBS.

---

## 🧱 UI Komponenten Referenz

Diese Komponenten (`src/components/`) sind generisch und besitzen keine Geschäftslogik.

### `Button`

Standard-Button mit Varianten.

- **Props**:
  - `variant`: `'primary'` (Orange), `'secondary'` (Grau/Dunkel), `'danger'` (Rot), `'ghost'` (Transparent).
  - `size`: `'sm'`, `'md'`, `'lg'`.
  - `isLoading`: Zeigt einen Spinner an und deaktiviert den Button.
  - `icon`: ReactNode für Icons.

### `Input` & `Select`

Formular-Elemente mit einheitlichem Styling.

- **Props**: `label` (Überschrift), `error` (Fehlermeldung, rot), `fullWidth` (100% Breite), `icon` (Input-Icon links).
- **Ref**: Beide Komponenten leiten Refs weiter (`forwardRef`) für die Nutzung mit `react-hook-form` o.ä.

### `Card`

Container mit Header und Body.

- **Props**: `title` (Linker Header), `action` (Rechter Header, z.B. Buttons).

### `ActionMenu`

"Kebab"-Menü (Drei Punkte) für kontextbezogene Aktionen.

- **Props**: `actions`: Array von Objekten `{ label, onClick, icon, variant }`.

---

## 🧩 Feature-Details

### ManagedClients (`features/clients`)

Dies ist der "Controller" für die Client-Übersicht. Er verbindet die UI (`ClientList`) mit der Logik (`useClientStore`, API-Calls).

- **Funktionalität**:
  - Zeigt Liste der Clients.
  - Generiert Registrierungs-Tokens (ruft `POST /api/v1/tokens` auf).
  - Zeigt das Token-Modal an.
  - Löscht Clients.

### ClientOverview (`features/clients`)

Die Detailansicht eines Clients. Sie besteht aus mehreren Tabs/Sektionen:

1. **Stats**: Kacheln für Jobs, Snapshots und Historie (fungieren auch als Tab-Switcher).
2. **Configured**: Liste der konfigurierten Backup-Jobs (`ClientJobList`) und Editor.
3. **Snapshots**: Liste der verfügbaren Snapshots (`RepositorySnapshotList`). Hier kann auch ein Restore gestartet werden (`RepositorySnapshotRestore`).
4. **History**: Ausführungsprotokolle (`ClientHistoryList`).

### Wiederherstellung (Restore Flow)

Der Restore-Prozess ist komplex und verteilt sich auf:

1. `useRepositoryStore`: Lädt verfügbare Snapshots vom PBS.
2. `RepositorySnapshotRestore` (in `features/repositories`):
   - Wählt Repository -> Snapshot -> Archiv (z.B. `root.pxar`).
   - Zielpfad-Eingabe auf dem Client.
3. `POST /api/v1/clients/:id/restore`: Löst den Restore-Befehl am Client aus.

---

## 🎨 Styling & Theming

- **Tech Stack**: Tailwind CSS.
- **Dark Mode**: Unterstützt via `dark:` Klasse. Die Klasse `dark` wird im `<html>`-Tag gesetzt (gesteuert durch `ThemeContext`).
- **Primärfarbe**: `#E54D0D` (Proxmox Orange).
- **Design System**: Flaches Design, abgerundete Ecken (`rounded-lg`, `rounded-xl`), subtile Schatten.
