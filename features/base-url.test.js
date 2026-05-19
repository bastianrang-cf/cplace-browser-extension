import { describe, it, expect } from 'vitest';
import { deriveBaseUrl } from './base-url.js';

describe('deriveBaseUrl', () => {
  it('returns origin and null tenant for single-tenant ("/" context)', () => {
    expect(
      deriveBaseUrl({ origin: 'https://cplace.example.com', hostname: 'cplace.example.com', context: '/' }),
    ).toEqual({
      origin: 'https://cplace.example.com',
      instance: 'cplace.example.com',
      tenant: null,
      baseUrl: 'https://cplace.example.com',
      contextPath: '/',
    });
  });

  it('extracts tenant from multi-tenant context ("/training/")', () => {
    expect(
      deriveBaseUrl({ origin: 'https://cplace.example.com', hostname: 'cplace.example.com', context: '/training/' }),
    ).toEqual({
      origin: 'https://cplace.example.com',
      instance: 'cplace.example.com',
      tenant: 'training',
      baseUrl: 'https://cplace.example.com/training',
      contextPath: '/training/',
    });
  });

  it('handles context without trailing slash', () => {
    const info = deriveBaseUrl({ origin: 'https://h', hostname: 'h', context: '/foo' });
    expect(info.tenant).toBe('foo');
    expect(info.baseUrl).toBe('https://h/foo');
  });

  it('returns null tenant when context is null', () => {
    expect(deriveBaseUrl({ origin: 'https://h', hostname: 'h', context: null })).toEqual({
      origin: 'https://h',
      instance: 'h',
      tenant: null,
      baseUrl: 'https://h',
      contextPath: null,
    });
  });

  it('returns null tenant when context is undefined', () => {
    const info = deriveBaseUrl({ origin: 'https://h', hostname: 'h', context: undefined });
    expect(info.tenant).toBeNull();
    expect(info.baseUrl).toBe('https://h');
    expect(info.contextPath).toBeNull();
  });

  it('does not fall back to URL path even when path looks like a tenant', () => {
    // Single-tenant cplace at /someRoute/page should still yield tenant=null because _context_="/"
    const info = deriveBaseUrl({
      origin: 'https://h',
      hostname: 'h',
      context: '/',
    });
    expect(info.tenant).toBeNull();
  });

  it('ignores malformed context strings', () => {
    const info = deriveBaseUrl({ origin: 'https://h', hostname: 'h', context: '' });
    expect(info.tenant).toBeNull();
    expect(info.baseUrl).toBe('https://h');
    expect(info.contextPath).toBe('');
  });

  it('takes only the first segment of nested contexts', () => {
    const info = deriveBaseUrl({ origin: 'https://h', hostname: 'h', context: '/training/sub/' });
    expect(info.tenant).toBe('training');
    expect(info.baseUrl).toBe('https://h/training');
  });
});
