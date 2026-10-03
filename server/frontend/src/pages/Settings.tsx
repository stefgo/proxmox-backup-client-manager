import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Save, Settings as SettingsIcon } from 'lucide-react';
import {
    Button,
    Card,
    cn,
    FOCUS_RING_INSET,
    TabList,
    TabPanel,
    useConfirm,
    useTabs,
    useToast,
    LoadingIndicator,
} from '@stefgo/react-ui-components';
import { useAuth } from '../features/auth/AuthContext';
import { useSearchQueryParam } from '../hooks/useSearchQueryParam';
import { describeFailure } from '../utils';
import { api } from '../lib/api';
import {
    DEFAULT_SETTINGS,
    SECTIONS,
    SECTION_IDS,
    isDirty,
    type SectionDef,
    type SectionId,
    type SettingsValues,
    settingsFrom,
} from '../features/settings/sections';
import { JobHistorySection, TokenRetentionSection } from '../features/settings/components/SettingsSections';
import { schedulerStatusOptions } from '../queries/scheduler';
import { SettingsResponseSchema } from '@pbcm/shared';

// The tab fills the sidebar's width, so the ring is drawn inside it -- an outward one would
// be clipped by the panel border next to it.
const TAB_CLASS = cn(
    'w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left transition duration-200 cursor-pointer border-l-4 border-transparent hover:bg-hover',
    FOCUS_RING_INSET,
);
const TAB_SELECTED_CLASS =
    'bg-primary/10 text-primary border-l-primary shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)] hover:bg-primary/10';

/**
 * The server's own settings, one section per tab -- laid out like the settings of dim.
 *
 * Each section saves on its own and sends only its own keys; the server merges them into the
 * stored block. A tab with edits that are not saved yet carries a dot, so they are not
 * forgotten. Each section shows its scheduler below its fields -- status, last and next
 * run -- and runs its own cleanup from there.
 *
 * The open tab is in the URL, like the tabs of the client page.
 */
export default function Settings() {
    const { alert } = useConfirm();
    const { show } = useToast();
    const { isAuthenticated } = useAuth();

    /** What the server holds, as last loaded or saved. */
    const [saved, setSaved] = useState<SettingsValues>(DEFAULT_SETTINGS);
    /** What the fields show, saved or not. */
    const [draft, setDraft] = useState<SettingsValues>(DEFAULT_SETTINGS);
    const [savingSection, setSavingSection] = useState<SectionId | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [tab, setTab] = useSearchQueryParam('tab');
    const tabs = useTabs({
        tabs: SECTION_IDS,
        value: (SECTION_IDS as readonly string[]).includes(tab) ? tab : SECTION_IDS[0],
        onChange: setTab,
        orientation: 'vertical',
    });

    const queryClient = useQueryClient();

    // Loaded once, into the draft. Deliberately not a cache entry: the reconnect that
    // invalidates the cache would read the settings again and overwrite what is typed and
    // not yet saved. The scheduler status below the fields is one, and follows the socket.
    // isLoading starts out true, so the load only ever has to lower it.
    useEffect(() => {
        if (!isAuthenticated) return;
        let cancelled = false;
        const loadSettings = async () => {
            try {
                const data = await api.get('/api/v1/settings/cleanup', SettingsResponseSchema);
                if (!cancelled) {
                    const initial = { ...DEFAULT_SETTINGS, ...settingsFrom(data) };
                    setSaved(initial);
                    setDraft(initial);
                }
            } catch (e) {
                console.error('Failed to fetch settings:', e);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        loadSettings();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated]);

    const change = (key: string, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

    const save = async (section: SectionDef) => {
        const body = Object.fromEntries(section.keys.map((key) => [key, draft[key] ?? '']));
        setSavingSection(section.id);
        try {
            // The endpoint validates the body and names the offending field.
            await api.put('/api/v1/settings/cleanup', body, undefined, { fallback: 'Failed to save settings' });
            setSaved((prev) => ({ ...prev, ...body }));
            show({ variant: 'success', title: `${section.label} saved` });
            // A changed interval moves the next scheduled run.
            queryClient.invalidateQueries({ queryKey: schedulerStatusOptions.queryKey });
        } catch (e: unknown) {
            alert(describeFailure('Could not save the settings', e));
        } finally {
            setSavingSection(null);
        }
    };

    if (isLoading) {
        return <LoadingIndicator label="Loading settings…" />;
    }

    const renderSection = (id: SectionId) => {
        switch (id) {
            case 'tokens':
                return <TokenRetentionSection values={draft} onChange={change} />;
            case 'job-history':
                return <JobHistorySection values={draft} onChange={change} />;
        }
    };

    return (
        <Card
            title={
                <span className="flex items-center gap-2 font-semibold">
                    <SettingsIcon size={18} className="text-text-muted" /> System Settings
                </span>
            }
            className="overflow-visible"
            padding="none"
        >
            <div className="flex flex-col md:flex-row min-h-[450px]">
                {/* The card is overflow-visible, so its rounded corner does not clip the
                    sidebar's background; the sidebar rounds that corner itself. */}
                <TabList
                    tabs={tabs}
                    aria-label="Settings sections"
                    className="w-full md:w-64 shrink-0 bg-app-bg border-b md:border-b-0 md:border-r md:rounded-bl-lg border-border py-4 flex flex-col gap-1"
                >
                    {SECTIONS.map((section) => {
                        const { selected, ...tabAttributes } = tabs.tabProps(section.id);
                        const dirty = isDirty(section, draft, saved);
                        return (
                            <button
                                key={section.id}
                                type="button"
                                {...tabAttributes}
                                className={cn(TAB_CLASS, selected && TAB_SELECTED_CLASS)}
                            >
                                <section.icon size={18} />
                                <span className="flex-1">{section.label}</span>
                                {dirty && (
                                    <>
                                        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-warning" />
                                        <span className="sr-only">(unsaved changes)</span>
                                    </>
                                )}
                            </button>
                        );
                    })}
                </TabList>

                <div className="flex-1 min-w-0 flex flex-col">
                    {SECTIONS.map((section) => (
                        <TabPanel
                            key={section.id}
                            tabs={tabs}
                            value={section.id}
                            className="flex-1 flex flex-col px-8 pt-8 pb-4 animate-in fade-in slide-in-from-right-2 duration-300"
                        >
                            <div className="flex-1 flex flex-col gap-8">
                                {renderSection(section.id)}

                                <div className="mt-auto flex justify-end border-t border-border pt-4">
                                    <Button
                                        variant="primary"
                                        icon={Save}
                                        onClick={() => save(section)}
                                        disabled={!isDirty(section, draft, saved) || savingSection !== null}
                                        isLoading={savingSection === section.id}
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </TabPanel>
                    ))}
                </div>
            </div>
        </Card>
    );
}
