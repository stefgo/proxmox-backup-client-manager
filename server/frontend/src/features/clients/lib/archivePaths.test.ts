import { describe, expect, it } from 'vitest';
import {
    excludePatternFromPath,
    getDefaultNameFromPath,
    sanitizeArchiveName,
} from './archivePaths';

describe('sanitizeArchiveName', () => {
    it('keeps letters, digits, dash and underscore', () => {
        expect(sanitizeArchiveName('home_dir-2')).toBe('home_dir-2');
    });

    it('drops spaces, dots and everything else', () => {
        expect(sanitizeArchiveName('my home.pxar')).toBe('myhomepxar');
        expect(sanitizeArchiveName('büro/daten')).toBe('brodaten');
    });

    it('drops every leading dash, which the CLI would read as an option', () => {
        expect(sanitizeArchiveName('-rf')).toBe('rf');
        expect(sanitizeArchiveName('--all')).toBe('all');
        expect(sanitizeArchiveName('a-b-')).toBe('a-b-');
    });

    it('drops a dash that only leads once what stood before it is gone', () => {
        expect(sanitizeArchiveName('.-hidden')).toBe('hidden');
        expect(sanitizeArchiveName(' -x')).toBe('x');
    });

    it('can leave nothing', () => {
        expect(sanitizeArchiveName('')).toBe('');
        expect(sanitizeArchiveName('-.-')).toBe('');
    });
});

describe('getDefaultNameFromPath', () => {
    it('names an empty path or the current directory "current"', () => {
        expect(getDefaultNameFromPath('')).toBe('current');
        expect(getDefaultNameFromPath('.')).toBe('current');
    });

    it('names the root "root"', () => {
        expect(getDefaultNameFromPath('/')).toBe('root');
    });

    it('takes the last segment', () => {
        expect(getDefaultNameFromPath('/home')).toBe('home');
        expect(getDefaultNameFromPath('/var/lib/docker')).toBe('docker');
    });

    it('ignores trailing and doubled slashes', () => {
        expect(getDefaultNameFromPath('/var/lib/')).toBe('lib');
        expect(getDefaultNameFromPath('/var//lib//')).toBe('lib');
    });

    it('sanitizes the segment', () => {
        expect(getDefaultNameFromPath('/home/stefan/.cache')).toBe('cache');
        expect(getDefaultNameFromPath('/srv/my data')).toBe('mydata');
        expect(getDefaultNameFromPath('/srv/-old')).toBe('old');
    });

    it('falls back to "archive" when nothing usable is left', () => {
        expect(getDefaultNameFromPath('/srv/...')).toBe('archive');
        expect(getDefaultNameFromPath('//')).toBe('archive');
    });
});

describe('excludePatternFromPath', () => {
    const archives = (...paths: string[]) => paths.map((path) => ({ path }));

    it('is null for a path that lies in no archive', () => {
        expect(excludePatternFromPath('/etc/passwd', archives('/home'))).toBeNull();
        expect(excludePatternFromPath('/etc', [])).toBeNull();
    });

    it('is null for the archive root itself', () => {
        expect(excludePatternFromPath('/home', archives('/home'))).toBeNull();
        expect(excludePatternFromPath('/home/', archives('/home'))).toBeNull();
        expect(excludePatternFromPath('/', archives('/'))).toBeNull();
    });

    it('rebases the path onto the archive root, anchored with a slash', () => {
        expect(excludePatternFromPath('/home/stefan/.cache', archives('/home'))).toBe('/stefan/.cache');
    });

    it('keeps the whole path in an archive of /', () => {
        expect(excludePatternFromPath('/var/tmp', archives('/'))).toBe('/var/tmp');
    });

    it('does not take a sibling that only shares the prefix', () => {
        expect(excludePatternFromPath('/homework/x', archives('/home'))).toBeNull();
    });

    it('lets the deepest archive win when archives are nested', () => {
        const nested = archives('/', '/home', '/home/stefan');
        expect(excludePatternFromPath('/home/stefan/.cache', nested)).toBe('/.cache');
        expect(excludePatternFromPath('/home/other/.cache', nested)).toBe('/other/.cache');
        expect(excludePatternFromPath('/etc/ssl', nested)).toBe('/etc/ssl');
        // Whatever order they were added in.
        expect(excludePatternFromPath('/home/stefan/.cache', nested.reverse())).toBe('/.cache');
    });

    it('excludes a nested archive root from the archive around it', () => {
        expect(excludePatternFromPath('/home/stefan', archives('/home', '/home/stefan'))).toBe('/stefan');
    });

    it('ignores trailing and doubled slashes on either side', () => {
        expect(excludePatternFromPath('/home//stefan/.cache/', archives('/home/'))).toBe('/stefan/.cache');
        expect(excludePatternFromPath('home/stefan', archives('//home'))).toBe('/stefan');
    });
});
