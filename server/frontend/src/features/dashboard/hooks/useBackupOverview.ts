import { useMemo } from 'react';
import { useNow } from '../../../hooks/useNow';
import { useClients } from '../../../queries/clients';
import { useGlobalJobs, useLatestPerJob } from '../../../queries/jobs';
import { useRepositories } from '../../../queries/repositories';
import { byBackupStatus, existingJobRuns } from '../lib/backupStatus';
import { backupStatus, buildFindings, findingSummary } from '../lib/findings';

/**
 * How the backups are doing: the findings, the status they add up to, and the last run of
 * every job in the order "Backup status" lists them. Only reads the cache; the socket keeps
 * what it reads current, so a finding comes and goes with what it is about.
 */
export function useBackupOverview() {
    const { clients, isPending: clientsPending } = useClients();
    const { repositories } = useRepositories();
    const { jobs, knownClients } = useGlobalJobs();
    const { latestPerJob, isPending: latestPending, error: latestError } = useLatestPerJob();
    const now = useNow();

    const latest = useMemo(
        () => existingJobRuns(latestPerJob, jobs, knownClients),
        [latestPerJob, jobs, knownClients],
    );
    const runs = useMemo(() => byBackupStatus(latest), [latest]);

    const overview = useMemo(() => {
        const findings = buildFindings({ clients, repositories, jobs, knownClients, latest, now });
        const status = clientsPending ? 'unknown' : backupStatus(findings, clients);
        return { findings, status, summary: clientsPending ? 'Loading…' : findingSummary(findings, status) };
    }, [clients, repositories, jobs, knownClients, latest, now, clientsPending]);

    return { ...overview, runs, runsPending: latestPending, runsError: latestError };
}
