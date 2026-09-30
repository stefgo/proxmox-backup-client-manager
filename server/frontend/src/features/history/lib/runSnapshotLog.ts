import type { RunSnapshotDetails } from '@pbcm/shared';
import { formatBytes } from '../../../utils';

/** The manifest is how the PBS knows the snapshot is complete, not something that was backed up. */
const MANIFEST = 'index.json.blob';

// What the PBS reports per file. `none` needs no note; `sign-only` is the manifest of an
// encrypted backup.
const CRYPT_MODE_NOTE: Record<string, string> = {
    encrypt: 'encrypted',
    'sign-only': 'signed',
};

interface RunSnapshotLogInput {
    snapshot?: string | null;
    details?: RunSnapshotDetails | null;
    error?: string | null;
}

/**
 * The snapshot a backup run created, as lines for the run's log -- as the agent read it
 * back from the PBS right after the run. A stored copy: it stays after the snapshot is
 * pruned on the PBS. Null for a run that is not linked to a snapshot (an older agent).
 */
export const runSnapshotLog = ({ snapshot, details, error }: RunSnapshotLogInput): string | null => {
    if (!snapshot) return null;

    const lines = [`Reading Snapshot ${snapshot}`];
    if (details) {
        for (const file of details.files) {
            if (file.filename === MANIFEST) continue;
            const note = file.cryptMode ? CRYPT_MODE_NOTE[file.cryptMode] : undefined;
            // `1.99MiB`, the way the CLI prints sizes in its own log.
            const size = formatBytes(file.size).replace(' ', '');
            lines.push(`${file.filename} ${size}${note ? ` (${note})` : ''}`);
        }
    } else if (error) {
        lines.push(`No snapshot details: ${error}`);
    }
    return lines.join('\n');
};
