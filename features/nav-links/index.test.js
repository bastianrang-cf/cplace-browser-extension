import { describe, it, expect, vi } from 'vitest';
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

  it('has exactly 10 links', () => {
    expect(mod.navLinks).toHaveLength(10);
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

  it('includes Low-Code Logs → /cplacejsAdmin/cplaceJSLogs', () => {
    expect(mod.navLinks.find((l) => l.path === '/cplacejsAdmin/cplaceJSLogs')?.label).toBe('Low-Code Logs');
  });

  it('includes API Tokens → /cf/cplace/apiToken/handler/viewAll', () => {
    expect(mod.navLinks.find((l) => l.path === '/cf/cplace/apiToken/handler/viewAll')?.label).toBe('API Tokens');
  });

  it('includes AI Settings → /application/viewAiSettings', () => {
    expect(mod.navLinks.find((l) => l.path === '/application/viewAiSettings')?.label).toBe('AI Settings');
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

describe('nav-links options', () => {
  it('defaults disabledPaths to an empty array', () => {
    expect(mod.defaultOptions).toEqual({ disabledPaths: [] });
  });

  it('exposes a renderOptions function', () => {
    expect(typeof mod.renderOptions).toBe('function');
  });

  it('renders one checkbox per nav link, all checked when disabledPaths is empty', () => {
    const container = document.createElement('div');
    mod.renderOptions(container, {
      getOptions: () => ({ disabledPaths: [] }),
      setOptions: () => {},
      getDefaults: () => ({ disabledPaths: [] }),
    });
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(mod.navLinks.length);
    for (const cb of boxes) expect(cb.checked).toBe(true);
  });

  it('renders checkboxes unchecked for paths in disabledPaths', () => {
    const container = document.createElement('div');
    mod.renderOptions(container, {
      getOptions: () => ({ disabledPaths: ['/space/allSpaces', '/draft/myDrafts'] }),
      setOptions: () => {},
      getDefaults: () => ({ disabledPaths: [] }),
    });
    const rows = container.querySelectorAll('.nav-links-row');
    const states = {};
    rows.forEach((row, i) => {
      states[mod.navLinks[i].path] = row.querySelector('input[type="checkbox"]').checked;
    });
    expect(states['/space/allSpaces']).toBe(false);
    expect(states['/draft/myDrafts']).toBe(false);
    expect(states['/batchJob/jobs']).toBe(true);
  });

  it('calls setOptions with the path added to disabledPaths when a box is unchecked', () => {
    const container = document.createElement('div');
    const setOptions = vi.fn();
    mod.renderOptions(container, {
      getOptions: () => ({ disabledPaths: [] }),
      setOptions,
      getDefaults: () => ({ disabledPaths: [] }),
    });
    const firstBox = container.querySelectorAll('input[type="checkbox"]')[0];
    firstBox.checked = false;
    firstBox.dispatchEvent(new Event('change'));
    expect(setOptions).toHaveBeenCalledWith({ disabledPaths: [mod.navLinks[0].path] });
  });

  it('calls setOptions with the path removed when a previously-disabled box is re-checked', () => {
    const container = document.createElement('div');
    const setOptions = vi.fn();
    const path = mod.navLinks[0].path;
    mod.renderOptions(container, {
      getOptions: () => ({ disabledPaths: [path] }),
      setOptions,
      getDefaults: () => ({ disabledPaths: [] }),
    });
    const firstBox = container.querySelectorAll('input[type="checkbox"]')[0];
    expect(firstBox.checked).toBe(false);
    firstBox.checked = true;
    firstBox.dispatchEvent(new Event('change'));
    expect(setOptions).toHaveBeenCalledWith({ disabledPaths: [] });
  });
});
