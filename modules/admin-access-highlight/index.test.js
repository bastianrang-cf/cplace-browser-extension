import { describe, it, expect } from 'vitest';
import mod from './index.js';

describe('admin-access-highlight module', () => {
  it('has correct id', () => {
    expect(mod.id).toBe('admin-access-highlight');
  });

  it('is disabled by default', () => {
    expect(mod.defaultEnabled).toBe(false);
  });

  it('has css flag set', () => {
    expect(mod.css).toBe(true);
  });
});
