# SSH-Reverse-Tunnel & Outbound-Clients

Wie Clients angebunden werden, die den Proxmox Backup Server nicht selbst erreichen.

## Überblick

PBCM kennt zwei Verbindungsarten. Sie wird beim Anlegen eines Clients **einmalig festgelegt
und ist danach nicht mehr änderbar**; sie bestimmt zugleich den Weg zum PBS:

| `connection_mode` | WebSocket | Weg zum PBS |
|---|---|---|
| `inbound` | Client verbindet sich zum Server (Standard) | direkt |
| `outbound` | Server verbindet sich zum Client | **immer** über den SSH-Reverse-Tunnel |

```
            ssh (Server ist SSH-Client)          Client-Host (sshd)
 ┌───────────────┐  ──────────────────────────►  ┌──────────────────────┐
 │  PBCM-Server  │                               │  pbcm-client         │
 │               │  ws  ─────────────────────►   │  :3001 /ws/agent     │
 │               │                               │                      │
 │               │  ◄── Reverse-Forward ────────  │ 127.0.0.1:<dyn>      │  ← proxmox-backup-client
 └──────┬────────┘    (-R 127.0.0.1:0:pbs:8007)  └──────────────────────┘
        │ https
        ▼
   ┌──────────┐
   │   PBS    │   (nur vom Server erreichbar)
   └──────────┘
```

Der Client-Host braucht keine Route zum PBS. Der Tunnel steht **nicht dauerhaft**: Der Client
fordert ihn unmittelbar vor einem Lauf an und gibt ihn danach wieder frei.

## Einrichtung

### 1. Client-Host vorbereiten

Der Wizard „Outbound-Client hinzufügen" unterstützt beides. Unter **Schlüssel** wählt man
zwischen *Schlüssel erzeugen lassen* — ein ed25519-Schlüssel ohne Passphrase, weil der Server
ihn unbeaufsichtigt nutzt — und *Eigenen Schlüssel einfügen*. Der private Schlüssel wird nur
gespeichert, nie wieder ausgegeben; für einen Wechsel erzeugt man im Client-Editor einen neuen.

Darunter liefert der optionale, zugeklappte Abschnitt **Einrichtung auf dem Client-Host** einen
kopierbaren Befehlsblock — für beide Wege gleichermaßen, da der öffentliche Teil bei Bedarf aus
dem eingetragenen Schlüssel abgeleitet wird. Er muss auf dem Client-Host ausgeführt sein,
**bevor** „Verbindung testen" erfolgreich sein kann.

Manuell entspricht das folgendem Eintrag auf dem Client-Host:

```
# ~/.ssh/authorized_keys
restrict,port-forwarding,permitlisten="127.0.0.1:*" ssh-ed25519 AAAA... pbcm-server
```

- `restrict` schaltet Shell, PTY, Agent- und X11-Forwarding ab.
- `permitlisten="127.0.0.1:*"` erlaubt Reverse-Forwards ausschließlich auf Loopback. Der
  Port-Wildcard ist nötig, weil der Port dynamisch vergeben wird.
- In der `sshd_config` muss `AllowTcpForwarding yes` gesetzt sein (Standard).
  `GatewayPorts` wird **nicht** benötigt.

### 2. Agent konfigurieren

In der `config.yaml` des Agents ein Einmal-Secret setzen und **keine** `serverUrl` eintragen:

```yaml
registrationSecret: "<zufälliges Secret>"
tunnelAcquireJitterSeconds: 30   # 0 schaltet die Verzögerung ab
```

Der Agent erkennt daran den Outbound-Modus, verbindet sich nicht selbst zum Server und stellt
stattdessen `/ws/register` und `/ws/agent` auf Port 3001 bereit. Nach erfolgreicher
Registrierung wird das Secret aus der Konfiguration entfernt.

> **Agent im Container:** Der Reverse-Forward endet im Netzwerk-Namespace des sshd, also
> auf dem Host. Ein Container mit Bridge-Netz hat ein eigenes `127.0.0.1` und erreicht den
> Forward nicht — der Lauf scheitert mit `SSH-Tunnel nicht erreichbar … ECONNREFUSED`.
> Deshalb `network_mode: host` verwenden (siehe `compose.yaml`). Ist Port 3001 auf dem Host
> belegt, per `listenPort` bzw. `PBCM_CLIENT_PORT` einen freien wählen und denselben Port in
> der Zieladresse des Clients eintragen.

### 3. Client in der Oberfläche anlegen

„Outbound-Client" im Client-Bereich. Zieladresse, Registrierungs-Secret und die SSH-Daten
eingeben, dann **Verbindung testen**. Der Test zeigt den Host-Key-Fingerprint, der aktiv
bestätigt werden muss — er wird gepinnt und künftig strikt geprüft.

Erst wenn Tunneltest **und** Registrierung erfolgreich waren, werden Client und Tunnel in einer
Transaktion gespeichert. Schlägt einer von beiden fehl, bleibt die Datenbank unberührt.

> Scheitert der Vorgang **nach** der Registrierung, hat der Agent das Secret bereits verbraucht.
> Dann am Client-Host ein neues `registrationSecret` setzen und erneut anlegen.

### 4. Serverseitige Einstellungen (optional)

```yaml
tunnel:
  enabled: true                # Not-Aus: false blockiert JEDEN Tunnel
  remoteBindHost: 127.0.0.1
  connectTimeoutMs: 10000
  keepaliveIntervalMs: 15000
  idleGraceMs: 60000           # Nachlauf nach der letzten Freigabe
  maxLeaseMs: 86400000         # Not-Aus gegen hängende Leases
  acquireTimeoutMs: 20000
  maxConcurrentTunnels: 20     # darüber Warteschlange
  retryDelaysMs: [2000, 5000, 10000]
  minRequestIntervalMs: 3000   # Rate-Limit pro Client
  keySecret: <auto-generiert>  # Verschlüsselung der SSH-Keys
```

## Ablauf eines Laufs

```
Client (Executor)                        Server (TunnelService)
      │  (Jitter 0–n s)
      │  TUNNEL_ACQUIRE {jobId,runId} ───────►  Job → Client-Zuordnung prüfen
      │                                         Repository des Jobs auflösen = Ziel
      │                                         ggf. ssh2.connect + forwardIn(host, 0)
      │  ◄──── TUNNEL_ACQUIRE_RESULT {leaseId, bindPort}
      │  TCP-Preflight auf 127.0.0.1:bindPort
      │  spawn proxmox-backup-client …
      │  TUNNEL_RELEASE {leaseId} ───────────►  refcount--
      │                                         0 ► idleGraceMs ► Forwards + SSH schließen
```

Der Client nennt **niemals ein Ziel** — nur die `jobId`. Der Server prüft, dass der Job diesem
Client gehört, und leitet Host und Port aus dessen Repository ab. Für Restores, die keine
`jobId` haben, autorisiert der Server das Ziel vorab beim Auslösen.

Die Job-Konfiguration auf dem Client enthält weiterhin die **echte PBS-URL** plus den Marker
`tunnel: { required: true }`. Erst beim Start ersetzt der Agent Host und Port durch den
Loopback-Endpunkt der Lease. Greift die Ersetzung nicht, scheitert der Lauf — er sichert nicht
versehentlich am Tunnel vorbei.

## Betrieb

- **Der Server muss zu den Backup-Zeiten laufen.** Ohne WebSocket keine Lease, ohne Lease kein
  Tunnel, und einen Fallback auf Direktverbindung gibt es konstruktiv nicht. Geplante Backups
  scheitern dann sofort mit klarer Meldung.
- **Die Zieladresse ist änderbar, die Verbindungsart nicht.** Host und Port des Agents
  lassen sich im Client-Editor anpassen; der Server verwirft daraufhin die offene
  Agent-Verbindung und wählt sofort die neue Adresse.
- **Ein Wechsel der Verbindungsart ist nicht vorgesehen.** Umstellen heißt löschen und neu
  anlegen — die an der Client-ID hängende Job-Historie geht dabei verloren.
- **`tunnel.keySecret` sichern.** Geht der Wert verloren, sind die hinterlegten SSH-Keys nicht
  mehr entschlüsselbar und müssen neu eingetragen werden. Eine JWT-Rotation ist unkritisch:
  Der Schlüssel ist bewusst von `jwtSecret` entkoppelt.
- **PBS-Rechte begrenzen.** Pro Client ein eigener API-Token mit `Datastore.Backup` auf eigenem
  Namespace und ohne `Datastore.Modify`/`Prune` — sonst kann ein übernommener Client genau die
  Backups löschen, gegen die er absichern soll.

## Manuelles Testprotokoll

Das Projekt hat kein Testframework; diese Checkliste ist das Sicherungsnetz. Die ersten vier
Punkte decken Fehler ab, die sonst **still** bleiben.

1. **Lease-Leak nach Client-Absturz** — Client während eines Laufs hart beenden (`kill -9`).
   Erwartung: Der WS-Disconnect verwirft alle Leases, der Tunnel schließt nach `idleGraceMs`.
2. **Portwechsel nach Reconnect** — SSH-Verbindung während eines Laufs unterbrechen.
   Erwartung: Lease wird verworfen, Lauf scheitert mit klarer Meldung, kein Zugriff auf einen
   toten Port.
3. **Atomares Anlegen mit Fehlschlag** — gültige SSH-Daten, falsches Registrierungs-Secret.
   Erwartung: keine Zeile in `clients` und keine in `client_tunnels`; Meldung weist auf das
   verbrauchte Secret hin.
4. **Parallele Jobs** — zwei Jobs desselben Clients gleichzeitig starten.
   Erwartung: genau **eine** SSH-Verbindung, ein Forward je Zielrepository, beide Läufe
   erfolgreich, Tunnel schließt erst nach der zweiten Freigabe.
5. **Mehrere Repositories** — zwei Jobs eines Clients gegen zwei PBS-Instanzen.
   Erwartung: zwei Forwards mit verschiedenen Ports, beide Backups im richtigen Datastore.
6. **Fremde `jobId`** — manipuliertes `TUNNEL_ACQUIRE` mit der `jobId` eines anderen Clients.
   Erwartung: Ablehnung mit Logeintrag.
7. **Obergrenze** — `maxConcurrentTunnels` auf 1 setzen, zwei Clients gleichzeitig starten.
   Erwartung: Der zweite wartet und läuft danach durch, statt zu scheitern.
8. **Inbound unberührt** — ein bestehender Inbound-Client sichert nach der Migration
   unverändert direkt zum PBS.

## Voraussetzung

Durch den dynamischen Port hat `PBS_REPOSITORY` bei getunnelten Läufen immer die Form
`user!token@127.0.0.1:<port>:datastore`. Die eingesetzte `proxmox-backup-client`-Version muss
die Port-Angabe in der Repository-Spec unterstützen.

Die Hostname-Prüfung wird über `PBS_FINGERPRINT` abgedeckt: Der Fingerprint des Repositories
wird unverändert übernommen, sodass der Mismatch zwischen `127.0.0.1` und dem PBS-Zertifikat
unkritisch ist.
