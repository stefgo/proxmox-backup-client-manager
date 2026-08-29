# Implementierungsplan: SSH-Reverse-Tunnel + Outbound-WebSocket (PBCM)

Status: **Entwurf zur Freigabe** — bitte editieren/kommentieren, Umsetzung erst nach Freigabe.

---

## 1. Ausgangslage

**Heute in PBCM:**
- Client-Agent verbindet sich *immer selbst* zum Server (`Connection.connect()` → `ws://server/ws/agent?token=…`).
  Server-seitig prüft `WebSocketController.handleAgentConnection` Token **und** `allowed_ip` (`clients.allowed_ip`).
- Die Repository-Zugangsdaten liegen serverseitig (`repositories`-Tabelle) und werden als Teil der Job-Config per
  `JOB_SAVE_CONFIG` an den Client gepusht. Der Client persistiert sie in seiner eigenen SQLite und baut daraus in
  `Executor` die `PBS_REPOSITORY`-Env (`user!token@host[:port]:datastore`, Passwort via FD 3, `PBS_FINGERPRINT`).
- Der Client fährt Jobs **autonom** per node-cron, auch wenn der Server offline ist.

**Heute in DIM (was PBCM fehlt):**
- `clients.connection_mode = 'inbound' | 'outbound'` (Migration `06_connection_mode`), plus
  `inbound_registered_ip` / `outbound_target_address`.
- `ClientConnector` (Backend): wählt aktiv den Client an — Registrierung über `ws://client/ws/register`
  (Secret ↔ generierter authToken), danach Session über `ws://client/ws/agent?token=…`, mit Reconnect-Backoff
  `[5s, 10s, 30s, 60s]`.
- `WebSocketController.handleOutboundAgentConnection` — dieselbe AUTH/Ping/Registrierungs-Logik, nur ohne IP-Prüfung.
- Client-seitig: `/ws/register` + `/ws/agent` als **Server**-Endpunkte im eigenen Fastify-Webserver,
  `Connection.handleIncoming(socket)` für die eingehende Session.

## 2. Topologie & Grundsatzentscheidung

Ein vom **PBCM-Server initiierter** `ssh -R` setzt voraus, dass der Server den Client-Host per SSH erreicht —
also genau die Richtung, die DIMs Outbound-Modus abbildet. Daraus ergibt sich ein in sich stimmiges Szenario:

```
            ssh (Server ist SSH-Client)          Client-Host (sshd)
 ┌───────────────┐  ──────────────────────────►  ┌──────────────────────┐
 │  PBCM-Server  │                               │  pbcm-client         │
 │               │  ws  ─────────────────────►   │  :3001 /ws/agent     │  (Outbound-Modus, wie DIM)
 │               │                               │                      │
 │               │  ◄── Reverse-Forward ────────  │ 127.0.0.1:<dyn>      │  ← proxmox-backup-client
 └──────┬────────┘    (-R 127.0.0.1:0:pbs:8007)  └──────────────────────┘
        │ https
        ▼
   ┌──────────┐
   │   PBS    │   (nur vom Server erreichbar)
   └──────────┘
```

Der Client-Host braucht **keinerlei** Route zum PBS und keine ausgehende Verbindung — der Server bringt beides mit.

Der Tunnel wird dabei **nicht dauerhaft** gehalten, sondern vom Client unmittelbar vor einem Lauf über den
WebSocket angefordert und nach dem Lauf wieder freigegeben (Details in §4).

### 2.1 Rahmenbedingung: Verbindungsart ist unveränderlich

Die Verbindungsart wird beim Anlegen des Clients **einmalig festgelegt und ist danach nicht mehr änderbar**. Sie
bestimmt zugleich den Weg zum PBS — beides ist dieselbe Entscheidung, kein Paar unabhängiger Schalter:

| `connection_mode` | WS zwischen Server und Client | Weg des `proxmox-backup-client` zum PBS |
|---|---|---|
| `inbound` | Client wählt den Server an (heutiges Verhalten) | direkt zum PBS |
| `outbound` | Server wählt den Client an (wie DIM) | **immer** über den SSH-Reverse-Tunnel |

Daraus folgen drei Dinge, die den gesamten Rest des Plans prägen:

1. **Es gibt keinen Tunnel-Schalter.** Ob getunnelt wird, ist aus `clients.connection_mode` ableitbar; ein eigenes
   `enabled`-Flag existiert nicht. Damit ist der Zustand „Tunnel aus, aber Jobs zeigen auf Loopback" konstruktiv
   unmöglich.
2. **Anlegen ist atomar.** Ein Outbound-Client ohne funktionierende Tunnel-Konfiguration hat *keinen* Weg zum PBS
   und wäre funktionsunfähig. WS-Registrierung und SSH-Tunneltest laufen deshalb im selben Vorgang, und
   **nichts** wird persistiert, wenn einer von beiden scheitert (siehe §B3).
3. **Kein Moduswechsel, kein Fallback.** Jeder Job eines Outbound-Clients trägt die Tunnelpflicht als Marker
   (§B6) und wird ohne Lease gar nicht erst gestartet — ein ersatzweises Sichern direkt zum PBS gibt es nicht.
   Läuft der PBCM-Server nicht, sichern Outbound-Clients gar nicht.
   Das ist eine Architekturaussage, keine Konfigurationsoption, und gehört so in die Betriebsdoku.
   Umstellen heißt: Client löschen und neu anlegen — inklusive Verlust der an der Client-ID hängenden Historie.

**SSH-Implementierung: `ssh2` (npm) statt System-`ssh`.** Empfohlen, weil:
- kein `openssh-client` im Server-Image nötig (Dockerfile.server bleibt unverändert),
- `client.forwardIn(bindAddr, bindPort)` + `'tcp connection'`-Event → der Reverse-Forward läuft in-process, jede
  Verbindung ist als Event sichtbar (echte Health-/Traffic-Metriken statt Prozess-Polling),
- Fehler (Auth, Forward abgelehnt, Host-Key) kommen als typisierte Events statt als stderr-Text,
- Host-Key-Prüfung über `hostVerifier`-Callback → Pinning in der DB, kein `known_hosts`-Filehandling.
Fallback (falls `ssh2` unerwünscht): `spawn("ssh", ["-N","-T","-o","ExitOnForwardFailure=yes","-o","ServerAliveInterval=15",
"-o","ServerAliveCountMax=3","-o","BatchMode=yes","-R","127.0.0.1:0:pbs:8007", …])` — dann Dockerfile.server um
`openssh-client` erweitern.

---

## 3. Teil A — Outbound-WebSocket (1:1-Port aus DIM)

### A1 `shared/`
- `constants.ts`: `WS_EVENTS` um `REGISTRATION_REQUEST`, `REGISTRATION_SUCCESS`, `REGISTRATION_FAILURE` sowie
  `TUNNEL_ACQUIRE`, `TUNNEL_ACQUIRE_RESULT`, `TUNNEL_RELEASE` (§B4) ergänzen.
- `schemas.ts`: `ClientSchema` um `connectionMode` und `outboundTargetAddress` erweitern;
  `RegistrationRequestSchema { secret, authToken }`; `BackupJobSchema`/`RestoreJobSchema` um das optionale Feld
  `tunnel: { required: boolean }` (§B6); Schemas für die drei Tunnel-Events.
- `types.ts`: `export type ConnectionMode = "inbound" | "outbound";`, `ProtocolMap`-Einträge für die Tunnel-Events.
- Danach zwingend `npm run build -w shared`.

### A2 Backend-DB — neue Migration `04_connection_mode.ts`
Analog DIM-Migration 06 (Tabelle neu anlegen + kopieren, da SQLite):
`connection_mode TEXT NOT NULL DEFAULT 'inbound'`, `inbound_registered_ip` (aus `allowed_ip`/`ip_address`),
`outbound_target_address`. Bestehende Clients werden als `inbound` migriert — kein Verhaltensbruch.
`down()` stellt `allowed_ip`/`ip_address` wieder her.

### A3 `ClientRepository`
Neu: `findOutboundClients()`, `createOutbound(id, hostname, targetAddress, authToken)`,
`updateAuthSuccess(id, version)` ohne IP-Argument für Outbound (Signatur splitten statt überladen),
`findById(id)`.

### A4 `server/backend/src/services/ClientConnector.ts` (neu)
Übernahme aus DIM, angepasst an PBCM-Namen (`@pbcm/shared`, `ProxyService`):
`connectAll()` beim Start, `firstConnect()` (Registrierung + AUTH, DB-Write nur bei Erfolg via `onPersist`),
`connectWithToken()`, `scheduleReconnect()` mit Backoff, `cancelReconnect(id)`, `disconnect(id)`.
Aufruf von `connectAll()` in `server/backend/src/index.ts` nach Migrationen.

### A5 `WebSocketController.handleOutboundAgentConnection(...)`
Port aus DIM: Ping/Pong 30s, AUTH-Timeout 5s, `AuthPayloadSchema`-Validierung, `onPersist(version)`,
`ProxyService.registerClient`, `AUTH_SUCCESS` inkl. `lastSyncTime` (PBCM sendet hier den echten Wert, nicht `null`),
`close` → `unregisterClient` + `broadcastClientUpdate` + `onClose()`. **Keine** IP-Prüfung.
Bestehendes `handleAgentConnection` bleibt unverändert (Inbound).

### A6 `ClientController` + Routen
- `POST /api/v1/clients/outbound` — legt Client **und** Tunnel in einem Vorgang an (siehe §B4):
  `{ hostname?, outboundTargetAddress, registrationSecret, tunnel: { sshHost, sshPort?, sshUser, privateKey,
  passphrase?, hostKeySha256 } }` → Tunneltest, dann `firstConnect`. `hostKeySha256` ist der im Assistenten
  bestätigte Fingerprint (kein bloßes Bestätigungs-Flag): Der Server verifiziert, dass der beim Anlegen tatsächlich
  angetroffene Host-Key damit übereinstimmt, und pinnt erst dann. Kein Portfeld (dynamisch, §B6), kein Passwort
  (nur Key-Auth, §B2), kein Zielrepository — weder als gespeicherter Wert noch als Prüfparameter (§B3).
- `POST /api/v1/clients/:clientId/reconnect` — sofortiger Reconnect-Versuch (nur `connection_mode='outbound'`).
- `DELETE /api/v1/clients/:clientId` — zusätzlich `ClientConnector.cancelReconnect/disconnect`
  **und** `TunnelService.closeClient(clientId)` (Teil B).

### A7 Client-Agent
- `client/src/web/server.ts`: `@fastify/websocket` registrieren; `/ws/register` (nur ohne `authToken` und mit
  gesetztem `registrationSecret`; Secret prüfen → `persistAuthToken` + `deleteRegistrationSecret`) und
  `/ws/agent` (Token-Vergleich → `Connection.handleIncoming(socket)`).
- `client/src/core/Connection.ts`: `handleIncoming(socket)` — dieselbe Message-Routing-Schleife wie beim
  ausgehenden Socket (Handlers), `wsInstance` setzen, AUTH aktiv senden, Heartbeat.
  Refactoring-Hinweis: Message-Handling in eine private `attach(ws)` ziehen, die beide Pfade nutzen.
- `client/src/core/Config.ts`: `registrationSecret`, `enableRegisterPage`, `enableStatusPage`,
  `tunnelAcquireJitterSeconds` (Default 30, §B4), `persistAuthToken()`, `deleteRegistrationSecret()`;
  `serverUrl` wird im Outbound-Modus optional.
- `isWebServerNeeded()`-Logik wie in DIM.

### A8 Frontend
Badge „Inbound/Outbound" im `ClientList`, Button „Jetzt verbinden" für offline Outbound-Clients. Der Anlege-Dialog
selbst wird zusammen mit der Tunnel-Konfiguration gebaut (§B10), weil bei Outbound beides in einem Vorgang
erfasst und geprüft werden muss.

---

## 4. Teil B — SSH-Reverse-Tunnel (On-Demand, vom Client angefordert)

**Leitprinzip:** Der Tunnel steht *nicht* dauerhaft. Er wird unmittelbar vor einem Backup-/Restore-Lauf aufgebaut
und nach dessen Ende wieder abgebaut. Angefordert wird er vom **Client über den bestehenden WebSocket**, aufgebaut
wird er weiterhin ausschließlich vom **Server** (`ssh -R` Richtung Client-Host).

> **Sicherheitsregel Nr. 1 für dieses Design:** Der Client nennt **niemals ein Ziel**. Er nennt ausschließlich die
> `jobId`, für die er den Tunnel braucht. Der Server prüft, dass dieser Job **diesem** Client gehört, schlägt selbst
> das zugehörige Repository nach und leitet Zielhost und Zielport daraus ab. Weder Host, Port noch Bind-Adresse
> dürfen je aus der Nachricht des Clients stammen. Andernfalls wird aus dem Feature ein Pivot: Ein kompromittierter
> Client ließe sich vom Server beliebige interne Ziele forwarden.
>
> Die Zuordnungsprüfung (Job gehört zum anfragenden Client) ist dabei **nicht optional** — ohne sie könnte ein
> Client über eine fremde `jobId` einen Forward zu einem Repository öffnen, für das er keine Berechtigung hat.

### B1 Server-Config (`server/config.yaml`, `AppConfig.ts`)
```yaml
tunnel:
  enabled: true                      # Not-Aus, siehe unten (nicht pro Client — §2.1)
  remoteBindHost: 127.0.0.1          # niemals 0.0.0.0 (bräuchte GatewayPorts)
  connectTimeoutMs: 10000            # SSH-Handshake + forwardIn
  keepaliveIntervalMs: 15000
  idleGraceMs: 60000                 # Nachlaufzeit nach der letzten Freigabe
  maxLeaseMs: 86400000               # Not-Aus gegen hängende Leases (24 h)
  acquireTimeoutMs: 20000            # muss > connectTimeoutMs sein, deckt auch Wartezeit ab
  maxConcurrentTunnels: 20           # serverweite Obergrenze, darüber Warteschlange
  retryDelaysMs: [2000, 5000, 10000] # Wiederaufbau, solange Leases bestehen
  minRequestIntervalMs: 3000         # Rate-Limit pro Client
  keySecret: <auto-generiert>        # eigener Schlüssel für die Secret-Verschlüsselung (§B8)
```

Zwei Klarstellungen dazu:

- **`enabled: false` ist ein Not-Aus, kein Betriebsmodus.** Es verhindert jeden Tunnelaufbau; alle `acquire`-Anfragen
  werden mit `granted: false` beantwortet, und damit sichern **sämtliche** Outbound-Clients nicht mehr (§2.1). Der
  Schalter existiert für den Störfall, nicht für den Alltag — die UI muss das entsprechend deutlich machen.
- **Kein `hostKeyPolicy`:** Da der Fingerprint beim Anlegen zwingend bestätigt und gepinnt wird (§B3), gibt es kein
  „pin-on-first-use" zur Laufzeit mehr. Die Prüfung ist immer strikt.

### B2 Migration `05_client_tunnels.ts`
```sql
CREATE TABLE client_tunnels (
  client_id        TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  ssh_host         TEXT NOT NULL,           -- Client-Host (sshd)
  ssh_port         INTEGER NOT NULL DEFAULT 22,
  ssh_user         TEXT NOT NULL,
  private_key      TEXT NOT NULL,           -- verschlüsselt at rest, Key-Auth only
  passphrase       TEXT,                    -- verschlüsselt at rest
  host_key_sha256  TEXT NOT NULL,           -- Pinning, beim Anlegen bestätigt
  remote_bind_host TEXT NOT NULL DEFAULT '127.0.0.1',
  last_error       TEXT,
  last_used_at     DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
`down()` ist hier trivial (`DROP TABLE client_tunnels`), da die Tabelle neu ist und keine Altdaten übernimmt.

Ein `enabled`-Flag gibt es bewusst **nicht** (§2.1): Eine Zeile in `client_tunnels` existiert genau dann, wenn der
zugehörige Client `connection_mode = 'outbound'` hat — sie ist für Outbound-Clients Pflicht und für Inbound-Clients
unzulässig. Erzwungen wird das im `ClientController` (§B3), nicht per SQL-Constraint, da SQLite keine
tabellenübergreifenden CHECKs kann.

Was bewusst **nicht** in der Tabelle steht:

- **Kein `remote_bind_port`:** Der Port wird bei jedem Forward dynamisch vom sshd des Client-Hosts vergeben (§B6)
  und existiert nur für die Lebensdauer der Lease.
- **Kein Tunnelziel:** Das Ziel ergibt sich pro Job aus dessen Repository (§B5) — ein Client kann Jobs gegen
  mehrere Repositories haben. Auch kein Ziel „für Tests", denn der Tunneltest kommt ohne PBS aus (§B3).
- **Kein `status`:** Der Zustand wechselt im On-Demand-Betrieb ständig und wird nur in-memory geführt. Persistiert
  werden ausschließlich `last_used_at` und `last_error`. Nach einem Server-Neustart existiert damit weder Tunnel
  noch Lease noch ein widersprüchlicher Statuswert.
- **Keine Passwort-Authentifizierung:** Nur Key-Auth. Das spart ein Secret at rest, einen UI-Zweig und eine
  Fallunterscheidung im `TunnelService`.

Die aktiven Leases werden ebenfalls nur in-memory gehalten — ein laufender Client fordert nach einem
Server-Neustart bei Bedarf neu an.

### B3 Anlegen eines Outbound-Clients (atomarer Vorgang)

`ClientController.createOutbound` führt beide Prüfungen aus, bevor irgendetwas in die DB geschrieben wird:

1. `TunnelService.testConnection(params)` — SSH-Connect, Host-Key erfassen, `forwardIn(remote_bind_host, 0)` öffnen,
   alles wieder schließen. Schlägt das fehl → 400 mit konkreter Ursache (Auth, Host-Key,
   `administratively prohibited` bei fehlendem `AllowTcpForwarding`).
   **Kein PBS-Connect im Test:** Ob der Server einen PBS erreicht, ist keine Eigenschaft dieses Clients, sondern des
   Repositories — und wird bereits vom bestehenden Repository-Statuscheck beantwortet
   (`RepositoryController`, `/api2/json/admin/datastore/<ds>/status`). Der Test braucht deshalb kein Zielrepository
   als Parameter, was beim Anlegen ohnehin unpassend wäre: Der neue Client hat noch keine Jobs.
   Der ermittelte **Host-Key-Fingerprint wird zurückgegeben und muss im Assistenten aktiv bestätigt werden**, bevor
   es weitergeht — sonst wäre „pin-on-first-use" blindes Vertrauen genau in dem Moment, in dem man es einmal
   bewusst richtig machen kann.
2. `ClientConnector.firstConnect(...)` — Registrierung + AUTH wie in Teil A.
3. Erst wenn **beides** erfolgreich war: `clients`-Zeile (`connection_mode='outbound'`) und `client_tunnels`-Zeile
   in **einer** SQLite-Transaktion schreiben, Host-Key aus Schritt 1 als Pin übernehmen.

Scheitert Schritt 2 nach erfolgreichem Schritt 1, bleibt die DB unberührt — das entspricht exakt der bestehenden
`firstConnect`-Semantik aus DIM („nichts schreiben bei Fehlschlag") und verhindert halb angelegte, funktionsunfähige
Clients.

### B4 Protokoll: Tunnel-Anforderung über den WebSocket

Neue Events in `shared/src/constants.ts` + `ProtocolMap` + Schemas:

| Event | Richtung | Payload |
|---|---|---|
| `TUNNEL_ACQUIRE` | Client → Server | `{ requestId, jobId, runId }` — `jobId` bestimmt über die Serverauflösung das Ziel, `runId` dient nur dem Audit. **Kein** Host/Port |
| `TUNNEL_ACQUIRE_RESULT` | Server → Client | `{ requestId, granted: true, leaseId, bindHost, bindPort }` \| `{ requestId, granted: false, error }` |
| `TUNNEL_RELEASE` | Client → Server | `{ leaseId }` — fire-and-forget |

Die **`leaseId` vergibt der Server**, nicht der Client. Ein doppelt gesendeter oder falscher `runId` kann damit den
refcount nicht durcheinanderbringen, und ein `RELEASE` wirkt nur auf eine Lease, die der Server selbst ausgegeben
hat.

Ablauf eines Laufs:

```
Client (Executor)                        Server (TunnelService)
      │  (Jitter 0–n s)
      │  TUNNEL_ACQUIRE {jobId,runId} ───────►  Job → Client-Zuordnung prüfen
      │                                         Repository des Jobs auflösen = Ziel
      │                                         SSH-Verbindung offen? ──nein──► connect
      │                                         Forward für dieses Ziel offen? ──nein──► forwardIn(host,0)
      │                                         Lease anlegen (leaseId, refcount++)
      │  ◄──── TUNNEL_ACQUIRE_RESULT {leaseId, bindPort}
      │  TCP-Preflight auf 127.0.0.1:bindPort
      │  spawn proxmox-backup-client …
      │  … Job läuft …
      │  TUNNEL_RELEASE {leaseId} ───────────►  refcount--
      │                                         0 ► idleGraceMs ► Forwards + SSH schließen
```

- **Client-seitig** braucht `Connection` einen Request/Response-Helper in Gegenrichtung (das Pendant zu
  `ProxyService.sendRequest`): `Connection.request(type, payload)` mit `requestId`-Korrelation, Pending-Map und
  eigenem Timeout. Dieses **muss größer sein als das serverseitige `acquireTimeoutMs`** (z. B. 25 s bei 20 s), sonst
  bricht der Client eine Anfrage ab, die gerade noch legitim in der Warteschlange steht (§B5) — und der Server
  vergibt danach eine Lease, die niemand mehr freigibt.
- **`Executor`**: `acquireTunnel(jobId, runId)` vor dem Spawn liefert `{ leaseId, bindHost, bindPort }`,
  `releaseTunnel(leaseId)` in einem `finally` — ausnahmslos, auch bei Abbruch, Fehler und Timeout. Eine vergessene
  Freigabe hält den Tunnel sonst bis `maxLeaseMs` offen.
- Kein WS oder Server nicht erreichbar → Lauf endet sofort mit `status=failed`,
  `stderr="SSH-Tunnel nicht verfügbar: keine Serververbindung"`. Der `proxmox-backup-client` wird gar nicht erst
  gestartet.
- **Jitter vor dem `acquire`:** Neue Client-Config `tunnelAcquireJitterSeconds` (Default 30, `0` schaltet ab). Der
  Client wartet vor der Anforderung eine zufällige Spanne aus `[0, n]`. Grund: Alle Clients teilen typischerweise
  denselben Zeitplan („täglich 02:00") und würden sonst in derselben Sekunde anfragen. Der Jitter verteilt
  lediglich — begrenzt wird serverseitig über `maxConcurrentTunnels` (§B5).

### B5 `TunnelService` (`server/backend/src/services/TunnelService.ts`)
- Kein `startAll()` beim Boot. Öffentliche API: `acquire(clientId, jobId)` → `{ leaseId, bindHost, bindPort }`,
  `release(clientId, leaseId)`, `closeClient(clientId)` (alle Leases verwerfen und Verbindung schließen — beim
  Löschen eines Clients, §A6), `getStatus(clientId)`, `testConnection(sshParams)` (prüft ausschließlich SSH +
  `forwardIn`, ohne DB-Zugriff und ohne PBS-Beteiligung — für §B3 und den „Verbindung testen"-Button),
  `shutdown()`.
- Lease-Verwaltung:
  `Map<clientId, { ssh, connectPromise, forwards: Map<targetKey, {port, leases: Set<leaseId>}>, idleTimer, retryState }>`.
  Eine SSH-Verbindung pro Client, darin **ein Forward je Zielrepository** — damit funktionieren auch Clients mit
  Jobs gegen mehrere PBS-Instanzen. `targetKey` ist `host:port` des aufgelösten Repositories.
  `idleGraceMs` verhindert Auf-/Abbau-Churn zwischen direkt aufeinanderfolgenden Jobs, `maxLeaseMs` ist der Not-Aus
  gegen hängengebliebene Leases.
- **Parallele `acquire`-Aufrufe teilen sich den Aufbau.** Starten zwei Jobs desselben Clients gleichzeitig, hängt
  sich der zweite Aufrufer an das laufende `connectPromise` bzw. an den laufenden `forwardIn` an, statt eine zweite
  SSH-Verbindung zu öffnen. Ohne diese Klammer entstehen doppelte Verbindungen und doppelte Forwards — der
  wahrscheinlichste Implementierungsfehler an dieser Stelle.
- **Obergrenze und Warteschlange:** `maxConcurrentTunnels` begrenzt die gleichzeitig offenen SSH-Verbindungen
  serverweit. Ist die Grenze erreicht, wird das `acquire` **eingereiht** statt abgelehnt; es scheitert erst, wenn
  `acquireTimeoutMs` abläuft. Ein weiteres `acquire` für einen bereits offenen Tunnel geht immer sofort durch —
  die Grenze gilt nur für Neuaufbauten.
- Aufbau: `ssh2.Client.connect({host, port, username, privateKey, passphrase, keepaliveInterval, readyTimeout,
  hostVerifier})` → `ready` → `forwardIn(remote_bind_host, 0)` → der zurückgelieferte Port ist der maßgebliche
  Wert und geht in jedes `TUNNEL_ACQUIRE_RESULT` → `'tcp connection'`-Event:
  `net.connect(targetPort, targetHost)` gegen den PBS, Streams beidseitig verbinden (`pipe` hin und zurück,
  Fehler/`end` auf beiden Seiten aufräumen — Socket-Leaks sind hier der klassische Bug).
- Abbau: Ein Forward wird geschlossen, sobald seine letzte Lease weg ist; die SSH-Verbindung, sobald der letzte
  Forward weg ist (jeweils nach `idleGraceMs`). Zusätzlich bei Lease-Timeout, bei WS-Disconnect des Clients
  (`ProxyService.unregisterClient` → alle Leases dieses Clients verwerfen), beim Löschen des Clients und beim
  Server-Shutdown (SIGTERM-Hook).
- Verbindungsabbruch **während** bestehender Leases → Wiederaufbau mit `retryDelaysMs`. Achtung: Der neue Tunnel
  bekommt einen **anderen** Port. Bereits laufende `proxmox-backup-client`-Prozesse zeigen dann ins Leere und
  scheitern ohnehin; die zugehörigen Leases werden deshalb verworfen statt stillschweigend auf den neuen Port
  umgebogen. Der Client erfährt davon über den fehlgeschlagenen Lauf, nicht über ein eigenes Event.
- Rate-Limit: `minRequestIntervalMs` pro Client; zu häufige Anforderungen werden mit `granted: false` abgelehnt
  und geloggt (Anomalie-Signal).
- `forwardIn`-Ablehnung (`administratively prohibited`) sauber melden → Hinweis auf `AllowTcpForwarding`.
- Status wird **in-memory** geführt und per `ProxyService.broadcastToDashboard({ type: "TUNNEL_UPDATE", payload })`
  verteilt; in die DB gehen nur `last_used_at` und `last_error`.

### B6 Dynamischer Port + Laufzeit-Substitution (Kernstück)

Der Bind-Port wird **nicht** konfiguriert, sondern bei jedem Tunnelaufbau vom sshd des Client-Hosts vergeben:
`forwardIn(remote_bind_host, 0)` liefert den tatsächlich belegten Port zurück (das Äquivalent zu `ssh -R 0:pbs:8007`).
Damit gibt es keine Portverwaltung, keine Kollision mit einem lokal laufenden PBS und keinen Portwert, der
irgendwo veralten könnte.

Weil der Port erst zur Lease-Zeit feststeht, wird die Repository-URL **nicht** mehr beim Push umgeschrieben.
Stattdessen:

- Die gepushte Job-Config enthält die **echte PBS-URL** — wahrheitsgemäß, lesbar, unabhängig vom Tunnelzustand.
- Dazu kommt der Marker `tunnel: { required: true }` (neues optionales Feld in `BackupJobSchema`/`RestoreJobSchema`),
  gesetzt für jeden Client mit `connection_mode = 'outbound'`. Er ist das einzige, was der Server beisteuern muss.
- Der `Executor` ersetzt beim Bauen von `PBS_REPOSITORY` **nur Host und Port** durch `bindHost:bindPort` aus dem
  `TUNNEL_ACQUIRE_RESULT` — also durch den Forward, den der Server für genau das Repository *dieses* Jobs geöffnet
  hat. `fingerprint`, `username`, `tokenname`, `secret` und `datastore` bleiben unverändert.
  Ergebnis: `user!token@127.0.0.1:<port>:datastore`.

Konsequenzen:

- **Fail-closed:** Greift die Substitution nicht, steht die echte PBS-URL im Kommando — und die ist für einen
  Outbound-Client nicht erreichbar. Der Lauf scheitert, statt versehentlich an der Absicherung vorbeizuarbeiten.
- **Kein Repush, keine Invalidierung.** `applyTunnelRewrite`, `repushAllJobs` und der gesamte Invalidierungspfad
  entfallen ersatzlos. Der einzige serverseitige Eingriff beim Push ist das Setzen des Markers.
- **Autonome Cron-Läufe** funktionieren unverändert: Sie fordern die Lease selbst an und bekommen den Port darüber.
- **Restore-Pfad** ist automatisch mit abgedeckt, weil die Substitution im `Executor` sitzt und nicht im Push —
  der bisherige Sonderfall `RUN_RESTORE` verschwindet damit.
- **Client-seitige Gegenprüfung:** Der Agent kennt seinen eigenen Modus. Trifft ein Job mit `tunnel.required = true`
  auf einem Inbound-Client ein (oder ein Job ohne Marker auf einem Outbound-Client), wird er mit klarer Meldung
  abgelehnt statt ausgeführt — fängt z. B. eine von Host zu Host kopierte Client-Config.
- **Voraussetzung:** `PBS_REPOSITORY` hat damit immer die dreiteilige Form `host:port:datastore`. Die eingesetzte
  `proxmox-backup-client`-Version muss die Port-Angabe in der Repository-Spec unterstützen — als Mindestversion
  dokumentieren.
- TLS: `proxmox-backup-client` prüft bei gesetztem `PBS_FINGERPRINT` gegen den Fingerprint; der Hostname-Mismatch
  (`127.0.0.1` vs. PBS-Zertifikat) ist damit unkritisch. **→ vor Umsetzung praktisch verifizieren** (siehe §9).

### B7 Sichtbarkeit
- Laufzeitzustand **nur in-memory** (`idle|connecting|up|error`, offene Forwards je Zielrepository, aktive
  Lease-Anzahl, Wartende in der Warteschlange) → `TUNNEL_UPDATE`-Broadcast ans Dashboard. Persistiert werden
  ausschließlich `last_used_at` und `last_error` (§B2).
- Ein separates Health-Probe-Event entfällt: Der TCP-Preflight des `Executor` nach `TUNNEL_ACQUIRE_RESULT` ist der
  Funktionsnachweis und läuft genau dann, wenn er gebraucht wird.
- Log-Linie je Lease (`clientId`, `jobId`, `runId`, `leaseId`, Zielrepository, Dauer, übertragene Verbindungen) —
  die Basis dafür, dass eine Tunnel-Anforderung außerhalb eines geplanten Fensters überhaupt auffallen kann.

### B8 Secrets & SSH-Härtung
- **Nur Key-Auth**, keine SSH-Passwörter (§B2).
- Private Key und Passphrase verschlüsselt at rest: AES-256-GCM mit einem aus `tunnel.keySecret` abgeleiteten
  Schlüssel (`crypto.hkdfSync`). Bewusst **nicht** aus `jwtSecret` abgeleitet: Ein JWT-Rotieren würde sonst alle
  SSH-Keys unlesbar machen. `keySecret` wird beim ersten Start automatisch erzeugt und in die `config.yaml`
  geschrieben — wie `jwtSecret` heute auch. Nie im Klartext in der DB, nie in API-Responses (Write-only-Feld,
  Anzeige nur als „gesetzt/nicht gesetzt").
- Empfohlener Setup-Weg für den Client-Host (in `doc/` dokumentieren):
  ```
  # ~/.ssh/authorized_keys auf dem Client-Host
  restrict,port-forwarding,permitlisten="127.0.0.1:*" ssh-ed25519 AAAA... pbcm-server
  ```
  `restrict` schaltet Shell/PTY/Agent/X11 ab, `permitlisten` begrenzt den Reverse-Forward auf Loopback. Der
  Port-Wildcard `*` ist nötig, weil der Port dynamisch vergeben wird (§B6) — laut `man sshd` matcht `*` jeden Port.
  Die Beschränkung auf `127.0.0.1` bleibt davon unberührt und ist der wesentliche Teil: Der Key kann keinen von
  außen erreichbaren Listener öffnen.
  Auf dem Client-Host muss `AllowTcpForwarding yes` (Default) gesetzt sein. `GatewayPorts` wird **nicht** benötigt.
- Optional Komfort: Server erzeugt auf Wunsch ein Ed25519-Keypair und zeigt den Public Key zum Kopieren an.
- Host-Key-Pinning: Der Fingerprint wird beim Anlegen ermittelt, dem Bediener **zur Bestätigung angezeigt** (§B3)
  und dann gepinnt; danach strikte Prüfung. Mismatch → `error` mit deutlicher Meldung, keine Lease.
- **PBS-seitig** (Empfehlung, unabhängig vom Tunnel): pro Client ein eigener API-Token mit `Datastore.Backup` auf
  eigenem Namespace und **ohne** `Datastore.Modify`/`Prune` — sonst kann ein übernommener Client genau die Backups
  löschen, gegen die er absichern soll. Begrenzt den Schaden stärker als jedes Tunnel-Timing.

### B9 API
- `GET /api/v1/clients/:clientId/tunnel` (ohne Secrets, inkl. Status + aktiver Leases)
- `PUT /api/v1/clients/:clientId/tunnel` — ändert **nur** die SSH-Credentials. Kein Portfeld, kein Tunnelziel,
  kein An-/Abschalten, kein Moduswechsel.
- `POST /api/v1/tunnel/test` — Test mit **übergebenen** SSH-Parametern, ohne DB-Zugriff. Für den Anlege-Assistenten,
  in dem die Zugangsdaten noch nirgends gespeichert sind. Antwort enthält den Host-Key-Fingerprint zur Bestätigung.
- `POST /api/v1/clients/:clientId/tunnel/test` — derselbe Test gegen die **hinterlegten** Zugangsdaten, ohne dass
  der Schlüssel dafür das Backend verlassen muss. Für den „Verbindung testen"-Button im `ClientEditor`.
- Dashboard-WS: `TUNNEL_UPDATE`-Broadcast.
- **Entfällt bewusst:** `POST /clients/:id/tunnel` (Anlegen läuft ausschließlich über `POST /clients/outbound`),
  `DELETE /clients/:id/tunnel` (nur zusammen mit dem Client löschbar) und `tunnel/restart` (kein Dauerzustand).

### B10 Frontend
- **Anlege-Assistent** (`ManagedClients`): Schritt 1 Verbindungsart wählen (Inbound/Outbound, danach unveränderlich —
  mit entsprechendem Hinweis), Schritt 2 bei Outbound zusätzlich SSH-Host/Port/User und privater Schlüssel.
  „Verbindung testen" ist **Pflicht** vor dem Absenden, weil dabei der Host-Key-Fingerprint angezeigt und aktiv
  bestätigt werden muss (§B3). Kein Feld für den lokalen Port, keine Passwort-Option, keine Repository-Auswahl.
- `ClientEditor`: Verbindungsart wird nur **angezeigt**, nicht editiert. Der Abschnitt „SSH-Reverse-Tunnel" erscheint
  ausschließlich bei Outbound-Clients und erlaubt dort nur die Pflege der SSH-Credentials. „Verbindung testen"
  arbeitet parameterlos gegen die hinterlegten SSH-Daten. Die aktuell offenen Forwards (Zielrepository → Port) werden als Statusinformation angezeigt, solange Leases
  bestehen.
- Status-Badge in `ClientList`/`ClientOverview`: `idle` (bereit) / `up (n aktiv)` / `error` + `last_error` +
  „zuletzt genutzt", gespeist aus `TUNNEL_UPDATE` über einen neuen Slice in `useClientStore`.
- Hinweisbanner im Job-Editor, dass das Repository für diesen Client über den On-Demand-Tunnel läuft.

---

## 5. Betroffene Dateien (Übersicht)

| Bereich | Neu | Geändert |
|---|---|---|
| shared | – | `constants.ts`, `schemas.ts`, `types.ts` |
| Backend DB | `migrations/04_connection_mode.ts`, `05_client_tunnels.ts` | `core/Database.ts` (Migrationsliste) |
| Backend Services | `ClientConnector.ts`, `TunnelService.ts`, `services/crypto.ts` | `ProxyService.ts` |
| Backend Repos | `ClientTunnelRepository.ts` | `ClientRepository.ts` |
| Backend Controller | `TunnelController.ts` | `WebSocketController.ts`, `ClientController.ts`, `JobController.ts`, `routes/api.ts`, `config/AppConfig.ts`, `index.ts` |
| Client | – | `web/server.ts`, `core/Connection.ts`, `core/Config.ts`, `features/Executor.ts`, `features/Handlers.ts` |
| Frontend | `components/ClientTunnelSettings.tsx` | `ClientEditor.tsx`, `ClientList.tsx`, `ManagedClients.tsx`, `useClientStore.ts` |
| Docs | `doc/tunnel.md` (inkl. Testprotokoll §8) | `doc/api.md`, `doc/backend.md`, `doc/client.md`, `doc/install.md`, `CLAUDE.md` |

## 6. Umsetzungsreihenfolge

1. **Phase 1 – Shared + Migrationen** (klein, isoliert): WS-Events und Schemas (A1), Migration 04 (A2) und 05 (B2),
   `ClientRepository`/`ClientTunnelRepository`. Anschließend `npm run build -w shared`.
2. **Phase 2 – Outbound-WS-Transport** (A1–A5, A7): `ClientConnector`, `handleOutboundAgentConnection`,
   Client-seitige `/ws/register` + `/ws/agent`. Noch **ohne** das öffentliche Anlege-Endpoint — in dieser Phase
   werden Testclients per SQL/Skript angelegt.
3. **Phase 3 – TunnelService, Aufbau/Abbau** (B1, B5) inkl. beider `tunnel/test`-Endpunkte — per REST testbar,
   ohne Client und ohne Frontend.
4. **Phase 4 – Atomares Anlegen** (A6, B3): `POST /clients/outbound` in seiner endgültigen Form — erst hier
   greifen Tunneltest und `firstConnect` ineinander. Setzt Phase 2 **und** 3 voraus, deshalb an dieser Stelle.
5. **Phase 5 – Lease-Protokoll** (B4): WS-Events, `Connection.request()` im Client, `acquire`/`release` im
   `Executor` inkl. `finally`-Freigabe.
6. **Phase 6 – Laufzeit-Substitution** (B6): Marker beim Push, Host/Port-Ersetzung im `Executor`, client-seitige
   Modus-Gegenprüfung — ab hier läuft ein echtes Backup durch den Tunnel.
7. **Phase 7 – Frontend** (A8, B10): Anlege-Assistent und Status-Badges.
8. **Phase 8 – Sichtbarkeit/Logging (B7), Härtung (B8), Doku inkl. Testprotokoll (§8).**

Nach Phase 2 und nach Phase 6 jeweils ein sinnvoller Commit-/Review-Punkt. Die Reihenfolge folgt der
Rahmenbedingung aus §2.1: Weil ein Outbound-Client ohne Tunnel ungültig ist, darf das Anlege-Endpoint erst
existieren, wenn der `TunnelService` es absichern kann.

## 7. Neue Abhängigkeit

`ssh2` + `@types/ssh2` in `server/backend`. Keine Änderung an `Dockerfile.server` nötig
(nur beim Fallback „System-ssh" käme `openssh-client` dazu).

## 8. Manuelles Testprotokoll (`doc/tunnel.md`)

Das Projekt hat kein Testframework — diese Checkliste ist das einzige Sicherungsnetz und gehört mit der Umsetzung
geschrieben. Die ersten vier Punkte decken Fehler ab, die sonst **still** bleiben:

1. **Lease-Leak nach Client-Absturz:** Client während eines Laufs hart killen (`kill -9`) → WS-Disconnect muss alle
   Leases dieses Clients verwerfen, Tunnel schließt nach `idleGraceMs`.
2. **Portwechsel nach Reconnect:** SSH-Verbindung während eines Laufs unterbrechen (Firewall-Regel) → Lease wird
   verworfen, Lauf scheitert mit klarer Meldung, kein Zugriff auf einen toten Port.
3. **Atomares Anlegen mit Fehlschlag:** Anlegen mit gültigen SSH-Daten, aber falschem Registrierungs-Secret → keine
   Zeile in `clients` und keine in `client_tunnels`; Fehlermeldung nennt das verbrauchte Secret (Risiko 11).
4. **Parallele Jobs:** Zwei Jobs desselben Clients gleichzeitig starten → genau **eine** SSH-Verbindung, ein Forward
   je Zielrepository, beide Läufe erfolgreich, Tunnel schließt erst nach dem zweiten Release.
5. **Mehrere Repositories:** Zwei Jobs eines Clients gegen zwei verschiedene PBS-Instanzen → zwei Forwards, zwei
   verschiedene Ports, beide Backups landen im richtigen Datastore.
6. **Fremde `jobId`:** Manipuliertes `TUNNEL_ACQUIRE` mit der `jobId` eines anderen Clients → Ablehnung, Logeintrag.
7. **Obergrenze:** `maxConcurrentTunnels` testweise auf 1 setzen, zwei Clients gleichzeitig starten → der zweite
   wartet und läuft danach durch, statt zu scheitern.
8. **Inbound unberührt:** Ein bestehender Inbound-Client sichert nach der Migration unverändert direkt zum PBS.

## 9. Offene Punkte / Risiken

1. **Mindestversion `proxmox-backup-client`:** Durch den dynamischen Port hat `PBS_REPOSITORY` immer die Form
   `user!token@127.0.0.1:<port>:datastore`. Die Port-Angabe in der Repository-Spec wird als gegeben vorausgesetzt
   (so entschieden); die konkrete Mindestversion ist zu ermitteln und in `doc/install.md` zu dokumentieren.
2. **Fingerprint vs. Hostname:** Annahme ist, dass `PBS_FINGERPRINT` die Hostname-Prüfung ersetzt. Einmal manuell
   gegen einen echten PBS testen — davon hängt ab, ob die Substitution auf `127.0.0.1` überhaupt trägt.
3. **Outbound-Clients ohne Server sichern nicht** (§2.1): Ohne WS-Verbindung keine Lease, ohne Lease kein Tunnel,
   und einen Fallback auf Direktverbindung gibt es konstruktiv nicht. Geplante Backups schlagen sofort und mit
   klarer Meldung fehl. Der Server muss zu den Backup-Zeiten laufen — das gehört prominent in die Betriebsdoku,
   nicht in eine Fußnote.
4. **`allowed_ip`-Semantik:** Migration 04 benennt um; alle Lesestellen (`findByToken`, `handleAgentConnection`,
   `networkUtils`) müssen mitgezogen werden, sonst brechen bestehende Inbound-Clients.
5. **Secret-Verschlüsselung hängt an `tunnel.keySecret`** (§B8): Geht der Wert verloren oder wird er ersetzt, sind
   die hinterlegten SSH-Keys nicht mehr entschlüsselbar. Durch die Entkopplung von `jwtSecret` ist das kein
   Nebeneffekt einer JWT-Rotation mehr, bleibt aber ein Backup-relevanter Wert der `config.yaml`.
   → dokumentieren, Fehlermeldung „Tunnel-Credentials nicht entschlüsselbar, bitte neu hinterlegen".
6. **Portwechsel bei Tunnel-Wiederaufbau:** Jeder Neuaufbau vergibt einen neuen Port. Leases dürfen deshalb nicht
   über einen Reconnect hinweg als gültig gelten — sonst arbeitet ein Lauf gegen einen Port, den es nicht mehr gibt
   (§B5).
7. **Nicht freigegebene Leases:** Ein Absturz des Clients mitten im Lauf lässt die Lease stehen. Absicherung
   dreifach: `finally`-Release im `Executor`, Verwerfen aller Leases beim WS-Disconnect, `maxLeaseMs` als Not-Aus.
   Diese drei Pfade sind der wichtigste Testfall der Umsetzung.
8. **Timing/Race beim Jobstart:** Zwischen `TUNNEL_ACQUIRE_RESULT` und dem ersten TCP-Connect des
   `proxmox-backup-client` liegt der Reverse-Forward-Aufbau. Der TCP-Preflight im `Executor` ist deshalb Pflicht,
   nicht optional — sonst scheitert der erste Lauf nach einer Idle-Phase sporadisch.
9. **Neuer Kontrollpfad Client → Server:** `TUNNEL_ACQUIRE` darf kein Ziel tragen, die `jobId` muss gegen den
   anfragenden Client geprüft werden (Kasten in §4), und die Anforderung muss rate-limitiert sein — sonst wird aus
   dem Feature ein Pivot bzw. ein DoS-Vektor auf die SSH-Verbindungen.
10. **Kein Moduswechsel = Historienverlust bei Umstellung:** Wer einen bestehenden Inbound-Client auf Tunnelbetrieb
    umstellen will, muss ihn löschen und neu anlegen; die an der Client-ID hängenden `job_history`-Einträge gehen
    dabei verloren. Bewusst so entschieden — in `doc/` und in der Lösch-Bestätigung des Frontends deutlich machen.
11. **Teilweise angelegte Clients:** Der atomare Anlegevorgang (§B3) hat zwei Außenwirkungen, die eine DB-Transaktion
    nicht zurückrollt — der Client hat nach `firstConnect` bereits einen `authToken` persistiert, und der
    Registrierungs-Secret ist dort verbraucht. Scheitert danach der DB-Write, muss der Bediener am Client-Host ein
    neues Secret setzen. Fehlermeldung entsprechend formulieren.
