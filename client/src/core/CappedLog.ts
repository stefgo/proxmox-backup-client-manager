/**
 * A bounded accumulator for a subprocess output stream.
 *
 * The Executor used to concatenate every chunk into a plain string, without limit. That
 * string is held for the whole run, written to SQLite as a BLOB when the run finishes, and
 * synced to the server from there — so a `proxmox-backup-client` run that talks a lot over
 * a large datastore could push all three past what the agent can carry.
 *
 * Keeps the **head and the tail**, not just the tail. The two ends are the two things
 * worth having: the invocation and the first errors are at the top, the reason a run
 * failed is at the bottom. A plain ring buffer keeps only the second half, and the
 * question "what was it even called with" is then unanswerable.
 */
export class CappedLog {
    private head = "";
    private tail = "";
    /** Bytes dropped between head and tail. Reported, never silently swallowed. */
    private dropped = 0;

    private readonly headLimit: number;
    private readonly tailLimit: number;

    /**
     * @param limit Total budget in bytes. A quarter goes to the head, the rest to the
     *   tail: the head only needs the opening lines, while the tail carries the failure.
     */
    constructor(limit: number) {
        const safe = Math.max(limit, 1024);
        this.headLimit = Math.floor(safe / 4);
        this.tailLimit = safe - this.headLimit;
    }

    append(chunk: string): void {
        if (!chunk) return;

        // Fill the head first; only once it is full does anything reach the tail.
        if (this.head.length < this.headLimit) {
            const room = this.headLimit - this.head.length;
            this.head += chunk.slice(0, room);
            chunk = chunk.slice(room);
            if (!chunk) return;
        }

        this.tail += chunk;

        if (this.tail.length > this.tailLimit) {
            const excess = this.tail.length - this.tailLimit;
            this.tail = this.tail.slice(excess);
            this.dropped += excess;
        }
    }

    /** True once anything was actually dropped — used to decide whether to warn. */
    get truncated(): boolean {
        return this.dropped > 0;
    }

    /** The captured output, with an explicit marker where the middle was removed. */
    toString(): string {
        if (this.dropped === 0) return this.head + this.tail;

        const kb = Math.round(this.dropped / 1024);
        return (
            this.head +
            `\n\n[... ${this.dropped} bytes (${kb} KB) omitted — output exceeded logCapBytes ...]\n\n` +
            this.tail
        );
    }

    /** `null` for an empty stream, so callers can keep writing NULL to the database. */
    toDbValue(): string | null {
        const value = this.toString();
        return value.length > 0 ? value : null;
    }
}
