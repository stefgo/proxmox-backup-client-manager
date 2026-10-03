import { describe, expect, it } from 'vitest';
import { historyQueryString, lastPage, readHistoryView, requestedView, writeHistoryView } from './historyView';

const SIZES = [10, 20, 50];
const read = (query: string) => readHistoryView(new URLSearchParams(query), 20, SIZES);

describe('readHistoryView', () => {
    it('shows the first page of everything for a plain URL', () => {
        expect(read('')).toEqual({ page: 1, pageSize: 20, status: undefined, search: undefined });
    });

    it('reads the page, its size, the status and the search', () => {
        expect(read('page=3&pageSize=50&status=failed&search=nightly')).toEqual({
            page: 3,
            pageSize: 50,
            status: 'failed',
            search: 'nightly',
        });
    });

    it.each(['abc', '0', '-2', '1.5', ''])('falls back to the first page for page=%s', (page) => {
        expect(read(`page=${page}`).page).toBe(1);
    });

    it('ignores a status no run can have, which the server would refuse', () => {
        expect(read('status=broken').status).toBeUndefined();
    });

    it('ignores a page size the bar does not offer', () => {
        expect(read('pageSize=1000').pageSize).toBe(20);
    });

    it('reads an empty search as none', () => {
        expect(read('search=').search).toBeUndefined();
    });

    it('keeps the blank a search ends in, so the next word can be typed', () => {
        expect(read('search=web+').search).toBe('web ');
    });

    it('does not filter by the client a link from before the search names', () => {
        expect(read('clientId=c1')).toEqual(read(''));
    });
});

describe('writeHistoryView', () => {
    const write = (query: string, view: Parameters<typeof writeHistoryView>[1]) =>
        writeHistoryView(new URLSearchParams(query), view, 20).toString();

    it('leaves a plain URL for the default view', () => {
        expect(write('page=3&status=failed', { page: 1, pageSize: 20 })).toBe('');
    });

    it('writes what differs from the default', () => {
        expect(write('', { page: 2, pageSize: 50, status: 'failed', search: 'web 1' }))
            .toBe('page=2&pageSize=50&status=failed&search=web+1');
    });

    it('removes a search that was cleared', () => {
        expect(write('search=nightly', { page: 1, pageSize: 20 })).toBe('');
    });

    it('drops the client filter a link from before the search carries', () => {
        expect(write('clientId=c1', { page: 2, pageSize: 20 })).toBe('page=2');
    });

    it('keeps a parameter that is not its own', () => {
        expect(write('tab=runs', { page: 2, pageSize: 20 })).toBe('tab=runs&page=2');
    });

    it('does not change the parameters it was given', () => {
        const params = new URLSearchParams('page=3');
        writeHistoryView(params, { page: 1, pageSize: 20 }, 20);
        expect(params.toString()).toBe('page=3');
    });

    it('reads back what it wrote', () => {
        const view = { page: 4, pageSize: 10, status: 'abort' as const, search: 'c 1' };
        expect(readHistoryView(writeHistoryView(new URLSearchParams(), view, 20), 20, SIZES)).toEqual(view);
    });
});

describe('historyQueryString', () => {
    it('asks for the first page from the start', () => {
        expect(historyQueryString({ page: 1, pageSize: 20 })).toBe('limit=20&offset=0');
    });

    it('skips the pages before the one it asks for', () => {
        expect(historyQueryString({ page: 3, pageSize: 20 })).toBe('limit=20&offset=40');
    });

    it('names the filters, and encodes them', () => {
        expect(historyQueryString({ page: 1, pageSize: 10, status: 'failed', clientId: 'a&b' }))
            .toBe('limit=10&offset=0&status=failed&clientId=a%26b');
    });

    it('sends the search without the blanks around it', () => {
        expect(historyQueryString({ page: 1, pageSize: 10, search: ' web ' })).toBe('limit=10&offset=0&search=web');
    });

    it('sends no search for blanks alone, which the server would refuse', () => {
        expect(historyQueryString({ page: 1, pageSize: 10, search: '   ' })).toBe('limit=10&offset=0');
    });

    it('sends the search, and encodes it', () => {
        expect(historyQueryString({ page: 1, pageSize: 10, search: '50% & more' }))
            .toBe('limit=10&offset=0&search=50%25+%26+more');
    });
});

describe('requestedView', () => {
    const settled = { page: 3, pageSize: 20, search: 'web' };

    it('asks for another page at once', () => {
        const view = { ...settled, page: 4 };
        expect(requestedView(view, settled)).toBe(view);
    });

    it('asks for another status at once', () => {
        const view = { ...settled, page: 1, status: 'failed' as const };
        expect(requestedView(view, settled)).toBe(view);
    });

    it('keeps asking for the search before while another is being typed', () => {
        expect(requestedView({ page: 1, pageSize: 20, search: 'webs' }, settled)).toBe(settled);
    });

    it('waits for a search that is being cleared, too', () => {
        expect(requestedView({ page: 1, pageSize: 20 }, settled)).toBe(settled);
    });
});

describe('lastPage', () => {
    it('is the first page for an empty history', () => {
        expect(lastPage(0, 20)).toBe(1);
    });

    it('does not open a page for a full last one', () => {
        expect(lastPage(40, 20)).toBe(2);
    });

    it('opens a page for the rows left over', () => {
        expect(lastPage(41, 20)).toBe(3);
    });
});
