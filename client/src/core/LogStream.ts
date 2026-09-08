import { WS_EVENTS } from "@pbcm/shared";
import { Connection } from "./Connection.js";

/**
 * Batches LOG_UPDATE frames on their way to the dashboard.
 *
 * A subprocess hands us output in whatever sizes the pipe produces — often a line at a
 * time. Forwarding each one as its own WebSocket frame turned a chatty backup into
 * thousands of tiny messages, all of which the server then fans out to every open
 * dashboard.
 *
 * Batching is safe here because these frames are display-only: the dashboard appends them
 * to a log panel. What must *not* slip is their order against the run's STATUS_UPDATE, so
 * the Executor flushes before reporting a run finished.
 */

/** Long enough to collect a burst, short enough that a live log still feels live. */
const FLUSH_INTERVAL_MS = 250;

/** Send early once a batch reaches this size, so a noisy run does not build a huge frame. */
const FLUSH_THRESHOLD_BYTES = 8 * 1024;

export class LogStream {
    private stdout = "";
    private stderr = "";
    private timer: NodeJS.Timeout | null = null;

    constructor(private readonly runId: string) {}

    push(channel: "stdout" | "stderr", chunk: string): void {
        if (!chunk) return;

        if (channel === "stdout") this.stdout += chunk;
        else this.stderr += chunk;

        if (this.stdout.length + this.stderr.length >= FLUSH_THRESHOLD_BYTES) {
            this.flush();
            return;
        }

        // A single timer for both channels: it is a deadline for the batch, not a
        // per-chunk debounce, so a stream that never pauses still gets sent every 250ms.
        if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
        }
    }

    /**
     * Sends whatever has accumulated. Call before any message that has to arrive after
     * the log — the final STATUS_UPDATE in particular.
     */
    flush(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        // stdout first: within one batch that is the order the two were produced in
        // often enough, and a fixed order at least makes the result reproducible.
        if (this.stdout) {
            const output = this.stdout;
            this.stdout = "";
            Connection.send(WS_EVENTS.LOG_UPDATE, {
                jobId: this.runId,
                output,
                stream: "stdout",
            });
        }
        if (this.stderr) {
            const output = this.stderr;
            this.stderr = "";
            Connection.send(WS_EVENTS.LOG_UPDATE, {
                jobId: this.runId,
                output,
                stream: "stderr",
            });
        }
    }

    /** Flushes and drops the timer — the run is over and nothing more will arrive. */
    close(): void {
        this.flush();
    }
}
