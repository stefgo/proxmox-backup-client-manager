import { describe, expect, it } from 'vitest';
import { parentPath } from './backPath';

describe('parentPath', () => {
    it('is the route above an editor', () => {
        expect(parentPath(['/', '/clients', '/clients/a', '/clients/a/edit'])).toBe('/clients/a');
        expect(parentPath(['/', '/clients', '/clients/new'])).toBe('/clients');
    });

    it('skips path segments that are no route of their own', () => {
        // There is no `/clients/a/jobs` in the tree, so that is not where back is.
        expect(parentPath(['/', '/clients', '/clients/a', '/clients/a/jobs/new'])).toBe('/clients/a');
        expect(parentPath(['/', '/clients', '/clients/a', '/clients/a/restore/3/host/17'])).toBe('/clients/a');
    });

    it('follows the tree, not the address, for a job opened from the dashboard', () => {
        // The editor is a child of the dashboard at `/`; there is no `/jobs` to go back to.
        expect(parentPath(['/', '/', '/jobs/a/job-1'])).toBe('/');
        expect(parentPath(['/', '/', '/jobs/new'])).toBe('/');
    });

    it('looks past an index route, which repeats its parent with a trailing slash', () => {
        expect(parentPath(['/', '/clients', '/clients/a', '/clients/a/'])).toBe('/clients');
        expect(parentPath(['/', '/clients', '/clients/'])).toBe('/');
    });

    it('looks past layout routes without a path', () => {
        expect(parentPath(['/', '/', '/clients', '/clients/a', '/clients/a/edit'])).toBe('/clients/a');
    });

    it('is the root for a page directly below it, and for nothing at all', () => {
        expect(parentPath(['/', '/history'])).toBe('/');
        expect(parentPath(['/'])).toBe('/');
        expect(parentPath([])).toBe('/');
    });
});
