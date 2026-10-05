import { z } from "zod";
import { WS_EVENTS } from "./constants.js";
import {
    BackupJobViewSchema,
    ClientViewSchema,
    HistorySeenSchema,
    JobNextRunUpdatePayloadSchema,
    LogUpdatePayloadSchema,
    SchedulerStatusUpdateSchema,
    StatusUpdatePayloadSchema,
    TunnelStateSchema,
} from "./schemas.js";

/**
 * Every message the server pushes over `/ws/dashboard`, as one discriminated union.
 *
 * The types used to exist twice and nowhere: as string literals at each place the backend
 * sent one, and as a chain of `if (data.type === …)` in the dashboard. A message added on
 * one side was simply never handled on the other, and nothing said so.
 *
 * Now both ends hang on this union. The backend's `broadcastToDashboard` takes a
 * `DashboardMessage`, so it cannot send a shape that is not listed here; the dashboard
 * parses against the schema and dispatches in a `switch` that ends in `assertNever`, so a
 * member added here without a case there fails `typecheck`.
 */
export const DashboardMessageSchema = z.discriminatedUnion("type", [
    /** The full list of clients and their statuses; also the first message on connect. */
    z.object({ type: z.literal(WS_EVENTS.CLIENTS_UPDATE), payload: z.array(ClientViewSchema) }),
    /**
     * One client's job configs. The cache exists only while its agent is connected, so this
     * is sent on connect, on disconnect (empty list) and after every job change.
     */
    z.object({
        type: z.literal(WS_EVENTS.JOBS_UPDATE),
        payload: z.object({ clientId: z.string(), jobs: z.array(BackupJobViewSchema) }),
    }),
    /** One client's tunnel runtime state. */
    z.object({ type: z.literal(WS_EVENTS.TUNNEL_UPDATE), payload: TunnelStateSchema }),
    /** A running job changed state, as the agent reported it. */
    z.object({
        type: z.literal(WS_EVENTS.JOB_UPDATE),
        payload: z.object({ clientId: z.string(), job: StatusUpdatePayloadSchema }),
    }),
    /** One chunk of a running job's output. `jobId` is the run id, not the job config id. */
    z.object({
        type: z.literal(WS_EVENTS.LOG_UPDATE),
        payload: LogUpdatePayloadSchema.extend({ clientId: z.string() }),
    }),
    /** The agent recalculated when a scheduled job runs next. */
    z.object({
        type: z.literal(WS_EVENTS.JOB_NEXT_RUN_UPDATE),
        payload: JobNextRunUpdatePayloadSchema.extend({ clientId: z.string() }),
    }),
    /** A user opened the history. Sent to every dashboard; each keeps only its own user's. */
    z.object({
        type: z.literal(WS_EVENTS.HISTORY_SEEN),
        payload: HistorySeenSchema.extend({ username: z.string() }),
    }),
    /** No payload: a webhook changed or a delivery went out, and the list is fetched again. */
    z.object({ type: z.literal(WS_EVENTS.WEBHOOKS_UPDATE) }),
    /** One server scheduler, whenever a run starts or ends or its timer moves. */
    z.object({ type: z.literal(WS_EVENTS.SCHEDULER_STATUS_UPDATE), payload: SchedulerStatusUpdateSchema }),
]);

export type DashboardMessage = z.infer<typeof DashboardMessageSchema>;
export type DashboardMessageType = DashboardMessage["type"];
