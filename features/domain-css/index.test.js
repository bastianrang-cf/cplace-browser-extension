import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import mod, { compileGlob, ruleMatches } from './index.js';

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);
  // reset internal state across tests by reverting
  mod.revert();
});

describe('domain-css — descriptor shape', () => {
  it('has the right id and defaults', () => {
    expect(mod.id).toBe('domain-css');
    expect(mod.defaultEnabled).toBe(false);
    expect(mod.defaultOptions.rules).toBeInstanceOf(Array);
    expect(mod.defaultOptions.rules.length).toBeGreaterThan(0);
  });
});

describe('domain-css — compileGlob', () => {
  it('treats a bare hostname as a host glob with any path', () => {
    const g = compileGlob('test.cplace.cloud');
    expect(g.hostRe.test('test.cplace.cloud')).toBe(true);
    expect(g.hostRe.test('other.cplace.cloud')).toBe(false);
    expect(g.pathRe).toBeNull();
  });

  it('treats * as a wildcard across dots and slashes', () => {
    const g = compileGlob('*.cplace.cloud');
    expect(g.hostRe.test('foo.cplace.cloud')).toBe(true);
    expect(g.hostRe.test('foo.bar.cplace.cloud')).toBe(true);
    expect(g.hostRe.test('cplace.cloud')).toBe(false);
  });

  it('splits on the first slash into host + path globs', () => {
    const g = compileGlob('dev-customer.com/prefix-*');
    expect(g.hostRe.test('dev-customer.com')).toBe(true);
    expect(g.pathRe.test('/prefix-foo')).toBe(true);
    expect(g.pathRe.test('/elsewhere')).toBe(false);
  });

  it('returns null for invalid input', () => {
    expect(compileGlob('')).toBeNull();
    expect(compileGlob(null)).toBeNull();
    expect(compileGlob('/no-host')).toBeNull();
  });

  it('escapes regex special chars in the literal', () => {
    const g = compileGlob('a+b.cplace.cloud');
    expect(g.hostRe.test('a+b.cplace.cloud')).toBe(true);
    expect(g.hostRe.test('aab.cplace.cloud')).toBe(false);
  });
});

describe('domain-css — ruleMatches', () => {
  it('matches host-only patterns regardless of path', () => {
    expect(ruleMatches({ pattern: '*.cplace.cloud' }, 'foo.cplace.cloud', '/any')).toBe(true);
  });

  it('rejects when host does not match', () => {
    expect(ruleMatches({ pattern: '*.cplace.cloud' }, 'evil.com', '/any')).toBe(false);
  });

  it('rejects when path part is present and does not match', () => {
    expect(ruleMatches({ pattern: 'host.tld/prefix-*' }, 'host.tld', '/other')).toBe(false);
    expect(ruleMatches({ pattern: 'host.tld/prefix-*' }, 'host.tld', '/prefix-foo')).toBe(true);
  });
});

describe('domain-css — apply / revert / onCplaceFound', () => {
  let send;

  beforeEach(() => {
    send = fakeBrowser.runtime.sendMessage;
    send.mockClear();
    delete window.location;
    window.location = new URL('https://test.cplace.cloud/foo');
    Object.defineProperty(window.location, 'protocol', { value: 'https:', configurable: true });
  });

  function setLocation(href) {
    delete window.location;
    const u = new URL(href);
    window.location = {
      protocol: u.protocol,
      hostname: u.hostname,
      pathname: u.pathname,
      origin: u.origin,
      href: u.href,
    };
  }

  it('does not send any message when cplace is not found', () => {
    setLocation('https://test.cplace.cloud/foo');
    mod.apply({ rules: [{ pattern: '*', css: 'body { color: red; }' }] }, { cplaceFound: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends apply with matched css when cplace is found', () => {
    setLocation('https://test.cplace.cloud/foo');
    mod.apply(
      { rules: [{ pattern: '*.cplace.cloud', css: 'body { color: red; }' }] },
      { cplaceFound: true },
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cplace:domainCss:apply', css: 'body { color: red; }' }),
    );
  });

  it('omits rules whose pattern does not match the current location', () => {
    setLocation('https://other.example.com/path');
    mod.apply(
      { rules: [{ pattern: '*.cplace.cloud', css: 'body { color: red; }' }] },
      { cplaceFound: true },
    );
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cplace:domainCss:apply' }),
    );
  });

  it('concatenates css from multiple matching rules', () => {
    setLocation('https://test.cplace.cloud/foo');
    mod.apply(
      {
        rules: [
          { pattern: '*.cplace.cloud', css: 'a {}' },
          { pattern: 'test.cplace.cloud', css: 'b {}' },
        ],
      },
      { cplaceFound: true },
    );
    const call = send.mock.calls.find((c) => c[0]?.type === 'cplace:domainCss:apply');
    expect(call[0].css).toContain('a {}');
    expect(call[0].css).toContain('b {}');
  });

  it('skips chrome:// and other internal protocols', () => {
    setLocation('chrome://extensions/');
    mod.apply(
      { rules: [{ pattern: '*', css: 'body { color: red; }' }] },
      { cplaceFound: true },
    );
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cplace:domainCss:apply' }),
    );
  });

  it('sends revert when cplace becomes not-found after an apply', () => {
    setLocation('https://test.cplace.cloud/foo');
    mod.apply(
      { rules: [{ pattern: '*', css: 'a {}' }] },
      { cplaceFound: true },
    );
    send.mockClear();
    mod.onCplaceFound(false);
    expect(send).toHaveBeenCalledWith({ type: 'cplace:domainCss:revert' });
  });

  it('sends apply when cplace becomes found after rules are already set', () => {
    setLocation('https://test.cplace.cloud/foo');
    mod.apply(
      { rules: [{ pattern: '*', css: 'a {}' }] },
      { cplaceFound: false },
    );
    send.mockClear();
    mod.onCplaceFound(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cplace:domainCss:apply' }),
    );
  });

  it('revert clears state and is idempotent', () => {
    setLocation('https://test.cplace.cloud/foo');
    mod.apply({ rules: [{ pattern: '*', css: 'a {}' }] }, { cplaceFound: true });
    send.mockClear();
    mod.revert();
    expect(send).toHaveBeenCalledWith({ type: 'cplace:domainCss:revert' });
    send.mockClear();
    mod.revert();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not re-send apply when computed css is unchanged', () => {
    setLocation('https://test.cplace.cloud/foo');
    mod.apply({ rules: [{ pattern: '*', css: 'a {}' }] }, { cplaceFound: true });
    send.mockClear();
    mod.onCplaceFound(true);
    expect(send).not.toHaveBeenCalled();
  });
});
