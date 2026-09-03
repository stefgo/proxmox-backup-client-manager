import { Input, Select, Switch, cn } from '@stefgo/react-ui-components';
import { ScheduleConfigSchema } from '@pbcm/shared';
import { useJobFormContext } from '../../context/JobFormContext';
import { FOCUS_RING } from '../../../../styles/focus';

export const JobScheduleSettings = () => {
    const {
        scheduleEnabled, setScheduleEnabled,
        scheduleInterval, setScheduleInterval,
        scheduleUnit, setScheduleUnit,
        scheduleWeekdays, setScheduleWeekdays,
        scheduleStartDate, setScheduleStartDate,
        scheduleStartTime, setScheduleStartTime,
    } = useJobFormContext();

    return (
        <div className="space-y-1">
            <label className="field-label">Schedule</label>
            <div className="p-2 border border-border rounded bg-app-bg">
                <Switch
                    value={scheduleEnabled}
                    onChange={setScheduleEnabled}
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
                                    value={scheduleStartDate}
                                    onChange={(e) => setScheduleStartDate(e.target.value)}
                                    fullWidth={false}
                                />
                                <Input
                                    type="time"
                                    value={scheduleStartTime}
                                    onChange={(e) => setScheduleStartTime(e.target.value)}
                                    fullWidth={false}
                                />
                            </div>
                            <div className="text-[10px] text-text-muted mt-1">If set, the job will not run before this time.</div>
                        </div>

                        <div>
                            <label className="field-label">Schedule Interval</label>
                            <div className="flex gap-2">
                                <Input
                                    type="number"
                                    min="1"
                                    value={scheduleInterval}
                                    onChange={(e) => setScheduleInterval(parseInt(e.target.value) || 1)}
                                    fullWidth={false}
                                    classNames={{ input: "w-20" }}
                                />
                                <Select
                                    value={scheduleUnit}
                                    onChange={(e) => {
                                        // e.target.value is a plain string; the
                                        // options below are the schema's own values,
                                        // so this narrows without asserting.
                                        const unit = ScheduleConfigSchema.shape.unit.safeParse(e.target.value);
                                        if (unit.success) setScheduleUnit(unit.data);
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
                                {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => (
                                    <button key={day} onClick={() => { if (scheduleWeekdays.includes(day)) { if (scheduleWeekdays.length > 1) setScheduleWeekdays(scheduleWeekdays.filter(d => d !== day)); } else { setScheduleWeekdays([...scheduleWeekdays, day]); } }} className={cn(
                                        "px-2 py-1 text-[10px] uppercase font-bold rounded border transition-colors",
                                        scheduleWeekdays.includes(day)
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
