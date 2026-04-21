import { describe, it, expect } from 'vitest';
import { firestoreToDate, formatDayMonthYear, buildMonthlyEventData } from './dateUtils';
import type { Event } from '../types';

describe('firestoreToDate', () => {
  it('returns null for falsy input', () => {
    expect(firestoreToDate(null)).toBeNull();
    expect(firestoreToDate(undefined)).toBeNull();
  });

  it('reads toDate() from Timestamp-like objects', () => {
    const d = new Date('2024-06-15T12:00:00.000Z');
    expect(firestoreToDate({ toDate: () => d })).toEqual(d);
  });
});

describe('formatDayMonthYear', () => {
  it('returns em dash when no date', () => {
    expect(formatDayMonthYear(null)).toBe('—');
  });

  it('formats Timestamp-like values', () => {
    const d = new Date(2024, 5, 7);
    expect(formatDayMonthYear({ toDate: () => d })).toMatch(/Jun/);
    expect(formatDayMonthYear({ toDate: () => d })).toMatch(/2024/);
  });
});

describe('buildMonthlyEventData', () => {
  it('returns six month buckets', () => {
    const out = buildMonthlyEventData([]);
    expect(out).toHaveLength(6);
    expect(out[0]).toHaveProperty('month');
    expect(out[0]).toHaveProperty('events');
  });

  it('counts events in the current calendar month bucket', () => {
    const now = new Date();
    const events = [{ id: '1', name: 'A', create_at: { toDate: () => now } } as unknown as Event];
    const out = buildMonthlyEventData(events);
    expect(out.reduce((s, b) => s + b.events, 0)).toBe(1);
  });
});
