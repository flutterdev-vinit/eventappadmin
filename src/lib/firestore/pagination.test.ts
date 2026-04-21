import { describe, it, expect } from 'vitest';
import { PAGE_SIZE } from './pagination';

describe('pagination', () => {
  it('uses consistent page size for Firestore limits', () => {
    expect(PAGE_SIZE).toBe(20);
  });
});
