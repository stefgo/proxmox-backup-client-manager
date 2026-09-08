# [1.4.0-beta.11](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.10...v1.4.0-beta.11) (2026-09-08)


### Bug Fixes

* **client:** Fehlermeldung der Registrierung nennt das betroffene Feld ([8ce8552](https://github.com/stefgo/proxmox-backup-client-manager/commit/8ce8552b84fed46ab4f6dcc9b25e018aa2204968))
* **client:** Log-Puffer und Log-Frames sind gedeckelt ([21d1143](https://github.com/stefgo/proxmox-backup-client-manager/commit/21d114394906cf543bc73586db457ee2ac7bfb2e))
* **client:** Reconnect nutzt Backoff mit Jitter ([125d616](https://github.com/stefgo/proxmox-backup-client-manager/commit/125d616e2d2637ed6b49eaae186c8118a34f2277))
* **server:** Anmeldung wird auf 10 Versuche je 15 Minuten begrenzt ([0c479ef](https://github.com/stefgo/proxmox-backup-client-manager/commit/0c479efc883d3223b0fc5f023f8b532b5c033d12))
* **server:** CORS spiegelt keine fremden Origins mehr und Token laufen ab ([bf6473f](https://github.com/stefgo/proxmox-backup-client-manager/commit/bf6473fe02030347e6c86d617cbf9773f129d79a))
* **server:** Sicherheitskopfzeilen ueber helmet ([7980971](https://github.com/stefgo/proxmox-backup-client-manager/commit/7980971d3c12f47d9d84778671669a895438e5d2))
* **server:** Tunnel-Slots werden gezaehlt statt aus dem Zustand abgeleitet ([2a7a11b](https://github.com/stefgo/proxmox-backup-client-manager/commit/2a7a11ba966e3d4605dea4cfc6ffc7a2dd1d4878))


### Features

* **client:** Registrierung verlangt eine Setup-PIN ([8e4fb61](https://github.com/stefgo/proxmox-backup-client-manager/commit/8e4fb619c407dc9e97ccdef3cc13881a866a453f))
* **server:** Anmeldung nutzt ein httpOnly-Cookie statt eines Bearer-Tokens ([3e61516](https://github.com/stefgo/proxmox-backup-client-manager/commit/3e6151628cf1b2d63544a89cb4acd06f8d7b6266))

# [1.4.0-beta.10](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.9...v1.4.0-beta.10) (2026-09-08)


### Bug Fixes

* Live-History zeigt den Client-Namen statt "Unknown Client" ([55f969e](https://github.com/stefgo/proxmox-backup-client-manager/commit/55f969eb342f5c0137b39178c12042eb8c16f0b3))

# [1.4.0-beta.9](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.8...v1.4.0-beta.9) (2026-09-08)


### Bug Fixes

* Aktions-Icons im Job-Editor sind dauerhaft sichtbar ([d9753b7](https://github.com/stefgo/proxmox-backup-client-manager/commit/d9753b73aa61ca55d48f41e58532053594209282))
* Aktionsspalte heisst in allen Tabellen "Actions" ([d6cae83](https://github.com/stefgo/proxmox-backup-client-manager/commit/d6cae835d11881f31648beb63b9eea3108926e6d))


### Features

* Job-Editor bekommt eigene Routen und einen waehlbaren Client ([0ef0f34](https://github.com/stefgo/proxmox-backup-client-manager/commit/0ef0f343d07a27ecb5655bdb2b6fc19edbfc84ad))
* Job-Editor speichert und schliesst wie der Client-Editor ([3e70042](https://github.com/stefgo/proxmox-backup-client-manager/commit/3e700427b45a2128edb43f4cf8db1e86ad13e727))
* Repository-Detailseite bekommt ein Aktionsmenue mit Editor-Route ([8bb7814](https://github.com/stefgo/proxmox-backup-client-manager/commit/8bb78147465d9417f95fd70d9c66b691fcd73eb2))
* Repository-Editor speichert und schliesst wie der Client-Editor ([a177a47](https://github.com/stefgo/proxmox-backup-client-manager/commit/a177a471ed631514fd327ec383f229652fe3aff0))

# [1.4.0-beta.8](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.7...v1.4.0-beta.8) (2026-09-08)


### Features

* Client-Overview zeigt den Tunnel und laesst sich per Esc verlassen ([f9c0d95](https://github.com/stefgo/proxmox-backup-client-manager/commit/f9c0d955415553fa3c71f72aa86c0a8be15e3200))
* Server vergibt die Client-Identity und prueft sie bei jeder Verbindung ([8451177](https://github.com/stefgo/proxmox-backup-client-manager/commit/84511771450d925d23babdac256193c79899be9d))

# [1.4.0-beta.7](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.6...v1.4.0-beta.7) (2026-09-08)


### Features

* Adresspruefung eines Inbound-Clients ist abschaltbar ([662da60](https://github.com/stefgo/proxmox-backup-client-manager/commit/662da60e651770cb76f4cad37fef2e37ecec0321))

# [1.4.0-beta.6](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.5...v1.4.0-beta.6) (2026-09-08)


### Features

* erlaubte IP eines Inbound-Clients ist editierbar ([cbdd624](https://github.com/stefgo/proxmox-backup-client-manager/commit/cbdd6240e8707bac96f48b54b44821495b3e6518))
* trusted_networks entfaellt, Agent prueft erlaubte Netze ([0d31805](https://github.com/stefgo/proxmox-backup-client-manager/commit/0d318053948e29fc49a113ca9da801451a83fea2))

# [1.4.0-beta.5](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.4...v1.4.0-beta.5) (2026-09-07)


### Bug Fixes

* **backend:** REST-Endpunkte validieren ihre Eingaben ([b70670b](https://github.com/stefgo/proxmox-backup-client-manager/commit/b70670bc98565bf810fa8920fac88aa589f967ee))


### Features

* add clientName prop to ClientTunnelCard and update ClientTunnelEditor to use it ([ddb126b](https://github.com/stefgo/proxmox-backup-client-manager/commit/ddb126b57a464681b90edc23f513b9fb51848b08))

# [1.4.0-beta.4](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.3...v1.4.0-beta.4) (2026-09-07)


### Bug Fixes

* **clients:** Tunnel-Fehler dort zeigen, wo sie entstehen ([21bdcc0](https://github.com/stefgo/proxmox-backup-client-manager/commit/21bdcc0fa80b54025f8dbb10a11a68277da84ac3))


### Features

* Client-Assistent für beide Verbindungsarten ([1636bde](https://github.com/stefgo/proxmox-backup-client-manager/commit/1636bdecef10d79495014d968935418517268409))
* **clients:** Add-Client-Wizard mit Escape verlassen ([988c893](https://github.com/stefgo/proxmox-backup-client-manager/commit/988c893b5a3e3a925418fc5435a0b576f26874d5))
* **clients:** Ausstieg aus dem Client-Editor an eine Sticky-Leiste geben ([06286d0](https://github.com/stefgo/proxmox-backup-client-manager/commit/06286d0e361cba63297ff563d9a14cab142cd73c))
* **clients:** Client-Editor in Identitäts- und Tunnel-Card trennen ([2b7006f](https://github.com/stefgo/proxmox-backup-client-manager/commit/2b7006fcb099bf1399edd0f024436d237e7da5a4))
* **clients:** SSH-Tunnel als eigene Seite mit eigenem Weg hinein ([5bd416d](https://github.com/stefgo/proxmox-backup-client-manager/commit/5bd416d795f5196d1d8150b98e85b3836cf1262c))
* SSH-Tunnel von der Verbindungsart entkoppeln ([f848525](https://github.com/stefgo/proxmox-backup-client-manager/commit/f8485252419d6b0305bef429b06d9c66d6fd64e2))

# [1.4.0-beta.3](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.2...v1.4.0-beta.3) (2026-09-03)


### Bug Fixes

* **frontend:** Fokusring und Rahmenfarben in allen Ansichten korrigieren ([957ce52](https://github.com/stefgo/proxmox-backup-client-manager/commit/957ce52898532d9ec5e5fc3f0c6ae2fd2b103966))

# [1.4.0-beta.2](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.1...v1.4.0-beta.2) (2026-09-01)


### Bug Fixes

* **tailwind:** update content configuration to include preset's content ([c4ae653](https://github.com/stefgo/proxmox-backup-client-manager/commit/c4ae653246612507ce9939e94ac2eb9fbe30afff))

# [1.4.0-beta.1](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.3.2...v1.4.0-beta.1) (2026-09-01)


### Bug Fixes

* **auth:** login memoisieren, Job-Subscription stabil halten ([b11b974](https://github.com/stefgo/proxmox-backup-client-manager/commit/b11b9742818e7d0b2164097a5f789a9884b96c03))
* **backend:** Message-Listener in sendRequest auf allen Pfaden abmelden ([53fa2d4](https://github.com/stefgo/proxmox-backup-client-manager/commit/53fa2d4c9e53c998fca7f23f15485cebde4e569d))
* **backend:** Ping-Intervall unauthentifizierter Dashboard-Sockets freigeben ([a764aa3](https://github.com/stefgo/proxmox-backup-client-manager/commit/a764aa3cb16998b44a10e0323733a5e7bf7028e2))
* **client:** Job-Slot auf allen Exit-Pfaden von executeBackup freigeben ([f798b3d](https://github.com/stefgo/proxmox-backup-client-manager/commit/f798b3d435334c6871fa48e357e0a989b069c673))
* **client:** Jobs mit unbrauchbarem Zeitplan überspringen statt endlos zu triggern ([6dd874e](https://github.com/stefgo/proxmox-backup-client-manager/commit/6dd874e24489a2d67ff11cbbe081d08961f6dcd8))
* **client:** Pre-/Post-Script ohne Shell ausführen ([753fdc0](https://github.com/stefgo/proxmox-backup-client-manager/commit/753fdc00f47814ba1e5a78e3866fdd82bb6306cb))
* **client:** temporäres Keyfile nach jedem Backup-Lauf löschen ([44eb3ba](https://github.com/stefgo/proxmox-backup-client-manager/commit/44eb3ba8a381c030ea8ec5e60dee887759bb1f4b))
* **client:** Zeitplan beim Lesen aus SQLite gegen das Schema validieren ([21138f9](https://github.com/stefgo/proxmox-backup-client-manager/commit/21138f9685ff710fdb92291a5a25cc4db7c77f28))
* **client:** Zeitplan-Rückstand in einem Schritt aufholen statt Tick für Tick ([26d1552](https://github.com/stefgo/proxmox-backup-client-manager/commit/26d155263b3c30378a606d6d9e71a040c538600a))
* **deps:** 13 Sicherheitslücken per npm audit fix schließen ([4662312](https://github.com/stefgo/proxmox-backup-client-manager/commit/4662312dc30bd547a7fddb67a217d8cb167501ac))
* **deps:** update @stefgo/react-ui-components to 2.11.2 ([204e039](https://github.com/stefgo/proxmox-backup-client-manager/commit/204e039bc2765708a7e77a243560aa9b5af71191))
* **frontend:** Einstellungsseite im Dark Mode lesbar machen ([659764b](https://github.com/stefgo/proxmox-backup-client-manager/commit/659764b5ea061486484c78f5aeb4bcd9ffa77c11)), closes [#444444](https://github.com/stefgo/proxmox-backup-client-manager/issues/444444)
* **frontend:** Listen sortieren ueber die volle Menge, Tokens blaetterbar ([cf22ac4](https://github.com/stefgo/proxmox-backup-client-manager/commit/cf22ac4a24dcdbf620831cf75cd73481be71877a))
* Hänger beim Anlegen eines Outbound-Clients ([5c130d4](https://github.com/stefgo/proxmox-backup-client-manager/commit/5c130d442b0b15c4142e15c838e59f8ce5f368e9))
* **hooks:** Dependency-Arrays vervollstaendigen, Snapshot-Nachladen entkoppeln ([2c03b39](https://github.com/stefgo/proxmox-backup-client-manager/commit/2c03b39d7fe88e491eed6fbafb49bd2619a3073a))
* IP-Prüfung des Agent-WebSockets auf inbound_registered_ip umstellen ([3df9a65](https://github.com/stefgo/proxmox-backup-client-manager/commit/3df9a65527d8579c52e94e71f96b1c1463f91aa0))
* **jobs:** Zeitplan durchgaengig in lokaler Zeit lesen und schreiben ([9b169b4](https://github.com/stefgo/proxmox-backup-client-manager/commit/9b169b4ec12ab0babc0a5792ff56de9481c8c1a2))
* Outbound-Client-Dialog auf Fensterhöhe begrenzen ([f8c814a](https://github.com/stefgo/proxmox-backup-client-manager/commit/f8c814aad245b8040c840c7df265e7b88a581dad))
* prevent deletion of tagged container image versions in registry cleanup ([5d14596](https://github.com/stefgo/proxmox-backup-client-manager/commit/5d14596e5014ecf4b646faf1a9c178e59c7166a9))
* **repositories:** Ladefehler anzeigen, Snapshot-Keys eindeutig machen ([8a97a52](https://github.com/stefgo/proxmox-backup-client-manager/commit/8a97a521ef85332ea0940954ee1f356a7de681ed))
* **restore:** Erfolg des Restore-Starts zurueckmelden ([b9a2810](https://github.com/stefgo/proxmox-backup-client-manager/commit/b9a2810065f20f5f0f67eb49eb0227458ea03a3f))
* **restore:** Zielclient im Repository-Restore wieder waehlbar ([5754168](https://github.com/stefgo/proxmox-backup-client-manager/commit/57541686831772a8edd4a1d52150e7385f4c12a2))
* **settings:** Wartungslauf nur noch einmal anbieten ([e9d8b9b](https://github.com/stefgo/proxmox-backup-client-manager/commit/e9d8b9b7a20a2c31f2cfdeef213644b21ecd1a1b))
* tone down restore snapshot header styling ([c461c86](https://github.com/stefgo/proxmox-backup-client-manager/commit/c461c869da8b6712691e7fa184f1d8525fadee8a))
* Tunnel-Lease bei fehlgeschlagenem Preflight freigeben ([df615a8](https://github.com/stefgo/proxmox-backup-client-manager/commit/df615a88f105a3e18c1ed53ca5195761c14e2fbd))
* Tunnel-Marker in der Client-Job-Config persistieren ([2754995](https://github.com/stefgo/proxmox-backup-client-manager/commit/2754995530f13ee70b0d05c5c464b00986bad7ea))
* use parameterized route paths for navigation highlighting ([07e75b1](https://github.com/stefgo/proxmox-backup-client-manager/commit/07e75b15614462dd309335bf30de25071da7bbea))
* **users:** Abbrechen im Benutzerdialog speichert nicht mehr ([f77872f](https://github.com/stefgo/proxmox-backup-client-manager/commit/f77872f8970a6261a18a68053dee082df488da6b))


### Features

* add configurable JWT token expiration via jwtExpiresIn ([c980d7f](https://github.com/stefgo/proxmox-backup-client-manager/commit/c980d7f65217aac3eb8171a59f12fee4df09b97c))
* Agent-Port konfigurierbar und Zieladresse im Editor änderbar ([fc13128](https://github.com/stefgo/proxmox-backup-client-manager/commit/fc13128bc4865b50e461fb52e7aa25324aba5e29))
* **client:** eingehende Server-Nachrichten gegen Zod-Schemas prüfen ([868cfe9](https://github.com/stefgo/proxmox-backup-client-manager/commit/868cfe9644a8461892b7f3aae077df11dfe8bd08))
* **frontend:** zentraler apiFetch mit 401-Behandlung ([36df6b8](https://github.com/stefgo/proxmox-backup-client-manager/commit/36df6b8705f0d5bd79dc49923cd594d3f6836c8f))
* PBS-Zertifikatsfingerprint prüfen, verteilen und aktuell halten ([42af095](https://github.com/stefgo/proxmox-backup-client-manager/commit/42af09572e657c9f46847cf9100b87024a23b8cb))
* SSH-Reverse-Tunnel für Outbound-Clients ([c01d0d1](https://github.com/stefgo/proxmox-backup-client-manager/commit/c01d0d137a559bfe0f17d17272c9fac81e7f47b9))
* SSH-Schlüssel-Assistent für den Tunnel-Setup ([82e2a76](https://github.com/stefgo/proxmox-backup-client-manager/commit/82e2a7613197a195fbe0c4ca32618741c8da0831))
* unhandledRejection und uncaughtException in beiden Entrypoints behandeln ([8519db5](https://github.com/stefgo/proxmox-backup-client-manager/commit/8519db5a1e928ebc85d3013df284153c3612c79f))
