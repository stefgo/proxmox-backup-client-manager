# 🪝 Webhooks

PBCM can report the runs of your backup jobs, and clients that lose their connection, to
external services — a chat channel, a push service, an incident tool, a script of your own.
Each webhook sends a **JSON body you write yourself**, with placeholders for the event that
triggered it.

Webhooks are managed on the **Webhooks** page in the sidebar, under Administration. The API is
described under [Webhooks in the API reference](api.md#-webhooks).

## Who sends them

**The server** keeps the webhooks and sends them. The client agents take no part: they report
their runs to the server as they always do, and the server sends the webhooks when a run
arrives.

- An agent keeps every run until the server has acknowledged it. A run that ends while the
  server is down or unreachable is reported **once the agent is connected again** — late, but
  not lost. `event.occurredAt` is when the run ended, not when the webhook was sent. The
  exception is a long outage: an agent holds at most 500 undelivered runs and drops the
  oldest beyond that, and a dropped run sends no webhook.
- The requests leave from **the server's network**. A target has to be reachable from the
  server, not from the clients.

## When a webhook fires

An event is sent to every enabled webhook whose filters it passes; a webhook covers the
events of all clients. There are two kinds of event.

**A run of a backup or restore job ended:**

| Kind | The run… | Level |
| :--- | :------- | :---- |
| `job.succeeded` | finished successfully — for a backup, once the agent has read back the snapshot it created, so the event carries it | `info` |
| `job.failed` | failed — the backup itself, or before it started: a job whose configuration does not resolve, a failed pre-script, a tunnel that could not be opened | `error` |
| `job.aborted` | was cut short, e.g. because the agent restarted while it ran; reported when the agent comes back. A backup whose snapshot the agent then finds finished on the PBS is reported as `job.succeeded` instead | `warning` |
| `job.skipped` | did not start because the same job was already running and another run already queued | `warning` |

**A client lost its connection:**

| Kind | The client… | Level |
| :--- | :---------- | :---- |
| `client.disconnected` | has been disconnected for two minutes | `warning` |
| `client.reconnected` | is connected again, after a `client.disconnected` was sent | `info` |

The two minutes are a grace period: an agent retries after 5 s, 10 s, 30 s and then every
minute, so a short network outage, a restart or an update of the agent is over before anything
is sent. Since `client.reconnected` is `info`, the default minimum level `warning` does not
send it — set the level to `info` and narrow the kinds (`client.*`) for a webhook that should
report both.

The connection state is kept in the server's memory. After a **server restart**, a client that
never reconnects is not reported, and one that reconnects gets no `client.reconnected`.

The filters:

- **Minimum level** — `info`, `warning` or `error`. The default, `warning`, covers failed,
  aborted and skipped runs and lost clients.
- **Event kinds** — a comma-separated list of patterns, `*` as wildcard: `job.failed`,
  `job.a*`, `client.*`. Empty means every kind.

Each run is reported once. The server reports a run when it stores a final state the run did
not have before — whether that arrives live, with the history sync after an outage, or both —
so neither a reconnect nor the history sync can send it twice. The one exception is
deliberate: a successful run whose **post-script fails** is turned into a failed run
afterwards, and that is reported too — first `job.succeeded`, then `job.failed`.

## Delivery

- `POST` (or `PUT`) with `Content-Type: application/json` and the headers you configured.
- Per attempt the configured timeout applies (default 10 s). When nothing answers, or the
  target answers 5xx or 429, the delivery is tried twice more, after 1 s and 5 s.
- Events are sent to one target in the order they reached the server. After an outage, an
  agent hands over its runs at once; they are sent one after another.
- The list and the editor show the outcome of the last delivery.
- A failure is logged on the server, never with its headers.
- There is no persistent queue. A server restart during a retry loses that delivery; the run
  itself stays in the history.

## Templates

A template is **valid JSON** with `{{…}}` placeholders in its strings. It is filled in on the
parsed JSON, never as text, so a quote or a brace in a run's error output cannot break the body.

| Written as | Becomes |
| :--------- | :------ |
| `"{{event.data}}"` — a string that is only one placeholder | The value **with its type**: an object stays an object, a number a number, a missing value `null`. |
| `"{{client.name}}: {{event.message}}"` — a placeholder inside text | Text. A missing value is empty, an object is written as JSON. |
| `{{event.detail \| default("–")}}` | The fallback when the value is missing, `null` or empty. The fallback is a JSON value (`"text"`, `0`, `null`) or text in single quotes (`'text'`). More [filters](#filters) below. |
| `{ "{{event.kind}}": … }` | Placeholders work in keys too, as text. |

Placeholders also work in the **URL** and in **header values**, always as text.

A path must start with `event`, `client` or `webhook`; anything else is refused when the
webhook is saved, as is a template that is not valid JSON or longer than 64 KiB. The editor
shows a live preview rendered with a sample event — the preview uses the same code the server
sends with — and **Send Test** has the server deliver that sample to the target. The sample
follows the webhook's event kinds: the first of `job.failed`, `job.succeeded`, `job.aborted`,
`job.skipped`, `client.disconnected` and `client.reconnected` one of them matches,
`job.failed` when none does.

### What a template can read

| Placeholder | Content |
| :---------- | :------ |
| `event.message` | A sentence to lead with, e.g. `Backup "Daily /home" failed`, `Client has been disconnected for 120 s` |
| `event.detail` | The last line of the run's error output — for proxmox-backup-client the `Error: …` line; `null` for a successful run, one without output, and client events |
| `event.kind` | `job.succeeded`, `job.failed`, `job.aborted`, `job.skipped`, `client.disconnected`, `client.reconnected` |
| `event.level` | `info`, `warning` or `error` |
| `event.occurredAt` | Runs: when the run ended, on the client's clock. Clients: when the connection closed (`client.disconnected`) or was back (`client.reconnected`), on the server's clock. ISO 8601 |
| `event.id` | The id of the run, or of the client event |
| `event.data` | Runs: `{ runId, jobId, jobName, type, status, startTime, endTime, durationSeconds, exitCode, snapshot, snapshotError }`. Clients: `{ clientId, disconnectedAt, reconnectedAt, durationSeconds }`. Single fields as `event.data.jobName` |
| `event.data.type` | `backup` or `restore` |
| `event.data.status` | The run's status as the history shows it: `success`, `failed`, `abort`, `skipped` |
| `event.data.exitCode` | Exit code of proxmox-backup-client; `null` when it never ran |
| `event.data.durationSeconds` | How long the run took, or how long the client was gone |
| `event.data.snapshot` | A backup's snapshot: `{ id, size, archives: [{ name, size, cryptMode }] }`, sizes in bytes (`size` is the logical size, what a restore yields). `null` for a restore, a failed backup, or one whose snapshot could not be read |
| `event.data.snapshotError` | Why a successful backup has no `snapshot`; else `null`. The event stays `job.succeeded` |
| `client.name` | Display name, else hostname |
| `client.hostname` | Hostname reported by the agent |
| `client.id` | Client id |
| `webhook.name` | The webhook's own name |

An array element is reached by its position: `something.0.field`.

### Filters

Filters follow the path, separated by `|`, and run left to right. They work everywhere a
placeholder does, URL and headers included.

| Filter | Does |
| :----- | :--- |
| `default(<value>)` | The value when the one before is missing, `null` or empty |
| `join(", ")` | An array as text, its items separated by the given text (`", "` when left out). Objects in it are written as JSON. |
| `map("field")` | From an array of objects, the one field of each |
| `upper`, `lower` | Text in upper or lower case |

```text
{{event.detail | default('no output')}}   → Error: unable to open chunk store …
{{event.data.type | upper}}               → BACKUP
{{client.name | lower}}                   → fileserver
```

A filter handed a value it cannot work on — `join` on a number, `upper` on an object — passes
it on unchanged. An unknown filter is refused when the webhook is saved.

### Conditions and loops

For what a single placeholder cannot say — a line only when there is an error, a different
title per outcome — a template uses **directives**: JSON objects with a key starting with `$`.
They borrow their names from [JSON-e](https://json-e.js.org/), and like everything else they
work on the parsed JSON, so they cannot break it either.

**`$if`** — takes `then` when the condition holds, else `else`:

```json
{
    "error": { "$if": "event.detail", "then": "{{event.detail}}" },
    "icon": { "$if": "event.kind == 'job.succeeded'", "then": "✅", "else": "❌" }
}
```

A branch that is left out drops what the directive stands for: the key in an object, the
item in an array (`null` for a whole template). The condition is one of

| Condition | Holds when |
| :-------- | :--------- |
| `path` | the value is there and not `null`, `""`, `false`, `0` or an empty array |
| `!path` | it is not |
| `path == 'job.failed'`, `path != 'job.failed'` | the value is, or is not, equal to the one given — as a JSON value (`"job.failed"`, `255`, `true`, `null`) or text in single quotes. `255` and `'255'` are not equal. |

There is nothing beyond these: no `and`, no `or`, no arithmetic. Two conditions are two
nested `$if`s.

**`$map`** — one item per element of an array, rendered with `each(name)`, in which `name`
is the element; `each(name, index)` adds its position, counted from 0. The path names the
array without braces (`"{{…}}"` is accepted too) and may carry filters. Anything but an array
gives `[]`. A name may not be `event`, `client`, `webhook` or one already in use. A job run
carries no arrays today, so `$map` is there for the day it does.

**`$join`** — renders what it holds and joins the resulting array into text, separated by
`with` (nothing when left out). That is how several parts become one message:

```json
{
    "content": {
        "$join": [
            "**{{event.message}}** on {{client.name}}",
            { "$if": "event.detail", "then": "\n\n`{{event.detail}}`" },
            "\n\nStarted {{event.data.startTime}}, took {{event.data.durationSeconds}} s"
        ]
    }
}
```

- An object holding a directive may hold only that directive's own keys (`then`/`else`,
  `each(…)`, `with`); two directives in one object are refused.
- Directives nest at most 8 deep, so a template always finishes.
- A key that has to reach the target starting with `$if`, `$map` or `$join` is written with a
  second `$`: `"$$if"` is sent as `"$if"`. Other `$` keys, such as `$schema`, are sent as
  written.

## Examples

**Slack / Mattermost incoming webhook** — event kinds `job.failed, job.aborted`

```json
{
    "text": ":rotating_light: *{{client.name}}* — {{event.message}}\n`{{event.detail | default('no output')}}`"
}
```

**Microsoft Teams (workflow webhook)**

```json
{
    "type": "message",
    "attachments": [{
        "contentType": "application/vnd.microsoft.card.adaptive",
        "content": {
            "type": "AdaptiveCard",
            "version": "1.4",
            "body": [
                { "type": "TextBlock", "weight": "Bolder", "text": "{{client.name}} ({{event.level}})" },
                { "type": "TextBlock", "wrap": true, "text": "{{event.message}}" },
                { "$if": "event.detail", "then": { "type": "TextBlock", "wrap": true, "fontType": "Monospace", "text": "{{event.detail}}" } }
            ]
        }
    }]
}
```

**Gotify** — URL `https://gotify.example.com/message`, header `X-Gotify-Key: <app token>`

```json
{
    "title": "{{client.name}}: {{event.message}}",
    "message": "{{event.detail | default('Finished without errors.')}}",
    "priority": { "$if": "event.level == 'error'", "then": 8, "else": 4 }
}
```

**ntfy** — URL `https://ntfy.sh/` (or your own server). ntfy reads a JSON body when it is
posted to the server root, with the topic in it:

```json
{
    "topic": "<topic>",
    "title": "{{event.message}}",
    "message": "{{client.name}}: {{event.detail | default('no output')}}",
    "tags": [{ "$if": "event.kind == 'job.succeeded'", "then": "white_check_mark", "else": "warning" }],
    "priority": { "$if": "event.level == 'error'", "then": 4, "else": 3 }
}
```

**Your own endpoint**, with the complete run

```json
{
    "source": "pbcm",
    "client": { "id": "{{client.id}}", "name": "{{client.name}}", "hostname": "{{client.hostname}}" },
    "event": {
        "id": "{{event.id}}",
        "kind": "{{event.kind}}",
        "level": "{{event.level}}",
        "at": "{{event.occurredAt}}",
        "message": "{{event.message}}",
        "detail": "{{event.detail}}",
        "data": "{{event.data}}"
    }
}
```

## Security

- Header values — typically a token — are stored **in the clear** in the server database and
  shown in the editor to every user who can log in. They never reach the clients. Everyone
  with a login can manage webhooks, just as they can manage everything else.
- The server makes the requests, so a webhook can reach whatever the server can reach,
  internal addresses included. That is intended for targets on the internal network; keep it
  in mind when handing out logins. **Send Test** has the same reach.
- The logs name a failing webhook and the reason, never its headers.
