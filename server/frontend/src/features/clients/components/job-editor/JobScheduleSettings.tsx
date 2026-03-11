
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
            <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase">Schedule</label>
            <div className="p-2 border border-gray-200 dark:border-app-border rounded bg-gray-50 dark:bg-app-input">
                <div
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setScheduleEnabled(!scheduleEnabled)}
                >
                    <div className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors ${scheduleEnabled ? 'bg-app-accent' : 'bg-gray-300 dark:bg-app-border'}`}>
                        <div className={`w-4 h-4 bg-app-light rounded-full shadow-md transform transition-transform ${scheduleEnabled ? 'translate-x-4' : ''}`} />
                    </div>
                    <label className="text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase cursor-pointer">
                        {scheduleEnabled ? 'Enabled' : 'Disabled'}
                    </label>
                </div>

                {scheduleEnabled && (
                    <div className="space-y-2 mt-2">
                        {/* Start Time Selection */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Next Run (Start At) <span className="text-red-500">*</span></label>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    value={scheduleStartDate}
                                    onChange={(e) => setScheduleStartDate(e.target.value)}
                                    className="bg-app-light dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main text-sm dark:[color-scheme:dark]"
                                />
                                <input
                                    type="time"
                                    value={scheduleStartTime}
                                    onChange={(e) => setScheduleStartTime(e.target.value)}
                                    className="bg-app-light dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main text-sm dark:[color-scheme:dark]"
                                />
                            </div>
                            <div className="text-[10px] text-gray-400 mt-1">If set, the job will not run before this time.</div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Schedule Interval</label>
                            <div className="flex gap-2">
                                <input type="number" min="1" value={scheduleInterval} onChange={(e) => setScheduleInterval(parseInt(e.target.value) || 1)} className="w-20 bg-app-light dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main" />
                                <select value={scheduleUnit} onChange={(e) => setScheduleUnit(e.target.value)} className="w-auto bg-app-light dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main outline-none">
                                    <option value="seconds">Seconds</option>
                                    <option value="minutes">Minutes</option>
                                    <option value="hours">Hours</option>
                                    <option value="days">Days</option>
                                    <option value="weeks">Weeks</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Detailed Weekdays</label>
                            <div className="flex flex-wrap gap-2">
                                {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => (
                                    <button key={day} onClick={() => { if (scheduleWeekdays.includes(day)) { if (scheduleWeekdays.length > 1) setScheduleWeekdays(scheduleWeekdays.filter(d => d !== day)); } else { setScheduleWeekdays([...scheduleWeekdays, day]); } }} className={`px-2 py-1 text-[10px] uppercase font-bold rounded border transition-colors ${scheduleWeekdays.includes(day) ? 'bg-app-accent/20 border-app-accent text-app-accent shadow-glow-accent' : 'bg-app-light dark:bg-app-input border-gray-200 dark:border-app-border text-gray-400 dark:text-app-text-footer'}`}>
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
