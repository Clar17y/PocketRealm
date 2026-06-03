import { describe, it, expect } from 'vitest';
import { changelog, getLatestVersion, CHANGELOG_STORAGE_KEY } from './changelog';

describe('changelog', () => {
  it('returns the latest version', () => {
    expect(getLatestVersion()).toBe(changelog[0].version);
  });

  it('announces support reporting and Discord links', () => {
    const entry = changelog.find((item) => item.title === 'Support Links & Bug Reports');

    expect(entry).toBeDefined();
    expect(entry?.summary).toMatch(/Discord/i);
    expect(entry?.summary).toMatch(/bug reports/i);
  });

  it('entries are newest-first by date', () => {
    for (let i = 1; i < changelog.length; i++) {
      expect(new Date(changelog[i - 1].date).getTime())
        .toBeGreaterThanOrEqual(new Date(changelog[i].date).getTime());
    }
  });

  it('has no duplicate versions', () => {
    const versions = changelog.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('every entry has required fields', () => {
    for (const entry of changelog) {
      expect(entry.version).toBeTruthy();
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.title).toBeTruthy();
      expect(entry.summary).toBeTruthy();
    }
  });

  it('exports a storage key constant', () => {
    expect(CHANGELOG_STORAGE_KEY).toBe('lastSeenChangelog');
  });
});
