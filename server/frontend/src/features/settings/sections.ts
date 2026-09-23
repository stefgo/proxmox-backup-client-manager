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

/** Whether the draft differs from what the server holds in any of the section's keys. */
export const isDirty = (section: SectionDef, draft: SettingsValues, saved: SettingsValues): boolean =>
    section.keys.some((key) => (draft[key] ?? '') !== (saved[key] ?? ''));

/** Props every section component takes: its values, and a way to change one of them. */
export interface SectionProps {
    values: SettingsValues;
    onChange: (key: string, value: string) => void;
}
