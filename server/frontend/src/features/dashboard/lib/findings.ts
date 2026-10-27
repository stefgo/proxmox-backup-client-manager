import type { To } from 'react-router-dom';
import {
    buildFindings as buildSharedFindings,
    type BackupStatus,
    type Finding as SharedFinding,
    type FindingTarget,
    type FindingsInput,
} from '@pbcm/shared';
import { clientTab, paths } from '../../../lib/paths';
import { parseTimestamp } from '../../../lib/time';

/**
 * What needs a look across the backups right now, as the dashboard's "Needs attention" lists it.
 *
 * A finding is a state, not an event: it is there while the problem is, and goes by itself
 * once it is solved -- there is nothing to mark as seen. That is what tells it from a run under
 * "Errors / Warnings", which records that something happened and stays until somebody has
 * looked. Everything is read from what the cache already holds and the socket keeps current.
 *
 * Which findings there are is decided in `shared` (`buildFindings`), where the server's status
 * report reads them too; this module only turns where each leads into a link.
 */

export {
    backupStatus,
    type BackupStatus,
    type FindingSeverity,
    type FindingType,
    type FindingsInput,
} from '@pbcm/shared';

/** A finding as the dashboard lists it: with a link to where the reader can do something about it. */
export interface Finding extends Omit<SharedFinding, 'target'> {
    to?: To;
}

/** The page a finding's target names. */
function linkTo(target: FindingTarget): To {
    switch (target.kind) {
        case 'client':
            return paths.client(target.clientId);
        case 'client-history':
            return clientTab(target.clientId, 'history');
        case 'job':
            return paths.job(target.clientId, target.jobId);
        case 'repository':
            return paths.repository(target.id);
    }
}

/** The findings with links in place of targets. */
export function withLinks(findings: readonly SharedFinding[]): Finding[] {
    return findings.map(({ target, ...finding }) => (target ? { ...finding, to: linkTo(target) } : finding));
}

/** Everything that needs a look, as `shared` finds it, each with its link. */
export const buildFindings = (input: FindingsInput): Finding[] => withLinks(buildSharedFindings(input));

export const BACKUP_STATUS: Record<BackupStatus, { label: string; description: string; tone: string }> = {
    healthy: { label: 'Healthy', description: 'Nothing needs attention', tone: 'text-success' },
    degraded: { label: 'Degraded', description: 'Something needs a look', tone: 'text-warning' },
    critical: { label: 'Critical', description: 'Something is broken', tone: 'text-error' },
    unknown: { label: 'Unknown', description: 'No client is registered yet', tone: 'text-text-muted' },
};

/** "3 findings", or what the status means where there is none. */
export function findingSummary(findings: readonly Finding[], status: BackupStatus): string {
    if (findings.length === 0) return BACKUP_STATUS[status].description;
    return `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SPANS = [
    [365 * DAY, 'year'],
    [30 * DAY, 'month'],
    [DAY, 'day'],
    [HOUR, 'hour'],
    [MINUTE, 'minute'],
] as const;

/**
 * How long a finding has lasted, in a few words under it: `For 3 hours`. Rounded down, in
 * the largest unit that fits; null where the start is not known or lies ahead.
 */
export function findingAge(finding: Pick<Finding, 'since'>, now: number): string | null {
    const since = parseTimestamp(finding.since);
    if (!since) return null;
    const span = now - since.getTime();
    if (span < 0) return null;
    for (const [size, unit] of SPANS) {
        const count = Math.floor(span / size);
        if (count >= 1) return `For ${count} ${unit}${count === 1 ? '' : 's'}`;
    }
    return 'For less than a minute';
}
