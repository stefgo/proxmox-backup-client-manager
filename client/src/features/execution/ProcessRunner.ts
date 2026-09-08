import { spawn } from "child_process";
import type { Writable } from "stream";
import {
    WS_EVENTS,
    ProtocolMap,
    JOB_STATUS,
} from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import { JobHistoryRepository } from "../../repositories/JobHistoryRepository.js";
import { config } from "../../core/Config.js";
import { Connection } from "../../core/Connection.js";
import { CappedLog } from "../../core/CappedLog.js";
import { LogStream } from "../../core/LogStream.js";
import { TunnelClient, TunnelLease } from "../TunnelClient.js";
import { removeTempKeyfile } from "./RunPreparation.js";

/**
 * Everything that starts a child process and reports what became of it.
 *
 * Split out of Executor so that class keeps only the queue and the orchestration. The
 * shape that mattered was already there: backup and restore meet in runProxmoxClient and
 * are the same procedure from that point on -- which is the whole reason the keyfile
 * cleanup lives in one place now instead of two.
 */
export class ProcessRunner {
    /**
     * Runs a pre- or post-execution script if configured.
     * The script is executed with two arguments: the operation type (backup/restore) and the job name.
     * Script output (stdout/stderr) is streamed to the server via WebSocket.
     *
     * scriptPath is executed directly, without a shell. It must therefore be an
     * executable file (shebang plus +x); a config value containing shell syntax
     * ("bash foo.sh", pipes, redirects) is not interpreted. Running it through a
     * shell would splice the server-supplied job name into the command line.
     *
     * @param scriptPath - The path to the script to execute.
     * @param type - The operation type ('backup' or 'restore').
     * @param jobName - The name of the job.
     * @param runId - The unique identifier for this job execution.
     * @returns A promise that resolves to true if the script finished successfully (exit code 0), false otherwise.
     */
    static async runScript(
        scriptPath: string,
        type: string,
        jobName: string,
        runId: string,
    ): Promise<boolean> {
        logger.info(`Running script: ${scriptPath} ${type} "${jobName}"`);

        // Inform server about script start
        Connection.send(WS_EVENTS.LOG_UPDATE, {
            jobId: runId,
            output: `[Script Start] Running ${scriptPath} (Op: ${type}, Job: ${jobName})\n`,
            stream: "stdout",
        });

        return new Promise((resolve) => {
            try {
                const child = spawn(scriptPath, [type, jobName], {
                    shell: false,
                    env: { ...process.env },
                });

                child.stdout.on("data", (data: Buffer) => {
                    const chunk = data.toString();
                    process.stdout.write(chunk);
                    Connection.send(WS_EVENTS.LOG_UPDATE, {
                        jobId: runId,
                        output: `[Script Stdout] ${chunk}`,
                        stream: "stdout",
                    });
                });

                child.stderr.on("data", (data: Buffer) => {
                    const chunk = data.toString();
                    process.stderr.write(chunk);
                    Connection.send(WS_EVENTS.LOG_UPDATE, {
                        jobId: runId,
                        output: `[Script Stderr] ${chunk}`,
                        stream: "stderr",
                    });
                });

                child.on("close", (code) => {
                    const success = code === 0;
                    const resultMsg = success
                        ? "successfully"
                        : `with error code ${code}`;

                    // Inform server about script end
                    Connection.send(WS_EVENTS.LOG_UPDATE, {
                        jobId: runId,
                        output: `[Script End] ${scriptPath} finished ${resultMsg}.\n`,
                        stream: success ? "stdout" : "stderr",
                    });

                    if (success) {
                        logger.info(
                            `Script ${scriptPath} finished successfully.`,
                        );
                        resolve(true);
                    } else {
                        logger.error(
                            `Script ${scriptPath} failed with code ${code}.`,
                        );
                        resolve(false);
                    }
                });

                child.on("error", (err) => {
                    logger.error(
                        { err: err },
                        `Failed to start script ${scriptPath}:`,
                    );
                    Connection.send(WS_EVENTS.LOG_UPDATE, {
                        jobId: runId,
                        output: `[Script Error] Failed to start: ${err.message}\n`,
                        stream: "stderr",
                    });
                    resolve(false);
                });
            } catch (e: unknown) {
                logger.error({ err: e }, `Exception during script execution:`);
                resolve(false);
            }
        });
    }

    /**
     * Ends a run that failed before the backup process could even be started — currently
     * the tunnel paths. The history row already exists at this point, so it is closed out
     * rather than created.
     */
    static finishFailedRun(
        runId: string,
        jobId: string | undefined,
        name: string,
        startTime: string,
        jobType: string,
        message: string,
    ) {
        try {
            JobHistoryRepository.finishJob(
                runId,
                JOB_STATUS.FAILED,
                new Date().toISOString(),
                null,
                null,
                message,
            );
        } catch (e) {
            logger.error({ err: e }, "DB Update Error (pre-spawn failure)");
        }

        const payload: ProtocolMap["STATUS_UPDATE"]["req"] = {
            id: runId,
            jobId: jobId,
            name,
            startTime,
            status: JOB_STATUS.FAILED,
            endTime: new Date().toISOString(),
            error: message,
            stderr: message,
            type: jobType,
        };
        Connection.send(WS_EVENTS.STATUS_UPDATE, payload);
    }

    /**
     * Everything a run needs once its command line is built. The two entry points
     * below differ only in how they fill this in — from here on backup and restore
     * are the same procedure, which is the point: the keyfile cleanup that this
     * class lost once already went missing because there were two copies of it.
     */
    static async runProxmoxClient(spec: {
        runId: string;
        /** Backup only. Restores are authorised per run and carry no job id. */
        jobId?: string;
        jobType: "backup" | "restore";
        jobName: string;
        startTime: string;
        command: string;
        args: string[];
        env: NodeJS.ProcessEnv;
        password?: string;
        keyfilePath?: string;
        repository?: any;
        tunnelRequired: boolean;
        /**
         * Backup only: hands the run's concurrency slot back and starts whatever queued
         * up behind it. A callback rather than a `releaseSlot: boolean`, so this module
         * stays unaware of the queue that Executor keeps — it only has to promise that
         * every exit path calls it exactly once.
         */
        onSlotRelease?: () => void;
    }): Promise<void> {
        const {
            runId,
            jobId,
            jobType,
            jobName,
            startTime,
            command,
            args,
            env,
            password,
            keyfilePath,
            repository,
            tunnelRequired,
            onSlotRelease,
        } = spec;

        const releaseSlotIfHeld = () => onSlotRelease?.();

        logger.info(
            `Starting ${jobType} ${runId}: ${command} ${args.join(" ")}`,
        );

        try {
            JobHistoryRepository.startRunningJob(
                runId,
                jobId ?? null,
                jobType,
                startTime,
                jobName,
            );
        } catch (e) {
            logger.error({ err: e }, "DB Log Error");
        }

        const runningPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
            id: runId,
            jobId: jobId,
            name: jobName,
            startTime: startTime,
            status: JOB_STATUS.RUNNING,
            type: jobType,
        };
        Connection.send(WS_EVENTS.STATUS_UPDATE, runningPayload);

        // Bounded, because all three destinations of this output — memory for the length
        // of the run, a SQLite BLOB, and the sync to the server — pay for every byte.
        const stdoutLog = new CappedLog(config.logCapBytes);
        const stderrLog = new CappedLog(config.logCapBytes);
        const logStream = new LogStream(runId);

        // A job configured for the tunnel reaches the PBS only through it. The lease is
        // requested here, immediately before the spawn, and released again in every exit
        // path below — a lease that is never released blocks the tunnel until maxLeaseMs.
        let lease: TunnelLease | undefined;
        try {
            if (tunnelRequired && repository) {
                lease = await TunnelClient.acquire(runId, jobId);
                env.PBS_REPOSITORY = TunnelClient.buildRepositoryValue(
                    repository,
                    lease,
                );
                // Measured by the server moments ago; the copy in the job config may be
                // months old and is only the fallback if the server could not measure.
                if (lease.fingerprint) {
                    env.PBS_FINGERPRINT = lease.fingerprint;
                }
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logger.error({ err: e }, `Tunnel acquisition failed (${jobType})`);
            releaseSlotIfHeld();
            removeTempKeyfile(keyfilePath);
            ProcessRunner.finishFailedRun(
                runId,
                jobId,
                jobName,
                startTime,
                jobType,
                message,
            );
            return;
        }

        const child = spawn(command, args, {
            shell: false,
            env: env,
            // Standard IO pipes: [stdin, stdout, stderr, pipe3 (repository password)]
            stdio: ["pipe", "pipe", "pipe", "pipe"],
        });

        if (password) {
            // `stdio` is typed as possibly-null per slot because the shape depends on the
            // options object; slot 3 was configured as a pipe two lines above, so it is a
            // Writable here. Named as one rather than left as `any` -- `.write()` on the
            // wrong thing would fail silently into the catch below.
            const passwordPipe = child.stdio[3] as Writable;
            passwordPipe.on("error", () => {});
            passwordPipe.write(password);
            passwordPipe.end();
        }

        const pipeOutput = (
            source: NodeJS.ReadableStream,
            local: NodeJS.WritableStream,
            channel: "stdout" | "stderr",
        ) => {
            source.on("data", (data: Buffer) => {
                const chunk = data.toString();
                local.write(chunk);
                if (channel === "stdout") stdoutLog.append(chunk);
                else stderrLog.append(chunk);
                logger.debug({ output: chunk }, channel);
                // Batched rather than one frame per chunk: a chatty run produced
                // thousands of tiny messages, each of which the server then fanned out
                // to every open dashboard.
                logStream.push(channel, chunk);
            });
        };
        pipeOutput(child.stdout, process.stdout, "stdout");
        pipeOutput(child.stderr, process.stderr, "stderr");

        child.on("close", (code: number | null) => {
            TunnelClient.release(lease);
            lease = undefined;
            removeTempKeyfile(keyfilePath);
            // Before the status update below: the batched log frames are display-only,
            // but they must not arrive after the message that says the run is over.
            logStream.close();

            const status = code === 0 ? JOB_STATUS.SUCCESS : JOB_STATUS.FAILED;
            const endTime = new Date().toISOString();
            logger.info(`${jobType} ${runId} finished with code ${code}`);

            if (stdoutLog.truncated || stderrLog.truncated) {
                logger.warn(
                    { runId, logCapBytes: config.logCapBytes },
                    "Run output exceeded logCapBytes; the middle was dropped from the stored log",
                );
            }

            try {
                JobHistoryRepository.finishJob(
                    runId,
                    status,
                    endTime,
                    code,
                    stdoutLog.toDbValue(),
                    stderrLog.toDbValue(),
                );
            } catch (e) {
                logger.error({ err: e }, "DB Update Error");
            }

            const finalPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                jobId: jobId,
                name: jobName,
                startTime: startTime,
                status: status,
                exitCode: code ?? undefined,
                endTime: endTime,
                stdout: stdoutLog.toString(),
                stderr: stderrLog.toString(),
                type: jobType,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, finalPayload);

            // Post-Execution Script. The run is already recorded as finished; a
            // failing post-script downgrades a successful run to failed after the
            // fact, per the requirement that any error aborts the whole operation.
            if (config.postScript) {
                ProcessRunner.runScript(
                    config.postScript,
                    jobType,
                    jobName,
                    runId,
                ).then((success) => {
                    if (success || status !== JOB_STATUS.SUCCESS) return;

                    logger.error("Post-execution script failed.");
                    const stderrWithScript =
                        stderrLog.toString() + "\nPost-execution script failed.";

                    const downgraded: ProtocolMap["STATUS_UPDATE"]["req"] = {
                        id: runId,
                        jobId: jobId,
                        name: jobName,
                        startTime: startTime,
                        status: JOB_STATUS.FAILED,
                        exitCode: code ?? undefined,
                        endTime: endTime,
                        stdout: stdoutLog.toString(),
                        stderr: stderrWithScript,
                        type: jobType,
                    };
                    Connection.send(WS_EVENTS.STATUS_UPDATE, downgraded);

                    try {
                        JobHistoryRepository.failJob(runId, stderrWithScript);
                    } catch (e) {
                        logger.error(
                            { err: e },
                            "DB Update Error (Post-Script Failure)",
                        );
                    }
                });
            }

            releaseSlotIfHeld();
        });

        child.on("error", (err: Error) => {
            TunnelClient.release(lease);
            lease = undefined;
            releaseSlotIfHeld();
            removeTempKeyfile(keyfilePath);
            logStream.close();
            logger.error({ err: err }, "Spawn Error");

            const errorMsg = err.message;
            const endTime = new Date().toISOString();
            stderrLog.append("\nSpawn Error: " + errorMsg);

            const errorPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                jobId: jobId,
                name: jobName,
                startTime: startTime,
                status: JOB_STATUS.FAILED,
                endTime: endTime,
                error: errorMsg,
                stderr: stderrLog.toString(),
                type: jobType,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, errorPayload);

            try {
                // finishJob rather than failJob: it also writes end_time, which the
                // backup path left empty on a spawn error.
                JobHistoryRepository.finishJob(
                    runId,
                    JOB_STATUS.FAILED,
                    endTime,
                    null,
                    null,
                    stderrLog.toDbValue(),
                );
            } catch (e) {
                logger.error({ err: e }, "DB Update Error (Spawn Failure)");
            }
        });
    }
}
