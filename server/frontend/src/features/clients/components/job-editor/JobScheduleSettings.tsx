import { Input, Select } from '@stefgo/react-ui-components';
import { useJobFormContext } from '../../context/JobFormContext';

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
            <div className="p-2 border border-border dark:border-border-dark rounded bg-app-bg dark:bg-card-dark">
                <div
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setScheduleEnabled(!scheduleEnabled)}
                >
                    <div className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors ${scheduleEnabled ? 'bg-primary' : 'bg-border dark:bg-border-dark'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${scheduleEnabled ? 'translate-x-4' : ''}`} />
                    </div>
                    <label className="text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase cursor-pointer">
                        {scheduleEnabled ? 'Enabled' : 'Disabled'}
                    </label>
                </div>

                {scheduleEnabled && (
                    <div className="space-y-2 mt-2">
                        {/* Start Time Selection */}
                        <div>
                            <label className="field-label">Next Run (Start At) <span className="text-red-500">*</span></label>
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
                            <div className="text-[10px] text-text-muted dark:text-text-muted-dark mt-1">If set, the job will not run before this time.</div>
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
                                    onChange={(e) => setScheduleUnit(e.target.value)}
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
                                    <button key={day} onClick={() => { if (scheduleWeekdays.includes(day)) { if (scheduleWeekdays.length > 1) setScheduleWeekdays(scheduleWeekdays.filter(d => d !== day)); } else { setScheduleWeekdays([...scheduleWeekdays, day]); } }} className={`px-2 py-1 text-[10px] uppercase font-bold rounded border transition-colors ${scheduleWeekdays.includes(day) ? 'bg-primary/20 border-primary text-primary shadow-glow-accent' : 'bg-white dark:bg-card-dark border-border dark:border-border-dark text-text-muted dark:text-text-muted-dark opacity-60'}`}>
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
