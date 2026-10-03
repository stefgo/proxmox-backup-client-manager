import type { ComponentProps } from 'react';
import type { Badge } from '@stefgo/react-ui-components';
import { JOB_STATUS } from '@pbcm/shared';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

// The status maps to a role, not to a colour -- Badge owns what each role
// looks like, in both themes.
const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
    [JOB_STATUS.RUNNING]: 'info',
    [JOB_STATUS.SUCCESS]: 'success',
    [JOB_STATUS.FAILED]: 'error',
    [JOB_STATUS.ABORTED]: 'warning',
    [JOB_STATUS.MISSED]: 'warning',
};

/**
 * The badge a run's status wears, wherever a run is shown. "neutral" covers idle, queued,
 * skipped and anything an older agent might report.
 */
export const statusBadgeVariant = (status: string): BadgeVariant => STATUS_BADGE_VARIANT[status] ?? 'neutral';
