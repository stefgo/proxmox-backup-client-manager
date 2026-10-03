import { describe, expect, it } from 'vitest';
import { settingsFrom } from './sections';

describe('settingsFrom', () => {
    it('keeps what the UI saved, which is text', () => {
        expect(settingsFrom({ token_retention_days: '30' })).toEqual({ token_retention_days: '30' });
    });

    // An operator who edits config.yaml by hand writes `token_retention_days: 30`.
    it('turns a number from the file into the text the form edits', () => {
        expect(settingsFrom({ token_retention_days: 30 })).toEqual({ token_retention_days: '30' });
    });

    it('keeps zero, which switches a timer off', () => {
        expect(settingsFrom({ token_cleanup_interval_hours: 0 })).toEqual({ token_cleanup_interval_hours: '0' });
    });

    // `security` travels in the same answer and is not a setting of this page.
    it('leaves out what is neither text nor a number', () => {
        expect(
            settingsFrom({ security: { allowed_networks: ['10.0.0.0/8'] }, enabled: true, note: null }),
        ).toEqual({});
    });
});
