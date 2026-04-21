import { format, subMonths } from 'date-fns';
import type { Event, Payment } from '../types';

/** Firestore `Timestamp` or compatible `{ toDate(): Date }`. */
export function firestoreToDate(ts: unknown): Date | null {
  if (!ts) return null;
  try {
    return (ts as { toDate(): Date }).toDate();
  } catch {
    return null;
  }
}

/** Display string for admin tables (e.g. `12 Jan 2025`). */
export function formatDayMonthYear(ts: unknown): string {
  const d = firestoreToDate(ts);
  return d ? format(d, 'dd MMM yyyy') : '—';
}

/** Calendar bucket key `yyyy-MM`. */
export function monthKey(d: Date): string {
  return format(d, 'yyyy-MM');
}

/** Short label for analytics charts (`Jan 25`). */
export function monthLabelMmmYy(d: Date): string {
  return format(d, 'MMM yy');
}

/** Short month only (`Jan`) for 6-month mini charts. */
export function monthLabelMmm(d: Date): string {
  return format(d, 'MMM');
}

/** Group events by `create_at` into the last 6 calendar months (for dashboard chart). */
export function buildMonthlyEventData(events: Event[]): { month: string; events: number }[] {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    return { key: format(d, 'yyyy-MM'), label: monthLabelMmm(d), count: 0 };
  });

  events.forEach((ev) => {
    const d = firestoreToDate(ev.create_at);
    if (!d) return;
    const key = format(d, 'yyyy-MM');
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.count++;
  });

  return months.map(({ label, count }) => ({ month: label, events: count }));
}

/** Group completed payments by `date` into the last 6 months with revenue totals. */
export function buildMonthlyRevenue(payments: Payment[]): { month: string; revenue: number }[] {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    return { key: format(d, 'yyyy-MM'), label: monthLabelMmm(d), revenue: 0 };
  });
  payments.forEach((p) => {
    if (p.status !== 'completed') return;
    const d = firestoreToDate(p.date);
    if (!d) return;
    const key = format(d, 'yyyy-MM');
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.revenue += p.amount ?? 0;
  });
  return months.map(({ label, revenue }) => ({
    month: label,
    revenue: Math.round(revenue * 100) / 100,
  }));
}

/** Last N months of event `create_at` counts (labels `MMM yy`) — used on Analytics. */
export function buildLastNMonthsEventCounts(events: Event[], numMonths: number): { month: string; count: number }[] {
  const now = new Date();
  const months = Array.from({ length: numMonths }, (_, i) => {
    const d = subMonths(now, numMonths - 1 - i);
    return { key: format(d, 'yyyy-MM'), label: monthLabelMmmYy(d), count: 0 };
  });
  events.forEach((ev) => {
    const d = firestoreToDate(ev.create_at);
    if (!d) return;
    const b = months.find((m) => m.key === monthKey(d));
    if (b) b.count++;
  });
  return months.map(({ label, count }) => ({ month: label, count }));
}

/** Last N months of completed payment revenue (labels `MMM yy`). */
export function buildLastNMonthsRevenue(
  payments: Payment[],
  numMonths: number,
  roundRevenue = false,
): { month: string; revenue: number }[] {
  const now = new Date();
  const months = Array.from({ length: numMonths }, (_, i) => {
    const d = subMonths(now, numMonths - 1 - i);
    return { key: format(d, 'yyyy-MM'), label: monthLabelMmmYy(d), revenue: 0 };
  });
  payments.forEach((p) => {
    if (p.status !== 'completed') return;
    const d = firestoreToDate(p.date);
    if (!d) return;
    const b = months.find((m) => m.key === monthKey(d));
    if (b) b.revenue += p.amount ?? 0;
  });
  return months.map(({ label, revenue }) => ({
    month: label,
    revenue: roundRevenue ? Math.round(revenue) : revenue,
  }));
}
