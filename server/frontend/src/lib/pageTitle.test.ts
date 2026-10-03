import { describe, expect, it } from 'vitest';
import { pageTitle, routeTitle, type TitleSubject } from './pageTitle';

const names = (known: Partial<Record<TitleSubject, string>>) => (subject: TitleSubject) => known[subject];

describe('pageTitle', () => {
    it('ends in the name of the application', () => {
        expect(pageTitle(['web01', 'Clients'])).toBe('web01 · Clients · PBCM');
    });

    it('is the name of the application alone when nothing names the page', () => {
        expect(pageTitle([])).toBe('PBCM');
    });

    it('leaves out a part that is missing', () => {
        expect(pageTitle([undefined, 'Clients', null, ''])).toBe('Clients · PBCM');
    });
});

describe('routeTitle', () => {
    const area = { nav: { label: 'Clients' } };

    it('names the area on its list', () => {
        expect(routeTitle([area, undefined], names({}))).toBe('Clients · PBCM');
    });

    it('puts the subject in front of its area', () => {
        expect(routeTitle([area, { subject: 'client' }, undefined], names({ client: 'web01' }))).toBe(
            'web01 · Clients · PBCM',
        );
    });

    it('puts a route below the subject in front of it', () => {
        expect(routeTitle([area, { subject: 'client' }, { title: 'Edit' }], names({ client: 'web01' }))).toBe(
            'Edit · web01 · Clients · PBCM',
        );
    });

    it('calls a route by its subject rather than its title once the subject has a name', () => {
        const handles = [area, { subject: 'client' as const }, { subject: 'job' as const, title: 'Job' }];
        expect(routeTitle(handles, names({ client: 'web01', job: 'nightly' }))).toBe(
            'nightly · web01 · Clients · PBCM',
        );
        expect(routeTitle(handles, names({ client: 'web01' }))).toBe('Job · web01 · Clients · PBCM');
    });

    it('leaves out a subject that has neither a name nor a title', () => {
        expect(routeTitle([area, { subject: 'client' }], names({}))).toBe('Clients · PBCM');
    });

    it('is the name of the application outside every area', () => {
        expect(routeTitle([undefined], names({}))).toBe('PBCM');
    });
});
