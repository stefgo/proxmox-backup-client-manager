import {
    activeJobCount,
    backupStatus,
    buildFindings,
    clientCount,
    countFindings,
    existingJobRuns,
    repositoryCount,
    type StatusReport,
} from "@pbcm/shared";
import { appVersion } from "../core/version.js";
import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";
import { RepositoryConfigRepository } from "../repositories/RepositoryConfigRepository.js";
import { ProxyService } from "./ProxyService.js";
import { RepositoryStatusService } from "./RepositoryStatusService.js";

/**
 * The status report of `GET /api/v1/status`: how the backups are doing and what needs a look,
 * as the dashboard shows it.
 *
 * Nothing is judged here. The inputs are what the dashboard reads -- the clients with their
 * connection, the jobs the connected agents sent, the last run of every job and whether each
 * repository answers -- and the verdict and the findings come from the functions in `shared`
 * the dashboard calls, so the two cannot disagree. The repositories are asked as the
 * dashboard asks them, through a cache of 30 seconds, so a reader that polls does not knock
 * on every Proxmox Backup Server each time.
 */
export class StatusService {
    static async report(now = Date.now()): Promise<StatusReport> {
        const clients = ProxyService.getClientsWithStatus();
        const cachedJobs = ProxyService.getAllCachedJobs();
        const jobs = cachedJobs.flatMap(({ clientId, jobs }) => jobs.map((job) => ({ ...job, clientId })));
        const knownClients = cachedJobs.map(({ clientId }) => clientId);
        const latest = existingJobRuns(JobHistoryRepository.findLatestPerJob(), jobs, knownClients);
        const repositories = await Promise.all(
            RepositoryConfigRepository.findAll().map(async (repo) => ({
                id: repo.id,
                // Both are required on create; a row without them is checked as offline anyway.
                baseUrl: repo.base_url ?? "",
                datastore: repo.datastore ?? "",
                status: await RepositoryStatusService.cached(repo, now),
            })),
        );

        const findings = buildFindings({ clients, repositories, jobs, knownClients, latest, now }).map((finding) => ({
            id: finding.id,
            type: finding.type,
            severity: finding.severity,
            text: finding.text,
            since: finding.since ?? null,
        }));
        return {
            app: "pbcm",
            version: appVersion,
            status: backupStatus(findings, clients),
            checkedAt: new Date(now).toISOString(),
            counts: countFindings(findings),
            summary: {
                clients: clientCount(clients),
                repositories: repositoryCount(repositories),
                jobsActive: activeJobCount(jobs, clients),
            },
            findings,
        };
    }
}
