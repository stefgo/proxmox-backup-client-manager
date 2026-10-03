import { describe, expect, it } from 'vitest';
import { CLIENT_STATUS } from '@pbcm/shared';
import { jobListEmpty } from './jobListEmpty';

const online = { status: CLIENT_STATUS.ONLINE };
const offline = { status: CLIENT_STATUS.OFFLINE };

describe('jobListEmpty', () => {
    it('says there are no jobs when there is no client to have one', () => {
        expect(jobListEmpty([])).toEqual({ kind: 'none' });
    });

    it('says there are no jobs when every client answered', () => {
        expect(jobListEmpty([online, online])).toEqual({ kind: 'none' });
    });

    it('says nothing is known when no client is connected', () => {
        expect(jobListEmpty([offline])).toEqual({ kind: 'allOffline' });
        expect(jobListEmpty([offline, offline])).toEqual({ kind: 'allOffline' });
    });

    it('counts the clients that could not be asked', () => {
        expect(jobListEmpty([online, offline, offline])).toEqual({ kind: 'someOffline', offline: 2 });
    });

    it('takes a client without a status for one that is not connected', () => {
        expect(jobListEmpty([{ status: null }, {}])).toEqual({ kind: 'allOffline' });
    });
});
