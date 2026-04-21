import { describe, it, expect } from 'vitest';
import { sanitize, sanitizeDoc } from './sanitize';

describe('sanitize', () => {
  it('returns null and undefined as-is', () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeUndefined();
  });

  it('maps arrays recursively', () => {
    expect(sanitize([1, { a: 2 }])).toEqual([1, { a: 2 }]);
  });

  it('maps plain nested objects', () => {
    expect(sanitize({ x: 1, y: { z: 'hi' } })).toEqual({ x: 1, y: { z: 'hi' } });
  });
});

describe('sanitizeDoc', () => {
  it('merges id with sanitised fields', () => {
    type Row = { id: string; name: string; n: number };
    expect(sanitizeDoc<Row>('doc1', { name: 'Test', n: 3 })).toEqual({
      id: 'doc1',
      name: 'Test',
      n: 3,
    });
  });
});
