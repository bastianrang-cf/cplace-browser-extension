import { describe, it, expect } from 'vitest';
import { registry } from '../modules/registry.js';
import adminAccessHighlight from '../modules/admin-access-highlight.js';

describe('registry', () => {
  describe('all()', () => {
    it('returns all registered modules', () => {
      const modules = registry.all();
      expect(modules.length).toBeGreaterThan(0);
      expect(modules.some((m) => m.id === 'admin-access-highlight')).toBe(true);
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
      const mod = registry.byId('admin-access-highlight');
      expect(mod).toBe(adminAccessHighlight);
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
      expect(map['admin-access-highlight']).toBe(false);
    });
  });
});
