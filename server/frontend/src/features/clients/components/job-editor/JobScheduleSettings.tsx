import { Input, Select, Switch, cn, FOCUS_RING } from '@stefgo/react-ui-components';
import { ScheduleConfigSchema } from '@pbcm/shared';
import { useJobFormContext } from '../../context/JobFormContext';
import { WEEKDAYS } from '../../lib/jobForm';

export const JobScheduleSettings = () => {
    const { form, agentTimezone } = useJobFormContext();
    const { draft, set, errors } = form;
    const { scheduleEnabled, weekdays } = draft;

    // The last day cannot be taken out: a schedule that runs on no day never runs.
    const toggleDay = (day: string) => {
        if (!weekdays.includes(day)) set('weekdays', [...weekdays, day]);
        else if (weekdays.length > 1) set('weekdays', weekdays.filter((d) => d !== day));
    };

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
                                    onChange={(e) => set('interval', parseInt(e.target.value) || 1)}
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
                            <label className="field-label">Detailed Weekdays</label>
                            <div className="flex flex-wrap gap-2">
                                {WEEKDAYS.map(day => (
                                    <button key={day} onClick={() => toggleDay(day)} className={cn(
                                        'px-2 py-1 text-[10px] uppercase font-bold rounded border transition-colors',
                                        weekdays.includes(day)
                                            ? 'bg-primary/20 border-primary text-primary shadow-glow-accent'
                                            : 'bg-card border-border text-text-muted opacity-60',
                                        FOCUS_RING,
                                    )}>
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
