# Installation & Setup

## Voraussetzungen

- **Node.js**: v22.x oder höher
- **npm**: v10.x oder höher
- **Docker** & **Docker Compose** (optional, für Container-basiertes Setup)

## Projektstruktur

Das Projekt ist als Monorepo organisiert:

- `client`: Der Backup-Client (Node.js/TypeScript)
- `server/backend`: Der API-Server (Fastify)
- `server/frontend`: Das Web-Dashboard (React/Vite)
- `shared`: Gemeinsam genutzte Typen und Utilities

## Installation (Lokal)

1.  **Repository klonen:**

    ```bash
    git clone <repo-url>
    cd proxmox-backup-client-manager
    ```

2.  **Abhängigkeiten installieren:**
    Führe diesen Befehl im Hauptverzeichnis aus, um alle Abhängigkeiten für alle Workspaces zu installieren:

    ```bash
    npm install
    ```

3.  **Shared Library bauen:**
    Bevor Client oder Server starten können, muss die Shared Library gebaut werden:
    ```bash
    npm run build -w shared
    ```

## Starten (Entwicklung)

### Variante A: Lokal (ohne Docker)

Du kannst Client und Server separat starten.

**Server Starten:**
Dies startet das Backend und das Frontend (sofern konfiguriert):

```bash
npm run dev:server
```

_Der Server läuft standardmäßig auf <http://localhost:3000>._

**Client Starten:**

```bash
npm run dev:client
```

### Variante B: Docker Compose

Für eine komplette Entwicklungsumgebung inkl. Isolation:

```bash
docker compose -f compose.dev.yml up -d --build
```

- **Server**: <http://localhost:3000>
- Logs ansehen: `docker compose -f compose.dev.yml logs -f`

## Konfiguration

Das Verhalten von Client und Server kann über Umgebungsvariablen gesteuert werden.

### Logging

| Variable     | Werte                             | Standard      | Beschreibung                                                                                                |
| :----------- | :-------------------------------- | :------------ | :---------------------------------------------------------------------------------------------------------- |
| `LOG_LEVEL`  | `debug`, `info`, `warn`, `error`  | `info`        | Steuert die Ausführlichkeit der Logs.                                                                       |
| `LOG_FORMAT` | `pretty`, `json`                  | _auto_        | `pretty` für einzeilige, farbige Logs (Default in Dev). `json` für strukturierten Output (Default in Prod). |
| `SERVER_URL` | URL (z.B. `wss://localhost:3000`) | _aus config_  | (Nur Client) Überschreibt die Server-URL aus `config.yaml`.                                                 |
| `NODE_ENV`   | `development`, `production`       | `development` | Steuert allgemeines Verhalten wie Logging-Defaults.                                                         |

**Beispiele:**

```bash
# Debug-Level und JSON-Output erzwingen
LOG_LEVEL=debug LOG_FORMAT=json npm run dev -w server/backend
```

### Konfigurationsdateien (`config.yaml`)

Neben den Umgebungsvariablen gibt es Konfigurationsdateien für spezifische Einstellungen.

#### Client Config (`client/config.yaml`)

Diese Datei wird automatisch erstellt oder kann manuell angelegt werden.

| Key          | Beschreibung                                                                |
| :----------- | :-------------------------------------------------------------------------- |
| `serverUrl`  | URL zum Management-Server (z.B. `wss://backup-server:3000/ws`).             |
| `clientId`   | Eindeutige ID des Clients (wird automatisch generiert).                     |
| `executable` | Pfad zur `proxmox-backup-client` Binary (Default: `proxmox-backup-client`). |

#### Server Config (`server/config.yaml`)

Diese Datei enthält erweiterte Einstellungen für den Server, insbesondere für die Authentifizierung.

| Key         | Unter-Key       | Beschreibung                                       |
| :---------- | :-------------- | :------------------------------------------------- |
| `oidc`      | `enabled`       | Aktiviert/Deaktiviert (true/false) OIDC.           |
|             | `issuer`        | OIDC Issuer URL.                                   |
|             | `client_id`     | OIDC Client ID.                                    |
|             | `client_secret` | OIDC Client Secret.                                |
|             | `redirect_uri`  | OIDC Redirect URI.                                 |
| `jwtSecret` | (Root)          | Wird automatisch generiert, falls nicht vorhanden. |
