import { describe, expect, it } from 'vitest';

import { redactSecret, safeErrorMessage } from '@/lib/security';

describe('secret handling', () => {
  it('redacts short and long secrets', () => {
    expect(redactSecret('abc')).toBe('••••••••');
    expect(redactSecret('sk-123456789')).toBe('sk-••••789');
  });

  it('removes a key from error text', () => {
    expect(safeErrorMessage(new Error('request failed with sk-secret'), 'sk-secret')).toBe(
      'request failed with [REDACTED]',
    );
  });
});
