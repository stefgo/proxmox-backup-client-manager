# [1.6.0](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.5.0...v1.6.0) (2026-10-03)


### Bug Fixes

* **agent:** Check arbitrary server URLs only during registration ([accd11e](https://github.com/stefgo/proxmox-backup-client-manager/commit/accd11e8889cc2022c60d8523a8e61140916835d))
* **agent:** Reject backup and restore arguments that look like options ([6ee6891](https://github.com/stefgo/proxmox-backup-client-manager/commit/6ee6891eef4c77ba36f5a522b9a4018cf56d2a25))
* **auth:** End a user's sessions when the user changes or is deleted ([b8a3ed7](https://github.com/stefgo/proxmox-backup-client-manager/commit/b8a3ed717338dd53315fd527332e4961d408077c))
* **config:** Accept an empty OIDC block while OIDC is off ([cb76514](https://github.com/stefgo/proxmox-backup-client-manager/commit/cb76514f340f285bd1660b846bd141c7a07418c8))
* **deps:** Update fastify to 5.12.5 ([ddcc635](https://github.com/stefgo/proxmox-backup-client-manager/commit/ddcc635e5eae2e7afd0bd80365b768d2ec90acde))
* **docker:** Run the server process as an unprivileged user ([e404a85](https://github.com/stefgo/proxmox-backup-client-manager/commit/e404a85c50dfa028931208b35a112fe327536bc6))
* **history:** Let an agent update only its own runs ([c8559bc](https://github.com/stefgo/proxmox-backup-client-manager/commit/c8559bcb675d58b5418e386c6824c06b6c2fefbe))
* **security:** Replace tunnel.keySecret with secretKey ([205dd0d](https://github.com/stefgo/proxmox-backup-client-manager/commit/205dd0d2930be4d0661254a49a0cd7f0d6397c3d))
* **security:** Store agent tokens and repository secrets protected ([d57de8a](https://github.com/stefgo/proxmox-backup-client-manager/commit/d57de8af8fc9eb65cd44986e0ffe0810dc54c6ce))
* **security:** Trust forwarding headers only from configured proxies ([47b77cb](https://github.com/stefgo/proxmox-backup-client-manager/commit/47b77cb0ca6babe84cff985f2b7bcc3ed3350bba))
* **tunnel:** Only forward to targets of a configured repository ([fd46b78](https://github.com/stefgo/proxmox-backup-client-manager/commit/fd46b780a98e47c6383edaf20aa12e7d272cf263))
* **webhooks:** Keep the template preview as tall as the body template ([8f0d505](https://github.com/stefgo/proxmox-backup-client-manager/commit/8f0d50518f382c70f90959ea463ee5325eef8c2c))
* **webhooks:** Show the last delivery time in plain text with a status badge ([6767f4d](https://github.com/stefgo/proxmox-backup-client-manager/commit/6767f4d55e92044456ac54c981907a73faa44d5d))


### Features

* **config:** Warn about unknown keys in config.yaml at startup ([ed6bf80](https://github.com/stefgo/proxmox-backup-client-manager/commit/ed6bf804a7dffadafb00f20ada2cb256eaaff414))
* **frontend:** Move the drop-key action next to the encryption toggle ([17cb0fe](https://github.com/stefgo/proxmox-backup-client-manager/commit/17cb0fe7b12252d5fe21c7bf664de3621c0c0387))
* **history:** Show the webhook event kind of a finished run ([fce9139](https://github.com/stefgo/proxmox-backup-client-manager/commit/fce9139dfe676481618930dc4bc42ad07cc5134d))
* **webhooks:** Remove the client selection ([3de0e77](https://github.com/stefgo/proxmox-backup-client-manager/commit/3de0e77dbde8bcefc948f61f34f661335c4f39a4))


### BREAKING CHANGES

* **webhooks:** Webhooks that were limited to some clients report the
events of all clients after the update. Rolling migration 19 back does
not restore the selection.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* **security:** Stored SSH tunnel credentials were encrypted with
tunnel.keySecret and can no longer be decrypted. Enter the tunnel
credentials of every client that has one again after the update; until
then, backups through the tunnel fail. A tunnel.keySecret left in
config.yaml is ignored and can be removed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* **security:** GET /v1/repositories no longer returns `secret`, and
job responses return `repository.secret` as "" and `encryption` without
`keyContent`. PUT /v1/repositories keeps the stored secret when `secret`
is empty. POST /v1/clients/:clientId/restore takes `repositoryId`
instead of a `repository` object. config.yaml must be writable when
tunnel.keySecret is generated, and losing tunnel.keySecret now also
loses the repository secrets and the outbound clients' tokens.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* **security:** X-Forwarded-* headers are ignored unless the peer is
listed in security.trusted_proxies or PBCM_TRUSTED_PROXIES. Installations
behind a reverse proxy must list it; otherwise every request appears to
come from the proxy and the session cookie loses its Secure flag behind a
TLS-terminating one.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

# [1.5.0](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0...v1.5.0) (2026-09-30)


### Bug Fixes

* Acknowledge synced job history so no run is lost ([fe6d009](https://github.com/stefgo/proxmox-backup-client-manager/commit/fe6d0098ecbe2bd94f003bdfc53a07d5125a439a))
* Answer 404 when deleting a token that does not exist ([0e31c05](https://github.com/stefgo/proxmox-backup-client-manager/commit/0e31c05457f077be4f6a6854b43e144c28ac7da8))
* **client:** Close the register page once the agent is registered ([bf9ba43](https://github.com/stefgo/proxmox-backup-client-manager/commit/bf9ba43604e2a5c8cd3197af585b3b2ee66788de))
* **client:** Create the temporary keyfile exclusively and sweep leftovers at startup ([057296f](https://github.com/stefgo/proxmox-backup-client-manager/commit/057296fc4ecf9f37bf2b7a4a632e62a33a070506))
* **client:** Keep the data files readable by the agent only ([f6eacab](https://github.com/stefgo/proxmox-backup-client-manager/commit/f6eacabf78f8d3fb8a3192fadc2352f0dd8ec6f3))
* **client:** Name the connection modes from the server's side ([eb7a6e6](https://github.com/stefgo/proxmox-backup-client-manager/commit/eb7a6e64ea6fbd7b0fb66e95d5a0d475a0dc0f4e))
* **client:** Pass the encryption options after the backup and restore subcommands ([059b4cd](https://github.com/stefgo/proxmox-backup-client-manager/commit/059b4cd6d2415767e6c54e2faec134f7e41c3b78))
* **client:** Record runs that fail before they start in the agent's history ([20f080c](https://github.com/stefgo/proxmox-backup-client-manager/commit/20f080c87c9edd00c7dde6d12fc9d0afd812bbd7))
* **clients:** Build the client header from EntityHeader ([7e64632](https://github.com/stefgo/proxmox-backup-client-manager/commit/7e646321e7504cdcca9c01ee81d4e198c7c1231a))
* **clients:** Drop the client ID from the client list ([c5c3bf0](https://github.com/stefgo/proxmox-backup-client-manager/commit/c5c3bf0a723c0335f65b0b15db9ba947492b6f58))
* **clients:** Keep the file browser on the directory it names ([a1d8bd8](https://github.com/stefgo/proxmox-backup-client-manager/commit/a1d8bd8812339dcf22a25edf516db95e09a20cc8))
* **clients:** Move the client ID out of the headers into the content ([e6db439](https://github.com/stefgo/proxmox-backup-client-manager/commit/e6db439317d776e7fc5edbf160c24296db31967d))
* **client:** Tolerate a self-signed server certificate only when configured ([f07ff5e](https://github.com/stefgo/proxmox-backup-client-manager/commit/f07ff5e9f48887837936a2ff9de558fc9a668175))
* Compare the agent's secrets in constant time ([12d6afb](https://github.com/stefgo/proxmox-backup-client-manager/commit/12d6afbb2c655971aacc14b64b24ec11b03c162d))
* **deps:** Update @stefgo/react-ui-components to 4.1.1 ([2895fa6](https://github.com/stefgo/proxmox-backup-client-manager/commit/2895fa6f9c5c35aa5205ef559cc2b131b5ceaf54))
* **deps:** update @stefgo/react-ui-components to version 4.2.0 ([83af6c1](https://github.com/stefgo/proxmox-backup-client-manager/commit/83af6c1f9751f03106e5ee3020ed10c74f0a3e25))
* **deps:** update @stefgo/react-ui-components to version 4.2.1 ([7bc05bb](https://github.com/stefgo/proxmox-backup-client-manager/commit/7bc05bba145e1f59983856bdc0f26e1cbc53916f))
* **docker:** Let the health checks follow the port and scheme actually served ([2dcd678](https://github.com/stefgo/proxmox-backup-client-manager/commit/2dcd678f8b77bacc2389c9e28760d85fbce9c799))
* **frontend:** Keep deep links to clients and repositories on reload ([1bac03b](https://github.com/stefgo/proxmox-backup-client-manager/commit/1bac03b5f109217baa8027fbd2ada4ca9f915bfc))
* **frontend:** Report action results as toasts and pass server errors through ([250ffa6](https://github.com/stefgo/proxmox-backup-client-manager/commit/250ffa67e9bc5d867ac5d9ce0ec25fc5f390e9bc))
* **frontend:** Say that the shown address is the last successful connect ([fb96bc2](https://github.com/stefgo/proxmox-backup-client-manager/commit/fb96bc21b2e421df86200c198b1e15bb44f1f08b))
* **frontend:** Spell the Resources nav group correctly ([09b9fee](https://github.com/stefgo/proxmox-backup-client-manager/commit/09b9feee136dbf316887162b4488de2e2b2d5030))
* **frontend:** Tell an empty list from an empty search ([ef85efe](https://github.com/stefgo/proxmox-backup-client-manager/commit/ef85efeda6261fa0c63545b8b4b05237f2dd44ee))
* **jobs:** Drop the job ID from the job tables ([13edde2](https://github.com/stefgo/proxmox-backup-client-manager/commit/13edde20b678ff5b01c88be8d8d75812d5306fe6))
* **jobs:** State the time window in the Last History title ([7956f50](https://github.com/stefgo/proxmox-backup-client-manager/commit/7956f5031ca12477cf20fd8eb7eeb67e375e4e89))
* Record the disconnect time in last_seen ([1a6fa4e](https://github.com/stefgo/proxmox-backup-client-manager/commit/1a6fa4ecdad503e767ad88796b45c79acedf307f))
* Refuse an encrypted job that has no key instead of backing up in plain text ([63d0de9](https://github.com/stefgo/proxmox-backup-client-manager/commit/63d0de968ba413d7ca6dcef4121a5a870a1873c0))
* Refuse the same things on both agent routes ([902c5a5](https://github.com/stefgo/proxmox-backup-client-manager/commit/902c5a54a5e74571999c54f55b587c7905abeb22))
* **repositories:** Build the repository header from EntityHeader ([48d0473](https://github.com/stefgo/proxmox-backup-client-manager/commit/48d04739a0d8ca4c852b93b20b806889fd8dd570))
* **repositories:** Drop the repository ID from the repository table ([f315de2](https://github.com/stefgo/proxmox-backup-client-manager/commit/f315de2b0fa1f17aa9cc7171f3345d6ac0e7456c))
* **repositories:** Move the repository ID out of the header into the content ([67f5fd2](https://github.com/stefgo/proxmox-backup-client-manager/commit/67f5fd27235cf5aed442122aa608a246189fbc24))
* **restore:** Show the snapshot time in the interface's date format ([8d1f549](https://github.com/stefgo/proxmox-backup-client-manager/commit/8d1f5490de7c04a97b73257c1e0f992550e06497))
* **scheduler:** Keep daily and weekly jobs on their time of day across DST ([926f793](https://github.com/stefgo/proxmox-backup-client-manager/commit/926f793159e0a3dfa8d88bb400f703efed48a64e))
* **scheduler:** Keep the first planned run of a scheduler across restarts ([33afa22](https://github.com/stefgo/proxmox-backup-client-manager/commit/33afa22543c623eb9eb352eccb6b4bfb1aa770e2))
* **server:** Reload the SPA when a chunk from a previous deploy is gone ([8e932b0](https://github.com/stefgo/proxmox-backup-client-manager/commit/8e932b0ff34ac5261c196448977a74d9429968da))
* **tokens:** Compare token expiry as a timestamp, not as text ([6616122](https://github.com/stefgo/proxmox-backup-client-manager/commit/66161224a47de5439833607dd1b3c6984fa18644))


### Features

* Add a health endpoint, container healthchecks and a CI smoke test ([ce58b4e](https://github.com/stefgo/proxmox-backup-client-manager/commit/ce58b4e42563d21516bd67b8ef2c331fd9eece61))
* Ask for the setup PIN in the outbound Add Client wizard ([aaeb187](https://github.com/stefgo/proxmox-backup-client-manager/commit/aaeb187b519dc53d24c628a19abee37c699d3321))
* **client:** Register outbound agents with the setup PIN instead of a config secret ([9b11399](https://github.com/stefgo/proxmox-backup-client-manager/commit/9b11399225577ef36c363fbe20731ceacf5df68b))
* **client:** Serve only the web routes the configuration calls for ([529830e](https://github.com/stefgo/proxmox-backup-client-manager/commit/529830e125daf20f80169fa3b6bbd75b40c546b0))
* **clients:** Show the time zone each agent runs its schedules in ([bd37188](https://github.com/stefgo/proxmox-backup-client-manager/commit/bd37188500d1aac6f7e8a8ee2e4ea08c83b92fb0))
* **data:** ensure data directory is created at startup ([e9d4e51](https://github.com/stefgo/proxmox-backup-client-manager/commit/e9d4e51d52bfc04712818a7582856b0b590f0067))
* Dial outbound agents over TLS ([e9c8137](https://github.com/stefgo/proxmox-backup-client-manager/commit/e9c8137c29a5f0d54c6d263ec22a05a613e3c598))
* **frontend:** Filter the history to failed runs ([0c11170](https://github.com/stefgo/proxmox-backup-client-manager/commit/0c111707b0b6ff5eb30490515605b7409d628048))
* **frontend:** Give the Add Client steps a line on what each one does ([5638001](https://github.com/stefgo/proxmox-backup-client-manager/commit/5638001cc16a98863cb5243039b0633e9fc8f879))
* **frontend:** Give the loading indicator a label and status role ([b7445c0](https://github.com/stefgo/proxmox-backup-client-manager/commit/b7445c02ec9a92ec1fd7dc23f28bbca6eb0b738a))
* **frontend:** Keep every list search in the URL ([2bd1301](https://github.com/stefgo/proxmox-backup-client-manager/commit/2bd130107db639bb257fbda1361975dc9a9437fa))
* **frontend:** Move the tabs onto the library's tab list ([66c930a](https://github.com/stefgo/proxmox-backup-client-manager/commit/66c930ac9c5628c8ec3197e57c8966878cf07496))
* **frontend:** Move the user and token lists to DataMultiView ([9b33353](https://github.com/stefgo/proxmox-backup-client-manager/commit/9b33353565b8b416e3456c889063459f34313753))
* **frontend:** Show a banner and resync when the dashboard socket drops ([1c15681](https://github.com/stefgo/proxmox-backup-client-manager/commit/1c15681de58d90d4e405f8b70409e2bd8116781d))
* **frontend:** Toast job results and flag unseen failures on History ([34e1687](https://github.com/stefgo/proxmox-backup-client-manager/commit/34e1687eae3cf4139ebbbbe84e834d33aeedc410))
* **history:** Store per user when the history was last seen ([9917bb5](https://github.com/stefgo/proxmox-backup-client-manager/commit/9917bb56676511be690570c398426b2f9dde6919))
* **jobs:** Exclude paths from a backup job ([426a293](https://github.com/stefgo/proxmox-backup-client-manager/commit/426a293a12ca35e09e84da11f73407024e55b66f))
* Make the backend port configurable ([a2c514d](https://github.com/stefgo/proxmox-backup-client-manager/commit/a2c514da66c6644d03c5dc2d3a93a43f2ea76ceb))
* Record the snapshot and its details with each backup run ([819b885](https://github.com/stefgo/proxmox-backup-client-manager/commit/819b885ad64ff036b79fc448b25b6cb46b95b217))
* Report a registration the agent could not store ([5fdf11a](https://github.com/stefgo/proxmox-backup-client-manager/commit/5fdf11a2a96ab9c614e95c74dabdcd06b3044d16))
* Report finished runs and lost clients to webhooks ([74e1b3d](https://github.com/stefgo/proxmox-backup-client-manager/commit/74e1b3dff0ed7b77b4abf654568ea37af5dd2600))
* **settings:** add cleanup endpoints for invalid tokens and job history ([0706b2d](https://github.com/stefgo/proxmox-backup-client-manager/commit/0706b2d7a75074de047d6212c86641ee4c418776))
* **settings:** enhance layout and add save button in settings panel ([b5f22e0](https://github.com/stefgo/proxmox-backup-client-manager/commit/b5f22e06f0c18da3d9fca2184680f1fbaafe1fa3))
* **settings:** Persist the state of every server scheduler ([132bdcf](https://github.com/stefgo/proxmox-backup-client-manager/commit/132bdcf26f8c030f7b73952dd28f748bb5942173))
* Show only the client name in the client list ([ad582e3](https://github.com/stefgo/proxmox-backup-client-manager/commit/ad582e31be119c462d337f348432431d89425ab3))
* Show the last activity of each job on the jobs page ([55bfae6](https://github.com/stefgo/proxmox-backup-client-manager/commit/55bfae650b3d548bc5d000fd4d1ecbf2b08a9427))
* Show the snapshot of a backup run in its log ([624db13](https://github.com/stefgo/proxmox-backup-client-manager/commit/624db135bd648a230190e85122bbb7bf1d5b9874))
* **tokens:** Store registration tokens as SHA-256 hashes only ([60f0d93](https://github.com/stefgo/proxmox-backup-client-manager/commit/60f0d93273082fa2f14efe78fb7548fcb96ee547))
* **vscode:** add npm task for starting the backend server ([509eb86](https://github.com/stefgo/proxmox-backup-client-manager/commit/509eb869cb8049c68e1602e13d12132eeb483f5c))


### BREAKING CHANGES

* **tokens:** GET /api/v1/tokens returns tokenHash instead of token, and
DELETE /api/v1/tokens/:tokenHash takes the hash instead of the token.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* **settings:** retention_invalid_tokens_days is renamed to
token_retention_days without carrying the value over, and
retention_invalid_tokens_count is dropped. The server removes both keys
from config.yaml at startup. New keys token_cleanup_interval_hours and
job_history_cleanup_interval_hours default to 24; the nightly run at
midnight is gone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* **client:** registrationSecret in the agent's config.yaml is no longer
read; an agent that still has it logs a warning and waits for the setup PIN or
PBCM_REGISTRATION_SECRET instead. Agents that are already registered are not
affected.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* **client:** An agent that registers with or connects to a PBCM server
with a self-signed certificate needs allowSelfSignedCertificates: true in its
config.yaml. Registration against such a server used to succeed without it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

# [1.4.0](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.3.2...v1.4.0) (2026-09-09)


### Bug Fixes

* Aktions-Icons im Job-Editor sind dauerhaft sichtbar ([d9753b7](https://github.com/stefgo/proxmox-backup-client-manager/commit/d9753b73aa61ca55d48f41e58532053594209282))
* Aktionsspalte heisst in allen Tabellen "Actions" ([d6cae83](https://github.com/stefgo/proxmox-backup-client-manager/commit/d6cae835d11881f31648beb63b9eea3108926e6d))
* **auth:** login memoisieren, Job-Subscription stabil halten ([b11b974](https://github.com/stefgo/proxmox-backup-client-manager/commit/b11b9742818e7d0b2164097a5f789a9884b96c03))
* **backend:** Message-Listener in sendRequest auf allen Pfaden abmelden ([53fa2d4](https://github.com/stefgo/proxmox-backup-client-manager/commit/53fa2d4c9e53c998fca7f23f15485cebde4e569d))
* **backend:** Ping-Intervall unauthentifizierter Dashboard-Sockets freigeben ([a764aa3](https://github.com/stefgo/proxmox-backup-client-manager/commit/a764aa3cb16998b44a10e0323733a5e7bf7028e2))
* **backend:** REST-Endpunkte validieren ihre Eingaben ([b70670b](https://github.com/stefgo/proxmox-backup-client-manager/commit/b70670bc98565bf810fa8920fac88aa589f967ee))
* **client:** Fehlermeldung der Registrierung nennt das betroffene Feld ([8ce8552](https://github.com/stefgo/proxmox-backup-client-manager/commit/8ce8552b84fed46ab4f6dcc9b25e018aa2204968))
* **client:** Job-Slot auf allen Exit-Pfaden von executeBackup freigeben ([f798b3d](https://github.com/stefgo/proxmox-backup-client-manager/commit/f798b3d435334c6871fa48e357e0a989b069c673))
* **client:** Jobs mit unbrauchbarem Zeitplan überspringen statt endlos zu triggern ([6dd874e](https://github.com/stefgo/proxmox-backup-client-manager/commit/6dd874e24489a2d67ff11cbbe081d08961f6dcd8))
* **client:** Log-Puffer und Log-Frames sind gedeckelt ([21d1143](https://github.com/stefgo/proxmox-backup-client-manager/commit/21d114394906cf543bc73586db457ee2ac7bfb2e))
* **client:** Pre-/Post-Script ohne Shell ausführen ([753fdc0](https://github.com/stefgo/proxmox-backup-client-manager/commit/753fdc00f47814ba1e5a78e3866fdd82bb6306cb))
* **client:** Reconnect nutzt Backoff mit Jitter ([125d616](https://github.com/stefgo/proxmox-backup-client-manager/commit/125d616e2d2637ed6b49eaae186c8118a34f2277))
* **clients:** Tunnel-Fehler dort zeigen, wo sie entstehen ([21bdcc0](https://github.com/stefgo/proxmox-backup-client-manager/commit/21bdcc0fa80b54025f8dbb10a11a68277da84ac3))
* **client:** temporäres Keyfile nach jedem Backup-Lauf löschen ([44eb3ba](https://github.com/stefgo/proxmox-backup-client-manager/commit/44eb3ba8a381c030ea8ec5e60dee887759bb1f4b))
* **client:** Zeitplan beim Lesen aus SQLite gegen das Schema validieren ([21138f9](https://github.com/stefgo/proxmox-backup-client-manager/commit/21138f9685ff710fdb92291a5a25cc4db7c77f28))
* **client:** Zeitplan-Rückstand in einem Schritt aufholen statt Tick für Tick ([26d1552](https://github.com/stefgo/proxmox-backup-client-manager/commit/26d155263b3c30378a606d6d9e71a040c538600a))
* **deps:** 13 Sicherheitslücken per npm audit fix schließen ([4662312](https://github.com/stefgo/proxmox-backup-client-manager/commit/4662312dc30bd547a7fddb67a217d8cb167501ac))
* **deps:** update @stefgo/react-ui-components to 2.11.2 ([204e039](https://github.com/stefgo/proxmox-backup-client-manager/commit/204e039bc2765708a7e77a243560aa9b5af71191))
* **frontend:** Einstellungsseite im Dark Mode lesbar machen ([659764b](https://github.com/stefgo/proxmox-backup-client-manager/commit/659764b5ea061486484c78f5aeb4bcd9ffa77c11)), closes [#444444](https://github.com/stefgo/proxmox-backup-client-manager/issues/444444)
* **frontend:** Fokusring und Rahmenfarben in allen Ansichten korrigieren ([957ce52](https://github.com/stefgo/proxmox-backup-client-manager/commit/957ce52898532d9ec5e5fc3f0c6ae2fd2b103966))
* **frontend:** Listen sortieren ueber die volle Menge, Tokens blaetterbar ([cf22ac4](https://github.com/stefgo/proxmox-backup-client-manager/commit/cf22ac4a24dcdbf620831cf75cd73481be71877a))
* Hänger beim Anlegen eines Outbound-Clients ([5c130d4](https://github.com/stefgo/proxmox-backup-client-manager/commit/5c130d442b0b15c4142e15c838e59f8ce5f368e9))
* **hooks:** Dependency-Arrays vervollstaendigen, Snapshot-Nachladen entkoppeln ([2c03b39](https://github.com/stefgo/proxmox-backup-client-manager/commit/2c03b39d7fe88e491eed6fbafb49bd2619a3073a))
* IP-Prüfung des Agent-WebSockets auf inbound_registered_ip umstellen ([3df9a65](https://github.com/stefgo/proxmox-backup-client-manager/commit/3df9a65527d8579c52e94e71f96b1c1463f91aa0))
* Job-Anzahl in der Sidebar folgt dem Client-Status ([374658d](https://github.com/stefgo/proxmox-backup-client-manager/commit/374658daac7d9566a82dfbbe71b0283097f62967))
* **jobs:** Zeitplan durchgaengig in lokaler Zeit lesen und schreiben ([9b169b4](https://github.com/stefgo/proxmox-backup-client-manager/commit/9b169b4ec12ab0babc0a5792ff56de9481c8c1a2))
* Live-History zeigt den Client-Namen statt "Unknown Client" ([55f969e](https://github.com/stefgo/proxmox-backup-client-manager/commit/55f969eb342f5c0137b39178c12042eb8c16f0b3))
* Outbound-Client-Dialog auf Fensterhöhe begrenzen ([f8c814a](https://github.com/stefgo/proxmox-backup-client-manager/commit/f8c814aad245b8040c840c7df265e7b88a581dad))
* prevent deletion of tagged container image versions in registry cleanup ([5d14596](https://github.com/stefgo/proxmox-backup-client-manager/commit/5d14596e5014ecf4b646faf1a9c178e59c7166a9))
* **repositories:** Ladefehler anzeigen, Snapshot-Keys eindeutig machen ([8a97a52](https://github.com/stefgo/proxmox-backup-client-manager/commit/8a97a521ef85332ea0940954ee1f356a7de681ed))
* **restore:** Erfolg des Restore-Starts zurueckmelden ([b9a2810](https://github.com/stefgo/proxmox-backup-client-manager/commit/b9a2810065f20f5f0f67eb49eb0227458ea03a3f))
* **restore:** Zielclient im Repository-Restore wieder waehlbar ([5754168](https://github.com/stefgo/proxmox-backup-client-manager/commit/57541686831772a8edd4a1d52150e7385f4c12a2))
* **server:** Anmeldung wird auf 10 Versuche je 15 Minuten begrenzt ([0c479ef](https://github.com/stefgo/proxmox-backup-client-manager/commit/0c479efc883d3223b0fc5f023f8b532b5c033d12))
* **server:** CORS spiegelt keine fremden Origins mehr und Token laufen ab ([bf6473f](https://github.com/stefgo/proxmox-backup-client-manager/commit/bf6473fe02030347e6c86d617cbf9773f129d79a))
* **server:** Sicherheitskopfzeilen ueber helmet ([7980971](https://github.com/stefgo/proxmox-backup-client-manager/commit/7980971d3c12f47d9d84778671669a895438e5d2))
* **server:** Tunnel-Slots werden gezaehlt statt aus dem Zustand abgeleitet ([2a7a11b](https://github.com/stefgo/proxmox-backup-client-manager/commit/2a7a11ba966e3d4605dea4cfc6ffc7a2dd1d4878))
* **settings:** Wartungslauf nur noch einmal anbieten ([e9d8b9b](https://github.com/stefgo/proxmox-backup-client-manager/commit/e9d8b9b7a20a2c31f2cfdeef213644b21ecd1a1b))
* **tailwind:** update content configuration to include preset's content ([c4ae653](https://github.com/stefgo/proxmox-backup-client-manager/commit/c4ae653246612507ce9939e94ac2eb9fbe30afff))
* tone down restore snapshot header styling ([c461c86](https://github.com/stefgo/proxmox-backup-client-manager/commit/c461c869da8b6712691e7fa184f1d8525fadee8a))
* Tunnel-Lease bei fehlgeschlagenem Preflight freigeben ([df615a8](https://github.com/stefgo/proxmox-backup-client-manager/commit/df615a88f105a3e18c1ed53ca5195761c14e2fbd))
* Tunnel-Marker in der Client-Job-Config persistieren ([2754995](https://github.com/stefgo/proxmox-backup-client-manager/commit/2754995530f13ee70b0d05c5c464b00986bad7ea))
* use parameterized route paths for navigation highlighting ([07e75b1](https://github.com/stefgo/proxmox-backup-client-manager/commit/07e75b15614462dd309335bf30de25071da7bbea))
* **users:** Abbrechen im Benutzerdialog speichert nicht mehr ([f77872f](https://github.com/stefgo/proxmox-backup-client-manager/commit/f77872f8970a6261a18a68053dee082df488da6b))


### Features

* add clientName prop to ClientTunnelCard and update ClientTunnelEditor to use it ([ddb126b](https://github.com/stefgo/proxmox-backup-client-manager/commit/ddb126b57a464681b90edc23f513b9fb51848b08))
* add configurable JWT token expiration via jwtExpiresIn ([c980d7f](https://github.com/stefgo/proxmox-backup-client-manager/commit/c980d7f65217aac3eb8171a59f12fee4df09b97c))
* Adresspruefung eines Inbound-Clients ist abschaltbar ([662da60](https://github.com/stefgo/proxmox-backup-client-manager/commit/662da60e651770cb76f4cad37fef2e37ecec0321))
* Agent-Port konfigurierbar und Zieladresse im Editor änderbar ([fc13128](https://github.com/stefgo/proxmox-backup-client-manager/commit/fc13128bc4865b50e461fb52e7aa25324aba5e29))
* Client-Assistent für beide Verbindungsarten ([1636bde](https://github.com/stefgo/proxmox-backup-client-manager/commit/1636bdecef10d79495014d968935418517268409))
* Client-Overview zeigt den Tunnel und laesst sich per Esc verlassen ([f9c0d95](https://github.com/stefgo/proxmox-backup-client-manager/commit/f9c0d955415553fa3c71f72aa86c0a8be15e3200))
* **client:** eingehende Server-Nachrichten gegen Zod-Schemas prüfen ([868cfe9](https://github.com/stefgo/proxmox-backup-client-manager/commit/868cfe9644a8461892b7f3aae077df11dfe8bd08))
* **client:** Registrierung verlangt eine Setup-PIN ([8e4fb61](https://github.com/stefgo/proxmox-backup-client-manager/commit/8e4fb619c407dc9e97ccdef3cc13881a866a453f))
* **clients:** Add-Client-Wizard mit Escape verlassen ([988c893](https://github.com/stefgo/proxmox-backup-client-manager/commit/988c893b5a3e3a925418fc5435a0b576f26874d5))
* **clients:** Ausstieg aus dem Client-Editor an eine Sticky-Leiste geben ([06286d0](https://github.com/stefgo/proxmox-backup-client-manager/commit/06286d0e361cba63297ff563d9a14cab142cd73c))
* **clients:** Client-Editor in Identitäts- und Tunnel-Card trennen ([2b7006f](https://github.com/stefgo/proxmox-backup-client-manager/commit/2b7006fcb099bf1399edd0f024436d237e7da5a4))
* **clients:** SSH-Tunnel als eigene Seite mit eigenem Weg hinein ([5bd416d](https://github.com/stefgo/proxmox-backup-client-manager/commit/5bd416d795f5196d1d8150b98e85b3836cf1262c))
* erlaubte IP eines Inbound-Clients ist editierbar ([cbdd624](https://github.com/stefgo/proxmox-backup-client-manager/commit/cbdd6240e8707bac96f48b54b44821495b3e6518))
* **frontend:** Sicherheitsabfrage vor dem Löschen von Client, Repository, Job und User ([e9c53c3](https://github.com/stefgo/proxmox-backup-client-manager/commit/e9c53c3266f7567193dd87d5d2ac93a85ff603a2))
* **frontend:** zentraler apiFetch mit 401-Behandlung ([36df6b8](https://github.com/stefgo/proxmox-backup-client-manager/commit/36df6b8705f0d5bd79dc49923cd594d3f6836c8f))
* Job-Editor bekommt eigene Routen und einen waehlbaren Client ([0ef0f34](https://github.com/stefgo/proxmox-backup-client-manager/commit/0ef0f343d07a27ecb5655bdb2b6fc19edbfc84ad))
* Job-Editor speichert und schliesst wie der Client-Editor ([3e70042](https://github.com/stefgo/proxmox-backup-client-manager/commit/3e700427b45a2128edb43f4cf8db1e86ad13e727))
* PBS-Zertifikatsfingerprint prüfen, verteilen und aktuell halten ([42af095](https://github.com/stefgo/proxmox-backup-client-manager/commit/42af09572e657c9f46847cf9100b87024a23b8cb))
* Repository-Detailseite bekommt ein Aktionsmenue mit Editor-Route ([8bb7814](https://github.com/stefgo/proxmox-backup-client-manager/commit/8bb78147465d9417f95fd70d9c66b691fcd73eb2))
* Repository-Editor speichert und schliesst wie der Client-Editor ([a177a47](https://github.com/stefgo/proxmox-backup-client-manager/commit/a177a471ed631514fd327ec383f229652fe3aff0))
* Server vergibt die Client-Identity und prueft sie bei jeder Verbindung ([8451177](https://github.com/stefgo/proxmox-backup-client-manager/commit/84511771450d925d23babdac256193c79899be9d))
* **server:** Anmeldung nutzt ein httpOnly-Cookie statt eines Bearer-Tokens ([3e61516](https://github.com/stefgo/proxmox-backup-client-manager/commit/3e6151628cf1b2d63544a89cb4acd06f8d7b6266))
* SSH-Reverse-Tunnel für Outbound-Clients ([c01d0d1](https://github.com/stefgo/proxmox-backup-client-manager/commit/c01d0d137a559bfe0f17d17272c9fac81e7f47b9))
* SSH-Schlüssel-Assistent für den Tunnel-Setup ([82e2a76](https://github.com/stefgo/proxmox-backup-client-manager/commit/82e2a7613197a195fbe0c4ca32618741c8da0831))
* SSH-Tunnel von der Verbindungsart entkoppeln ([f848525](https://github.com/stefgo/proxmox-backup-client-manager/commit/f8485252419d6b0305bef429b06d9c66d6fd64e2))
* trusted_networks entfaellt, Agent prueft erlaubte Netze ([0d31805](https://github.com/stefgo/proxmox-backup-client-manager/commit/0d318053948e29fc49a113ca9da801451a83fea2))
* unhandledRejection und uncaughtException in beiden Entrypoints behandeln ([8519db5](https://github.com/stefgo/proxmox-backup-client-manager/commit/8519db5a1e928ebc85d3013df284153c3612c79f))

# [1.4.0-beta.13](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.12...v1.4.0-beta.13) (2026-09-09)


### Features

* **frontend:** Sicherheitsabfrage vor dem Löschen von Client, Repository, Job und User ([e9c53c3](https://github.com/stefgo/proxmox-backup-client-manager/commit/e9c53c3266f7567193dd87d5d2ac93a85ff603a2))

# [1.4.0-beta.12](https://github.com/stefgo/proxmox-backup-client-manager/compare/v1.4.0-beta.11...v1.4.0-beta.12) (2026-09-08)


### Bug Fixes

* Job-Anzahl in der Sidebar folgt dem Client-Status ([374658d](https://github.com/stefgo/proxmox-backup-client-manager/commit/374658daac7d9566a82dfbbe71b0283097f62967))

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
