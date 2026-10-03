import { useState } from 'react';
import { Input, Select, Switch, cn, FOCUS_RING } from '@stefgo/react-ui-components';
import { ScheduleConfigSchema } from '@pbcm/shared';
import { useJobFormContext } from '../../context/JobFormContext';
import { WEEKDAYS, previewRuns } from '../../lib/jobForm';
import { useNow } from '../../../../hooks/useNow';

/** How many of the coming runs the preview lists. */
const PREVIEW_RUNS = 3;

/** A run with its weekday: the weekdays are half of what the preview is there to check. */
const RUN_FORMAT = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
});

export const JobScheduleSettings = () => {
    const { form, agentTimezone } = useJobFormContext();
    const { draft, set, errors } = form;
    const { scheduleEnabled, weekdays } = draft;

    // Shown after a click that did nothing, so the button does not just seem broken. Not
    // part of the draft: it says something about a click, not about the job.
    const [lastDayRefused, setLastDayRefused] = useState(false);
    const now = useNow();

    // The last day cannot be taken out: a schedule that runs on no day never runs.
    const toggleDay = (day: string) => {
        const isLast = weekdays.length === 1 && weekdays.includes(day);
        setLastDayRefused(isLast);
        if (isLast) return;
        set('weekdays', weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day]);
    };

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const runs = previewRuns(draft, now, PREVIEW_RUNS);

    return (
        <div className="space-y-1">
            <label className="field-label">Schedule</label>
            <div className="p-2 border border-border rounded bg-app-bg">
                <Switch
                    value={scheduleEnabled}
                    onChange={(enabled) => set('scheduleEnabled', enabled)}
                    label={scheduleEnabled ? 'Enabled' : 'Disabled'}
                    classNames={{ label: 'text-xs font-bold text-text-muted uppercase cursor-pointer select-none' }}
                />

                {scheduleEnabled && (
                    <div className="space-y-2 mt-2">
                        {/* Start Time Selection */}
                        <div>
                            <label className="field-label">Next Run (Start At) <span className="text-error">*</span></label>
                            <div className="flex gap-2">
                                <Input
                                    type="date"
                                    value={draft.startDate}
                                    onChange={(e) => set('startDate', e.target.value)}
                                    error={errors.startDate}
                                    fullWidth={false}
                                />
                                <Input
                                    type="time"
                                    value={draft.startTime}
                                    onChange={(e) => set('startTime', e.target.value)}
                                    fullWidth={false}
                                />
                            </div>
                            <div className="text-[10px] text-text-muted mt-1">
                                If set, the job will not run before this time. Entered in your browser's
                                time ({browserTimezone}); the agent repeats it at the same time of day and
                                checks the weekdays on its own clock ({agentTimezone ?? 'not reported yet'}).
                            </div>
                        </div>

                        <div>
                            <label className="field-label">Schedule Interval</label>
                            <div className="flex gap-2">
                                <Input
                                    type="number"
                                    min="1"
                                    value={draft.interval}
                                    onChange={(e) => set('interval', e.target.value)}
                                    error={errors.interval}
                                    fullWidth={false}
                                    classNames={{ input: 'w-20' }}
                                />
                                <Select
                                    value={draft.unit}
                                    error={errors.unit}
                                    onChange={(e) => {
                                        // e.target.value is a plain string; the
                                        // options below are the schema's own values,
                                        // so this narrows without asserting.
                                        const unit = ScheduleConfigSchema.shape.unit.safeParse(e.target.value);
                                        if (unit.success) set('unit', unit.data);
                                    }}
                                    fullWidth={false}
                                    options={[
                                        { value: 'seconds', label: 'Seconds' },
                                        { value: 'minutes', label: 'Minutes' },
                                        { value: 'hours', label: 'Hours' },
                                        { value: 'days', label: 'Days' },
                                        { value: 'weeks', label: 'Weeks' },
                                    ]}
                                />
                            </div>
                        </div>
                        <div>
                            <label id="job-weekdays-label" className="field-label">Detailed Weekdays</label>
                            <div role="group" aria-labelledby="job-weekdays-label" className="flex flex-wrap gap-2">
                                {WEEKDAYS.map(day => (
                                    <button
                                        key={day}
                                        type="button"
                                        aria-pressed={weekdays.includes(day)}
                                        onClick={() => toggleDay(day)}
                                        className={cn(
                                            'px-2 py-1 text-[10px] uppercase font-bold rounded border transition-colors',
                                            weekdays.includes(day)
                                                ? 'bg-primary/20 border-primary text-primary shadow-glow-accent'
                                                : 'bg-card border-border text-text-muted opacity-60',
                                            FOCUS_RING,
                                        )}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                            {lastDayRefused && (
                                <p role="status" className="text-[10px] text-warning mt-1">
                                    At least one day has to stay selected: a schedule that runs on no day never runs.
                                </p>
                            )}
                        </div>
                        {runs.length > 0 && (
                            <div>
                                <label className="field-label">Next Runs</label>
                                <ol className="text-xs text-text-primary space-y-0.5">
                                    {runs.map((run) => (
                                        <li key={run.getTime()}>{RUN_FORMAT.format(run)}</li>
                                    ))}
                                </ol>
                                {agentTimezone !== browserTimezone && (
                                    <div className="text-[10px] text-text-muted mt-1">
                                        Calculated on your browser's clock. The agent repeats on its own
                                        ({agentTimezone ?? 'not reported yet'}), so the days can differ.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
