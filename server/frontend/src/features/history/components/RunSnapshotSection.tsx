import type { ComponentProps } from 'react';
import type { RunSnapshotDetails } from '@pbcm/shared';
import { Badge } from '@stefgo/react-ui-components';
import { formatBytes } from '../../../utils';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

// What the PBS reports per file. `sign-only` is the manifest of an encrypted backup.
const CRYPT_MODE_VARIANT: Record<string, BadgeVariant> = {
    encrypt: 'success',
    'sign-only': 'info',
    none: 'neutral',
};

/** The manifest is how the PBS knows the snapshot is complete, not something that was backed up. */
const MANIFEST = 'index.json.blob';

interface RunSnapshotSectionProps {
    snapshot?: string | null;
    details?: RunSnapshotDetails | null;
    error?: string | null;
}

/**
 * The snapshot a backup run created, as the agent read it back from the PBS right after
 * the run. A stored copy: it stays after the snapshot is pruned on the PBS.
 */
export const RunSnapshotSection = ({ snapshot, details, error }: RunSnapshotSectionProps) => {
    if (!snapshot) {
        return (
            <div className="mt-2 text-xs text-text-muted italic pl-4 ml-6 cursor-default">
                Not linked to a snapshot (run of an older agent)
            </div>
        );
    }

    const archives = details?.files.filter((file) => file.filename !== MANIFEST) ?? [];

    return (
        <div className="mt-2 text-xs p-2 rounded pl-4 ml-6 cursor-text bg-hover text-text-muted">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-semibold text-text-primary">Snapshot</span>
                <span className="font-mono break-all">{snapshot}</span>
                {details && <span>{formatBytes(details.size)}</span>}
            </div>
            {details?.fingerprint && (
                <div className="mt-1 font-mono break-all">Key {details.fingerprint}</div>
            )}
            {error && !details && (
                <div className="mt-1 text-warning">No snapshot details: {error}</div>
            )}
            {archives.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {archives.map((file) => (
                        <li key={file.filename} className="flex items-center gap-3">
                            <span className="font-mono flex-1 break-all">{file.filename}</span>
                            <span className="whitespace-nowrap">{formatBytes(file.size)}</span>
                            {file.cryptMode && (
                                <Badge variant={CRYPT_MODE_VARIANT[file.cryptMode] ?? 'neutral'} size="sm">
                                    {file.cryptMode}
                                </Badge>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
