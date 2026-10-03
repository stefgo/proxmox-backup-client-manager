import { History, KeyRound, type LucideIcon } from 'lucide-react';

/** The settings block as the API sends it: every value a string, whatever it means. */
export type SettingsValues = Record<string, string>;

export type SectionId = 'tokens' | 'job-history';

export interface SectionDef {
    id: SectionId;
    label: string;
    icon: LucideIcon;
    /**
     * The keys this section edits, and so the keys its Save sends. The server merges what
     * arrives into the stored block, so a section never writes over another section's edits.
     */
    keys: readonly string[];
}

export const SECTIONS: readonly SectionDef[] = [
    {
        id: 'tokens',
        label: 'Client Tokens',
        icon: KeyRound,
        keys: ['token_retention_days', 'token_cleanup_interval_hours'],
    },
    {
        id: 'job-history',
        label: 'Job History',
        icon: History,
        keys: ['retention_job_history_days', 'retention_job_history_count', 'job_history_cleanup_interval_hours'],
    },
];

export const SECTION_IDS: readonly SectionId[] = SECTIONS.map((s) => s.id);

/** What a section shows until the server has answered -- the server's own defaults. */
export const DEFAULT_SETTINGS: SettingsValues = {
    token_retention_days: '30',
    token_cleanup_interval_hours: '24',
    retention_job_history_days: '90',
    retention_job_history_count: '50',
    job_history_cleanup_interval_hours: '24',
};

/**
 * The settings as the form holds them, from the block as config.yaml carries it. A value
 * an operator wrote into the file by hand is a number there; the form edits text. What is
 * neither -- the `security` block travels in the same answer -- is not a setting of this
 * page and is left out.
 */
export const settingsFrom = (block: Record<string, unknown>): SettingsValues => {
    const values: SettingsValues = {};
    for (const [key, value] of Object.entries(block)) {
        if (typeof value === 'string') values[key] = value;
        else if (typeof value === 'number') values[key] = String(value);
    }
    return values;
};

/** Whether the draft differs from what the server holds in any of the section's keys. */
export const isDirty = (section: SectionDef, draft: SettingsValues, saved: SettingsValues): boolean =>
    section.keys.some((key) => (draft[key] ?? '') !== (saved[key] ?? ''));

/** Props every section component takes: its values, and a way to change one of them. */
export interface SectionProps {
    values: SettingsValues;
    onChange: (key: string, value: string) => void;
}
