import { describe, expect, it } from 'vitest';
import { historyQueryString, lastPage, readHistoryView, writeHistoryView } from './historyView';

const SIZES = [10, 20, 50];
const read = (query: string) => readHistoryView(new URLSearchParams(query), 20, SIZES);

describe('readHistoryView', () => {
    it('shows the first page of everything for a plain URL', () => {
        expect(read('')).toEqual({ page: 1, pageSize: 20, status: undefined, clientId: undefined });
    });

    it('reads the page, its size and both filters', () => {
        expect(read('page=3&pageSize=50&status=failed&clientId=c1')).toEqual({
            page: 3,
            pageSize: 50,
            status: 'failed',
            clientId: 'c1',
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

    it('reads an empty client id as no filter', () => {
        expect(read('clientId=').clientId).toBeUndefined();
    });
});

describe('writeHistoryView', () => {
    const write = (query: string, view: Parameters<typeof writeHistoryView>[1]) =>
        writeHistoryView(new URLSearchParams(query), view, 20).toString();

    it('leaves a plain URL for the default view', () => {
        expect(write('page=3&status=failed', { page: 1, pageSize: 20 })).toBe('');
    });

    it('writes what differs from the default', () => {
        expect(write('', { page: 2, pageSize: 50, status: 'failed', clientId: 'c1' }))
            .toBe('page=2&pageSize=50&status=failed&clientId=c1');
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
        const view = { page: 4, pageSize: 10, status: 'abort' as const, clientId: 'c 1' };
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
