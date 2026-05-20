import { describe, it, expect } from 'vitest';
import { registry } from '../features/registry.js';
import versionBadge from '../features/version-badge/index.js';

describe('registry', () => {
  describe('all()', () => {
    it('returns all registered modules', () => {
      const modules = registry.all();
      expect(modules.length).toBeGreaterThan(0);
      expect(modules.some((m) => m.id === 'domain-css')).toBe(true);
    });

    it('returns a shallow copy — mutating result does not affect registry', () => {
      const a = registry.all();
      a.pop();
      const b = registry.all();
      expect(b.length).toBe(a.length + 1);
    });
  });

  describe('byId()', () => {
    it('returns the correct module by id', () => {
      const mod = registry.byId('version-badge');
      expect(mod).toBe(versionBadge);
    });

    it('returns undefined for an unknown id', () => {
      expect(registry.byId('does-not-exist')).toBeUndefined();
    });
  });

  describe('defaultEnabledMap()', () => {
    it('includes all registered module ids', () => {
      const map = registry.defaultEnabledMap();
      for (const mod of registry.all()) {
        expect(Object.hasOwn(map, mod.id)).toBe(true);
      }
    });

    it('maps defaultEnabled truthiness correctly', () => {
      const map = registry.defaultEnabledMap();
      expect(map['domain-css']).toBe(false);
      expect(map['version-badge']).toBe(true);
    });
  });

  describe('defaultOptionsMap()', () => {
    it('only includes modules that declare options or defaultOptions', () => {
      const map = registry.defaultOptionsMap();
      expect(Object.hasOwn(map, 'version-badge')).toBe(false);
      expect(Object.hasOwn(map, 'language-switcher')).toBe(false);
    });

    it('includes batch-jobs with its default option values', () => {
      const map = registry.defaultOptionsMap();
      expect(map['batch-jobs']).toEqual({ limitJobs: 10, pollInterval: 60 });
    });

    it('uses opt.default as the value for each option', () => {
      const map = registry.defaultOptionsMap();
      for (const mod of registry.all()) {
        if (!Array.isArray(mod.options) || mod.options.length === 0) continue;
        for (const opt of mod.options) {
          expect(map[mod.id][opt.id]).toBe(opt.default);
        }
      }
    });

    it('includes domain-css seeded rules from defaultOptions', () => {
      const map = registry.defaultOptionsMap();
      expect(map['domain-css']).toBeDefined();
      expect(map['domain-css'].rules).toBeInstanceOf(Array);
      expect(map['domain-css'].rules.length).toBeGreaterThan(0);
      expect(map['domain-css'].rules[0]).toHaveProperty('pattern');
      expect(map['domain-css'].rules[0]).toHaveProperty('css');
    });
  });
});
