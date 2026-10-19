<!--
The hand-written part of the next release: what is new, why it matters, and
what an upgrade needs. It is placed above the list of commits in the GitHub
release and in CHANGELOG.md.

Write below this comment. Use "###" for headings -- "##" is the level of the
version itself. A release with nothing written here is refused. A beta from
dev keeps the text; the stable release from main empties this file again.

Nothing inside an HTML comment is published.
-->

### A new client is there before its agent

Adding an inbound client now creates it right away, under the name you give it, marked
*Awaiting registration*; the registration token is part of that client. When the token runs
out, the client's page issues a new one, and an SSH tunnel can be set up before the agent
registers. The *Client Tokens* page and its retention settings are gone -- there is nothing
left to tidy up.

### A reinstalled agent keeps its client -- and its snapshots

*Re-register Agent* in a client's menu issues a token for a client that is already
registered. The agent that registers with it takes the client over: the same id, and with it
the same PBS backup id, so its snapshots stay in one group, along with its tunnel and
history. Before, every new registration created a new client and started a new snapshot
group. The jobs live on the agent and have to be set up again on a reinstalled one.

### Wrapped text in tables sits closer

Text that wraps onto a second line in a table cell now sits as closely as text anywhere else
in the application; its lines were further apart than the text's size called for. Rows of a
single line are a little lower than before.

### Labels in the list view line up

In the list view, which shows each row as a card of labels and values, every value of a
row now starts at the same edge. A long label wraps instead of pushing its value aside, so
on a narrow screen it no longer runs out of the row.

### Upgrading

- Registration tokens issued before the upgrade no longer work. Add the client again, or
  generate a new token on a waiting client. The `/api/v1/tokens` endpoints are replaced by
  `POST /api/v1/clients/inbound`, and `token_retention_days` and
  `token_cleanup_interval_hours` can be deleted from `config.yaml`.
- The webhook template engine now comes from a package the stefgo projects share, and the
  dependencies were brought up to date.
