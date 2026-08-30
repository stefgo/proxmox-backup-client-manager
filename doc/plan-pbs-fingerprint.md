# Plan: PBS-Zertifikatsfingerprint verwalten und aktuell halten

**Status:** umgesetzt · **Erstellt:** 2026-08-30 · **Rev. 3**

> Alle Bausteine sind implementiert. Abweichungen gegenüber Rev. 2:
> - `CertProbe` setzt **kein** SNI, wenn die Adresse eine IP ist (RFC 6066; Node verwirft es künftig).
> - Der Rückschreibpfad im Client nutzt `JobRepository.updateConfig` statt `upsert`, um die
>   Schedule-Spalten nicht mit veralteten Kopien zu überschreiben.
> - Baustein 5 verwendet `core/InsecureHttp.ts` (`https.request`) statt eines Undici-Agents —
>   `undici` ist keine Abhängigkeit des Clients, und zwei Aufrufe rechtfertigen keine neue.
> - Die Verteilung überspringt Jobs ohne `id`: ein `JOB_SAVE_CONFIG` ohne id legt clientseitig
>   einen **neuen** Job an und würde den Zeitplan verdoppeln.
> - Die neuen UI-Texte sind englisch, passend zum übrigen Repository-Feature (der Tunnel-Assistent
>   ist deutsch — die Mischung ist bestehend, nicht neu).

## 1. Anlass

Nach der Erneuerung des PBS-Zertifikats schlug der Backup des Outbound-Clients `zeus` fehl:

```
WARNING: certificate fingerprint does not match expected fingerprint!
expected: 49:88:dc:78:...:e6:ce
certificate validation failed - Certificate fingerprint was not confirmed.
```

Die direkten (Inbound-)Clients liefen unverändert weiter. Ursache:

`proxmox-backup-client` prüft zweistufig. Zuerst die reguläre OpenSSL-Validierung (CA-Kette +
Hostname); ist sie erfolgreich, wird `PBS_FINGERPRINT` **gar nicht ausgewertet**. Erst wenn sie
fehlschlägt, greift der Fingerprint-Vergleich.

- **Inbound:** Ziel ist `https://pbs.internal.g4l-online.de` → CA-Prüfung gelingt → Fingerprint irrelevant.
- **Outbound:** Ziel ist `127.0.0.1:<Lease-Port>` (`TunnelClient.buildRepositoryValue`) → Hostname kann
  nie passen → Fingerprint ist die einzige Vertrauensbasis → veralteter Wert bricht den Lauf.

Der gespeicherte Wert stammt vom 2026-02-27 und wird von niemandem gegen die Realität gehalten:
`RepositoryController.update` schreibt nur in die Server-DB, und die Clients halten den Fingerprint
als eingefrorene Kopie im Job-Snapshot (`Handlers.handleJobSave`).

## 2. Leitprinzip

> Ein Fingerprint darf automatisch übernommen werden, wenn eine **von ihm unabhängige Instanz** die
> Echtheit bezeugt — die CA-Kette bei einem Handshake mit `rejectUnauthorized: true` gegen den
> **echten Hostnamen**. Ist diese Bezeugung nicht zu haben (Self-Signed), entscheidet ein Mensch.

Wer die Prüfung durchführt, ist zweitrangig — entscheidend ist, ob sie an einem Ort stattfindet, an
dem der echte Hostname verfügbar ist.

| Fall | CA-Prüfung möglich durch | Fingerprint-Quelle |
|---|---|---|
| Inbound, CA-gültig | Client selbst | selbst gemessen, Server wird nachrichtlich informiert |
| Inbound, self-signed | niemanden automatisch | vom Server übermittelter, bestätigter Wert |
| Outbound/Tunnel | nur Server (Client sieht nur `127.0.0.1`) | Server, per Lease just-in-time |

## 3. Gemeinsame Grundlage: `CertProbe`

Eine Hilfsfunktion, in **beiden** Workspaces benötigt (Server und Client). Umsetzung als Modul in
`shared/src/` wäre naheliegend, scheitert aber daran, dass `shared` bisher rein typen-/schemabasiert
und damit auch im Browser importierbar ist — ein `node:tls`-Import würde den Frontend-Build brechen.
**Entscheidung: zwei schlanke Kopien**, `server/backend/src/services/CertProbe.ts` und
`client/src/core/CertProbe.ts`, identische Signatur.

```ts
export interface CertProbeResult {
    reachable: boolean;
    fingerprint?: string;      // normalisiert: lowercase, mit Doppelpunkten
    caValid: boolean;          // Handshake mit rejectUnauthorized:true erfolgreich
    notAfter?: string;         // Ablaufdatum, für die Anzeige im UI
    error?: string;
}

export async function probeCertificate(
    baseUrl: string,
    timeoutMs = 5000,
): Promise<CertProbeResult>;
```

Umsetzung:

1. Host und Port aus `baseUrl` (`new URL`), Default-Port 8007.
2. `tls.connect({ host, port, servername: host, rejectUnauthorized: true, timeout })`.
   Erfolg → `caValid: true`.
3. Bei `ERR_TLS_CERT_ALTNAME_INVALID` / `DEPTH_ZERO_SELF_SIGNED_CERT` o. ä.: zweiter Versuch mit
   `rejectUnauthorized: false`, nur um den Fingerprint überhaupt zu **messen** → `caValid: false`.
4. Fingerprint aus `socket.getPeerCertificate().fingerprint256`.

**Kritische Details:**

- `fingerprint256` liefert Großbuchstaben (`49:88:DC:...`), die DB enthält Kleinbuchstaben. Jeder
  Vergleich läuft über eine Normalisierungsfunktion (`toLowerCase()`, Whitespace entfernt) —
  sonst meldet der Abgleich Drift, wo keine ist.
- Im **Client** ist `rejectUnauthorized: true` zwingend explizit zu setzen. `client/src/web/server.ts:110`
  und `:179` setzen `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` prozessweit und ohne Reset;
  wer sich dort auf den Default verlässt, validiert nie und würde bedingungslos übernehmen.
  → Siehe Baustein 5.
- Ein Probe-Fehler (PBS nicht erreichbar) ist **nie** ein Abbruchgrund für einen Backup-Lauf.
  Er führt immer auf den gespeicherten Wert zurück.

## 4. Baustein 0 — `repositoryId` im Job-Snapshot (Voraussetzung für Baustein 2)

**Ziel:** Ein Job weiß, zu welchem Repository er gehört. Heute trägt er nur eine anonyme Kopie der
Zugangsdaten, und jede Zuordnung müsste über `baseUrl` + `datastore` raten.

### Gute Nachricht: keine SQL-Migration nötig

Das Repository steckt auf dem Client als **JSON im `config`-Feld** der `jobs`-Tabelle
(`Handlers.handleJobSave` baut `configObj` und legt es per `JobRepository.upsert` ab). Serverseitig
gibt es überhaupt keine Job-Tabelle — der Server hält Jobs nur im flüchtigen `ProxyService.jobCache`.
Ein zusätzliches Feld im JSON ist damit **rückwärtskompatibel ohne Schemaänderung an der DB**; alte
Datensätze haben es schlicht nicht.

### Änderungen

- `shared/src/schemas.ts`, `RepositorySchema` (Z. 3–10): `repositoryId: z.string().optional()`.
  Optional, damit Bestandsjobs weiter validieren. Danach `npm run build -w shared`.
- `JobRepositorySelect.tsx` Z. 48–56: `handleSelect` kopiert heute exakt die sechs Felder von
  `RepositorySchema` und **verwirft die `id`** des `ManagedRepository`. Hier `repositoryId: repo.id`
  ergänzen — ab dann trägt jeder neu gespeicherte Job die ID.
- `isCurrentRepo` (ebd. Z. 66–70) vergleicht `baseUrl` + `datastore` + `username`. Kann auf die ID
  umgestellt werden, sobald die Backfill-Phase abgeschlossen ist — **nicht** sofort, sonst wirken
  Bestandsjobs im Editor als „kein Repository gewählt".

### Backfill für Bestandsjobs

In `ProxyService.refreshJobCache(clientId)` (Z. 46–61), also **bei jedem Verbindungsaufbau eines
Clients**, einmalig nachziehen:

1. Jobs ohne `repository.repositoryId` heraussuchen.
2. Gegen `RepositoryConfigRepository.findAll()` über `base_url` + `datastore` auflösen.
3. **Genau ein** Treffer → `JOB_SAVE_CONFIG` mit ergänzter ID zurückschreiben, Vorgang loggen.
4. Kein oder mehrdeutiger Treffer → überspringen und warnen. Der Job bleibt funktionsfähig, nur die
   Verteilung aus Baustein 2 erreicht ihn nicht.

Der Backfill ist idempotent und läuft nach Abschluss ins Leere. Die Fallback-Zuordnung über
`baseUrl` + `datastore` in Baustein 2 bleibt als Sicherheitsnetz bestehen und kann entfernt werden,
sobald keine Warnungen mehr auftreten.

## 5. Baustein 1 — Server: prüfen und übernehmen in den Repository-Eigenschaften

**Ziel:** Der Bediener sieht Soll und Ist und kann bewusst übernehmen.

### Backend

- `server/backend/src/services/CertProbe.ts` (neu, siehe §3).
- `RepositoryController.probeCertificate` (neu) — GET `/api/v1/repositories/:repositoryId/certificate`.
  Antwort:
  ```json
  {
    "storedFingerprint": "49:88:...",
    "measuredFingerprint": "ab:cd:...",
    "matches": false,
    "caValid": true,
    "notAfter": "2026-11-27T10:00:00Z",
    "reachable": true
  }
  ```
- Route in `server/backend/src/routes/api.ts` neben den übrigen `/repositories/...`-Einträgen (Z. 133–155).
- Die Übernahme braucht **keinen** neuen Endpunkt: Das Frontend schreibt den gemessenen Wert per
  bestehendem `PUT /api/v1/repositories/:repositoryId`.

### Frontend

- `useRepositoryStore`: `probeCertificate(id, token)` analog zu `checkRepositoryStatus`.
- `RepositoryEditor.tsx`: Button **„Zertifikat prüfen"** neben dem Fingerprint-Feld (Z. 85–90).
  Ergebnisanzeige:
  - identisch → grüner Hinweis „Fingerprint aktuell", Ablaufdatum;
  - abweichend + `caValid` → gemessener Wert + Button **„Übernehmen"** (setzt das Feld);
  - abweichend + `!caValid` → **Warnung** mit ausdrücklichem Hinweis, dass die Echtheit nicht
    bestätigt werden konnte, Übernahme nur nach manueller Gegenprüfung
    (`proxmox-backup-manager cert info` auf dem PBS);
  - nicht erreichbar → neutraler Hinweis, keine Änderung.
- Zusätzlich: der zuletzt von einem Client gemeldete abweichende Fingerprint (§7) wird hier
  angezeigt, sofern vorhanden.

**Ohne Baustein 2 bleibt eine Übernahme hier serverseitig** — die Clients bekommen sie noch nicht.

## 6. Baustein 2 — Verteilen-Knopf

**Ziel:** Den bestätigten Wert bewusst an alle verbundenen Clients ausrollen. Bewusste
Bedienhandlung, **kein** automatisches Fan-out bei jedem `PUT`.

- `RepositoryController.distribute` (neu) — POST `/api/v1/repositories/:repositoryId/distribute`.
- Ablauf:
  1. `ProxyService.getAllCachedJobs()` liefert `{ clientId, jobs }` für alle **verbundenen** Clients.
  2. Jobs filtern: primär über `repository.repositoryId` (Baustein 0), hilfsweise über
     `baseUrl` + `datastore` für noch nicht migrierte Bestandsjobs.
  3. Je Treffer `ProxyService.sendRequest(clientId, WS_EVENTS.JOB_SAVE_CONFIG, { requestId, job })`
     mit aktualisiertem `repository.fingerprint` — exakt der Pfad aus `JobController.save`.
  4. Anschließend `ProxyService.refreshJobCache(clientId)`.
- Antwort: `{ updated: n, clients: [...], skippedOffline: [...] }`.
- UI: Button **„An verbundene Clients verteilen"** in der Repository-Ansicht, mit
  Bestätigungsdialog und Ergebnismeldung.
- **Offline-Clients:** werden namentlich als übersprungen ausgewiesen — mehr nicht (Entscheidung
  §10.2). Sie erhalten den Wert beim nächsten regulären Job-Speichern, beim nächsten manuellen
  Verteilen oder über Baustein 3.

## 7. Baustein 3 — Client: selbst messen, wenn die CA es bezeugt

**Ziel:** Inbound-Clients halten sich selbst aktuell, auch ohne Serverkontakt.

- `client/src/core/CertProbe.ts` (neu, siehe §3).
- In `Executor.ts` in dem Block, der `PBS_FINGERPRINT` setzt (Z. 358–380):

```ts
if (jobConfigData.repository) {
    let fingerprint = repo.fingerprint;

    // Tunnel-Läufe messen nicht selbst: Ziel ist 127.0.0.1, die CA-Prüfung kann dort
    // nicht gelingen. Dort liefert der Lease den Wert (Baustein 4).
    if (!jobConfigData.tunnel?.required) {
        const probe = await probeCertificate(repo.baseUrl);
        if (probe.caValid && probe.fingerprint) {
            fingerprint = probe.fingerprint;      // CA bezeugt die Echtheit
        }
    }
    if (fingerprint) env.PBS_FINGERPRINT = fingerprint;
}
```

- **Persistieren:** Weicht der gemessene Wert vom gespeicherten ab und ist `caValid`, wird der
  Job-Snapshot über `JobRepository.upsert` aktualisiert, damit auch der nächste Offline-Lauf ihn hat.
- **Rückmeldung:** neues Event `FINGERPRINT_OBSERVED` (Client → Server) in
  `shared/src/constants.ts` und `shared/src/types.ts`:
  ```ts
  FINGERPRINT_OBSERVED: { req: { repositoryId?: string; baseUrl: string; fingerprint: string; caValid: boolean }; res: void }
  ```
  Versand per `Connection.send`, Empfang in `WebSocketController` (Muster: die übrigen
  Client→Server-Events ab Z. 388).

  **Der Server schreibt daraufhin ausschließlich einen Logeintrag** (Entscheidung §10.4) — keine
  automatische Übernahme in die DB. Sonst könnte ein kompromittierter Client den Sollwert für alle
  anderen setzen. Die Übernahme bleibt Baustein 1. Der zuletzt gemeldete Wert wird zusätzlich im
  Repository-Objekt der API-Antwort mitgeliefert, damit §5 ihn anzeigen kann.

## 8. Baustein 4 — Tunnel: Fingerprint über den Lease

**Ziel:** Outbound-Clients bekommen den Wert just-in-time, weil sie ihn selbst nicht ermitteln können.

- `shared/src/schemas.ts`: `TunnelAcquireResultSchema` (Z. 289–296) um `fingerprint: z.string().optional()`
  erweitern. Danach `npm run build -w shared`.
- `WebSocketController.handleTunnelAcquire` (Z. 407–465): Nach `resolveTunnelTarget` ist das
  Repository bekannt. Vor dem Gewähren des Leases:
  ```ts
  const probe = await probeCertificate(repo.base_url);
  const fingerprint = probe.caValid && probe.fingerprint
      ? probe.fingerprint          // CA-bezeugt → frisch
      : repo.fingerprint;          // sonst der gespeicherte, bestätigte Wert
  ```
  und in das `TUNNEL_ACQUIRE_RESULT`-Payload aufnehmen.
- **Der Lease wird nie wegen der Probe verweigert.** Schlägt sie fehl, gilt der gespeicherte Wert.
- Ist `caValid` und weicht der Wert von der DB ab, wird die Abweichung geloggt (Übernahme über
  Baustein 1, nicht hier — konsistent mit §7).
- `client/src/features/Executor.ts` Z. 481–489 (Backup) und Z. 786–796 (Restore):
  ```ts
  lease = await TunnelClient.acquire(runId, jobId);
  env.PBS_REPOSITORY = TunnelClient.buildRepositoryValue(jobConfigData.repository, lease);
  if (lease.fingerprint) env.PBS_FINGERPRINT = lease.fingerprint;   // neu
  ```
- `TunnelClient.acquire` reicht das neue Feld in `TunnelLease` durch.

Damit ist der Fingerprint im Tunnelfall eine **Eigenschaft des Leases** statt ein eingefrorener
Snapshot-Wert — die Fehlerklasse aus §1 verschwindet dort vollständig.

## 9. Baustein 5 — `NODE_TLS_REJECT_UNAUTHORIZED` bereinigen (Voraussetzung für Baustein 3)

`client/src/web/server.ts:110` und `:179` schalten die TLS-Validierung prozessweit und dauerhaft ab,
gemeint ist aber nur die Verbindung zum PBCM-Server bei Registrierung/Statusabfrage.

- Ersetzen durch einen lokal begrenzten Undici-`Agent` mit `connect: { rejectUnauthorized: false }`,
  der ausschließlich an diesen beiden `fetch`-Aufrufen hängt.
- Der Rest des Prozesses validiert damit wieder normal.

Ohne diesen Schritt ist Baustein 3 nur durch das explizite `rejectUnauthorized: true` in `CertProbe`
abgesichert — das trägt, ist aber eine stille Abhängigkeit, die beim nächsten `fetch` bricht.

## 10. Getroffene Entscheidungen

1. **`repositoryId` wird eingeführt** (statt dauerhaft über `baseUrl` + `datastore` zu raten) →
   Baustein 0, §4. Keine SQL-Migration nötig, Backfill beim Verbindungsaufbau.
2. **Keine Queue für Offline-Clients.** Sie werden beim Verteilen namentlich als übersprungen
   gemeldet; die Nachlieferung erfolgt beiläufig über die regulären Pfade.
3. **`CertProbe` doppelt statt in `shared/`** — bestätigt, damit `shared` browser-importierbar bleibt.
4. **Client-Meldungen erzeugen nur einen Logeintrag**, keine automatische Übernahme und kein
   Dashboard-Kanal. Der zuletzt gemeldete Wert wird in der Repository-Ansicht angezeigt.

## 11. Reihenfolge und Nutzen

| # | Baustein | Löst | Aufwand |
|---|---|---|---|
| 1 | Server: prüfen/übernehmen | Sichtbarkeit, korrekter Sollwert | klein |
| 0 | `repositoryId` + Backfill | Voraussetzung für 2 | klein |
| 2 | Verteilen-Knopf | akutes Problem `zeus`, ohne Client-Änderung | klein |
| 5 | TLS-Bereinigung | Voraussetzung für 3 | klein |
| 3 | Client misst selbst | Inbound + Offline, self-healing | mittel |
| 4 | Tunnel-Lease | Outbound dauerhaft, kein Drift mehr möglich | mittel |

**1 + 0 + 2 lösen den konkreten Ausfall sofort und ohne Änderung am Client-Code.** 3–5 machen die
Fehlerklasse strukturell unmöglich.

## 12. Testprotokoll

1. **Baseline:** `zeus`-Backup mit veraltetem Fingerprint → schlägt reproduzierbar fehl.
2. **Baustein 1:** „Zertifikat prüfen" zeigt Abweichung, `caValid: true`, korrektes Ablaufdatum.
3. **Baustein 0:** Bestandsjob ohne `repositoryId` → nach Client-Reconnect trägt der Job die ID,
   Backfill ist im Log vermerkt, ein zweiter Reconnect schreibt nichts mehr.
4. **Baustein 0, negativ:** zweites Repository mit gleicher `baseUrl` + `datastore` anlegen →
   Backfill überspringt den Job und warnt, der Job bleibt lauffähig.
5. **Baustein 2:** Übernehmen + Verteilen → `zeus`-Backup läuft durch. Client offline → wird als
   übersprungen gemeldet, kein Fehler.
6. **Baustein 3:** Inbound-Client gegen CA-gültigen PBS mit absichtlich falschem gespeichertem
   Fingerprint → Lauf gelingt, Snapshot wurde korrigiert, `FINGERPRINT_OBSERVED` erzeugt genau einen
   Logeintrag und **keine** DB-Änderung.
7. **Baustein 3, negativ:** PBS mit Self-Signed-Zertifikat → **keine** Übernahme, gespeicherter Wert
   bleibt maßgeblich, falscher Wert führt weiterhin zum Fehlschlag (Pin wirkt).
8. **Baustein 4:** PBS-Zertifikat erneuern, **nichts** im UI ändern → nächster Tunnel-Backup läuft
   trotzdem durch (Wert kam über den Lease).
9. **Baustein 4, negativ:** PBS während des Lease-Zeitpunkts nicht erreichbar → Lease wird dennoch
   gewährt, gespeicherter Wert wird verwendet.
10. **Baustein 5:** Nach Registrierung über die Client-Web-UI ist `NODE_TLS_REJECT_UNAUTHORIZED`
    nicht gesetzt; ein `CertProbe` gegen einen Self-Signed-Host meldet weiterhin `caValid: false`.

## 13. Betroffene Dateien

**Neu:** `server/backend/src/services/CertProbe.ts`, `client/src/core/CertProbe.ts`

**Geändert:**
- `shared/src/schemas.ts` (`RepositorySchema.repositoryId`, `TunnelAcquireResultSchema.fingerprint`),
  `shared/src/constants.ts` + `shared/src/types.ts` (`FINGERPRINT_OBSERVED`)
  → danach `npm run build -w shared`
- `server/backend/src/controllers/RepositoryController.ts`, `server/backend/src/routes/api.ts`,
  `server/backend/src/controllers/WebSocketController.ts`, `server/backend/src/services/ProxyService.ts`
- `server/frontend/src/stores/useRepositoryStore.ts`,
  `server/frontend/src/features/repositories/components/RepositoryEditor.tsx`,
  `server/frontend/src/features/clients/components/job-editor/JobRepositorySelect.tsx`
- `client/src/features/Executor.ts`, `client/src/features/TunnelClient.ts`, `client/src/web/server.ts`
- `doc/api.md` (neue Endpunkte + WS-Event), `doc/tunnel.md` (§ Fingerprint), `doc/backend.md`
