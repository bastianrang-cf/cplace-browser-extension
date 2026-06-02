import { describe, it, expect } from 'vitest';
import { pruneSnooze, snoozeState, snoozeEntryFor, SNOOZE_DURATION_MS } from '../features/snooze.js';

describe('snooze helpers', () => {
  const now = 1_000_000;

  describe('snoozeState', () => {
    it('returns off for a missing entry', () => {
      expect(snoozeState(undefined, now)).toBe('off');
      expect(snoozeState(null, now)).toBe('off');
    });

    it('returns deactivate when until is null', () => {
      expect(snoozeState({ until: null }, now)).toBe('deactivate');
    });

    it('returns snooze when until is in the future', () => {
      expect(snoozeState({ until: now + 1000 }, now)).toBe('snooze');
    });

    it('returns off when until is in the past (expired)', () => {
      expect(snoozeState({ until: now - 1000 }, now)).toBe('off');
    });
  });

  describe('pruneSnooze', () => {
    it('drops expired snooze entries and keeps active ones', () => {
      const map = {
        'https://a/t': {
          'batch-jobs': { until: now + 1000 }, // future → keep
          'domain-css': { until: now - 1000 }, // expired → drop
          'low-code-logs': { until: null }, // deactivated → keep
        },
      };
      expect(pruneSnooze(map, now)).toEqual({
        'https://a/t': {
          'batch-jobs': { until: now + 1000 },
          'low-code-logs': { until: null },
        },
      });
    });

    it('drops tenants that become empty', () => {
      const map = { 'https://a/t': { 'batch-jobs': { until: now - 1000 } } };
      expect(pruneSnooze(map, now)).toEqual({});
    });

    it('tolerates an empty/undefined map', () => {
      expect(pruneSnooze(undefined, now)).toEqual({});
      expect(pruneSnooze({}, now)).toEqual({});
    });
  });

  describe('snoozeEntryFor', () => {
    it('builds a 1-day snooze entry', () => {
      expect(snoozeEntryFor('snooze', now)).toEqual({ until: now + SNOOZE_DURATION_MS });
    });

    it('builds a soft-deactivate entry', () => {
      expect(snoozeEntryFor('deactivate', now)).toEqual({ until: null });
    });

    it('returns null for off (clears the entry)', () => {
      expect(snoozeEntryFor('off', now)).toBeNull();
    });
  });
});
