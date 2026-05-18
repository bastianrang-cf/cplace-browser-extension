import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { injectModuleCSS, removeModuleCSS, injectPageScript, removePageScript } from './utils.js';

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p) => `chrome-extension://test/${p}`);
  document.documentElement.innerHTML = '<head></head><body></body>';
});

describe('injectModuleCSS()', () => {
  it('creates a link element with the correct id', () => {
    injectModuleCSS('my-module');
    expect(document.getElementById('cplace-my-module-link')).not.toBeNull();
  });

  it('sets rel=stylesheet and correct href', () => {
    injectModuleCSS('my-module');
    const link = document.getElementById('cplace-my-module-link');
    expect(link.rel).toBe('stylesheet');
    expect(link.href).toContain('my-module-module.css');
  });

  it('appends to document head', () => {
    injectModuleCSS('my-module');
    expect(document.head.contains(document.getElementById('cplace-my-module-link'))).toBe(true);
  });

  it('falls back to documentElement when head is absent', () => {
    document.head.remove();
    injectModuleCSS('my-module');
    const link = document.getElementById('cplace-my-module-link');
    expect(link).not.toBeNull();
    expect(document.documentElement.contains(link)).toBe(true);
  });

  it('is idempotent — calling twice creates only one element', () => {
    injectModuleCSS('my-module');
    injectModuleCSS('my-module');
    expect(document.querySelectorAll('#cplace-my-module-link').length).toBe(1);
  });
});

describe('removeModuleCSS()', () => {
  it('removes the link element', () => {
    injectModuleCSS('my-module');
    removeModuleCSS('my-module');
    expect(document.getElementById('cplace-my-module-link')).toBeNull();
  });

  it('is safe when no element exists', () => {
    expect(() => removeModuleCSS('my-module')).not.toThrow();
  });
});

describe('injectPageScript()', () => {
  it('creates a script element with the correct id', () => {
    injectPageScript('my-module');
    expect(document.getElementById('cplace-my-module-script')).not.toBeNull();
  });

  it('sets correct src', () => {
    injectPageScript('my-module');
    const script = document.getElementById('cplace-my-module-script');
    expect(script.src).toContain('my-module-page.js');
  });

  it('appends to document head', () => {
    injectPageScript('my-module');
    expect(document.head.contains(document.getElementById('cplace-my-module-script'))).toBe(true);
  });

  it('falls back to documentElement when head is absent', () => {
    document.head.remove();
    injectPageScript('my-module');
    const script = document.getElementById('cplace-my-module-script');
    expect(script).not.toBeNull();
    expect(document.documentElement.contains(script)).toBe(true);
  });

  it('is idempotent — calling twice creates only one element', () => {
    injectPageScript('my-module');
    injectPageScript('my-module');
    expect(document.querySelectorAll('#cplace-my-module-script').length).toBe(1);
  });
});

describe('removePageScript()', () => {
  it('removes the script element', () => {
    injectPageScript('my-module');
    removePageScript('my-module');
    expect(document.getElementById('cplace-my-module-script')).toBeNull();
  });

  it('is safe when no element exists', () => {
    expect(() => removePageScript('my-module')).not.toThrow();
  });
});
