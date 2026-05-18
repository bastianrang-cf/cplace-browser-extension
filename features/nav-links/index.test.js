import { describe, it, expect } from 'vitest';
import mod from './index.js';

describe('nav-links module', () => {
  it('has correct id', () => {
    expect(mod.id).toBe('nav-links');
  });

  it('is enabled by default', () => {
    expect(mod.defaultEnabled).toBe(true);
  });

  it('has no actions array', () => {
    expect(mod.actions).toBeUndefined();
  });

  it('has no pageScript flag', () => {
    expect(mod.pageScript).toBeFalsy();
  });

  it('has no css flag', () => {
    expect(mod.css).toBeFalsy();
  });

  it('exposes a navLinks array', () => {
    expect(Array.isArray(mod.navLinks)).toBe(true);
  });

  it('has exactly 7 links', () => {
    expect(mod.navLinks).toHaveLength(7);
  });

  it('every entry has a non-empty string label', () => {
    for (const { label } of mod.navLinks) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a path starting with '/'", () => {
    for (const { path } of mod.navLinks) {
      expect(path).toMatch(/^\//);
    }
  });

  it('all paths are unique', () => {
    const paths = mod.navLinks.map((l) => l.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('all labels are unique', () => {
    const labels = mod.navLinks.map((l) => l.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('includes All Workspaces → /space/allSpaces', () => {
    expect(mod.navLinks.find((l) => l.path === '/space/allSpaces')?.label).toBe('All Workspaces');
  });

  it('includes All Packages → /solutionmanagement/viewAll', () => {
    expect(mod.navLinks.find((l) => l.path === '/solutionmanagement/viewAll')?.label).toBe('All Packages');
  });

  it('includes Batch Jobs → /batchJob/jobs', () => {
    expect(mod.navLinks.find((l) => l.path === '/batchJob/jobs')?.label).toBe('Batch Jobs');
  });

  it('includes Low-Code Dashboard → /cplacejsAdmin/cplaceJSDashboard', () => {
    expect(mod.navLinks.find((l) => l.path === '/cplacejsAdmin/cplaceJSDashboard')?.label).toBe('Low-Code Dashboard');
  });

  it('includes Deleted Items → /restorable/trashCanPages', () => {
    expect(mod.navLinks.find((l) => l.path === '/restorable/trashCanPages')?.label).toBe('Deleted Items');
  });

  it('includes Activity Stream → /awareness/recentChanges', () => {
    expect(mod.navLinks.find((l) => l.path === '/awareness/recentChanges')?.label).toBe('Activity Stream');
  });

  it('includes My Drafts → /draft/myDrafts', () => {
    expect(mod.navLinks.find((l) => l.path === '/draft/myDrafts')?.label).toBe('My Drafts');
  });
});
