import { WS_EVENTS, HistoryEntry } from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import { Connection } from "../core/Connection.js";
import {
    JobHistoryRepository,
    UnsyncedHistoryRow,
} from "../repositories/JobHistoryRepository.js";

/**
 * Rows per SYNC_HISTORY message. A run's stdout and stderr travel with it, so a first
 * sync of a long history in one message could grow into megabytes.
 */
const BATCH_SIZE = 50;

/**
 * Writes are coalesced: a run touches its row several times within a second (queued,
 * running, finished), and each of them would otherwise be its own message.
 */
const FLUSH_DELAY_MS = 1000;

/**
 * How long a batch that went out may stay unacknowledged before it is offered again. The
 * server withholds the ack for what it failed to store; without a retry those rows would
 * wait for the next run or the next reconnect.
 */
const ACK_RETRY_MS = 60_000;

/**
 * Gets the agent's job history to the server, and knows what arrived.
 *
 * Delivery is at-least-once. Every run carries a revision that JobHistoryRepository
 * raises on each change, and a run is due until the server has acknowledged its current
 * revision with HISTORY_ACK. That replaced a watermark: the server used to name the newest
 * `updated_at` it held, by its own clock, and the agent sent what had changed after it by
 * the agent's clock -- a run the server failed to store, or one written in the same second,
 * fell below the line and was never sent again.
 *
 * Active while connected. The agent no longer syncs with a server that does not
 * acknowledge; the server and the agent are released together.
 */
export class HistorySync {
    private static active = false;
    private static flushTimer: NodeJS.Timeout | null = null;
    private static retryTimer: NodeJS.Timeout | null = null;

    /** Called on AUTH_SUCCESS from a server that acknowledges. Sends what is due. */
    static start(): void {
        this.active = true;
        this.flush();
    }

    /** Called when the connection is gone; the next start() picks up where this left. */
    static stop(): void {
        this.active = false;
        this.clearTimers();
    }

    /** A row changed; send it shortly, together with whatever else changes meanwhile. */
    static schedule(): void {
        if (!this.active || this.flushTimer) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.flush();
        }, FLUSH_DELAY_MS);
        this.flushTimer.unref?.();
    }

    /** Sends the oldest due rows and arms the retry for them. */
    static flush(): void {
        this.clearTimers();
        if (!this.active || !Connection.isConnected()) return;

        let rows: UnsyncedHistoryRow[];
        try {
            rows = JobHistoryRepository.findUnsynced(BATCH_SIZE);
        } catch (err) {
            logger.error({ err }, "Could not read the job history to sync");
            return;
        }
        if (rows.length === 0) return;

        logger.info(`Syncing ${rows.length} history record(s) to server...`);
        Connection.send(WS_EVENTS.SYNC_HISTORY, { history: rows.map(toEntry) });

        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.flush();
        }, ACK_RETRY_MS);
        this.retryTimer.unref?.();
    }

    /**
     * Records what the server stored and sends the next batch, if there is one. Only when
     * the ack moved something forward: an ack that matched no row would otherwise send the
     * same batch straight back, and the retry timer is the pace for that.
     */
    static acknowledge(entries: { id: string; revision: number }[]): void {
        if (entries.length === 0) return;
        let changes: number;
        try {
            changes = JobHistoryRepository.markSynced(entries);
        } catch (err) {
            logger.error({ err }, "Could not record the history acknowledgement");
            return;
        }
        if (changes > 0) this.flush();
    }

    private static clearTimers(): void {
        if (this.flushTimer) clearTimeout(this.flushTimer);
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.flushTimer = null;
        this.retryTimer = null;
    }
}

function toEntry(row: UnsyncedHistoryRow): HistoryEntry {
    return {
        id: row.id,
        jobConfigId: row.job_id,
        name: row.name,
        type: row.type,
        status: row.status,
        startTime: row.start_time,
        endTime: row.end_time,
        exitCode: row.exit_code,
        stdout: row.stdout,
        stderr: row.stderr,
        revision: row.revision,
    };
}

JobHistoryRepository.onChange(() => HistorySync.schedule());
