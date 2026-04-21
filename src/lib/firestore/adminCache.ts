import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Event, Payment } from '../../types';
import {
  fetchEventCount,
  fetchPublishedEventCount,
  fetchEventsForCharts,
} from './events';
import { fetchUserCount } from './users';
import { fetchPaymentCount, fetchPaymentRevenue, fetchPaymentsForCharts } from './payments';

// ─── sessionStorage mirror helpers ────────────────────────────────────────────

// v2 — invalidates v1 cache that was populated before the payment-field-name
// fix (created_at vs date, status "" vs "completed", etc.).
const SS_STATS_KEY = 'admin_stats_v2';
const SS_ANALYTICS_KEY = 'admin_analytics_v2';

function ssGet<T extends { updatedAt: { toMillis?: () => number; _seconds?: number } }>(
  key: string,
  ttlMs: number,
): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    const millis =
      typeof parsed.updatedAt.toMillis === 'function'
        ? parsed.updatedAt.toMillis()
        : (parsed.updatedAt._seconds ?? 0) * 1000;
    if (Date.now() - millis < ttlMs) return parsed;
    sessionStorage.removeItem(key);
  } catch { /* ignore */ }
  return null;
}

function ssPut(key: string, value: unknown): void {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* quota ignore */ }
}

// ─── Admin stats cache doc ────────────────────────────────────────────────────

export interface AdminStats {
  totalEvents: number;
  publishedEvents: number;
  totalUsers: number;
  totalPayments: number;
  totalRevenue: number;
  updatedAt: Timestamp;
}

const STATS_DOC = doc(db, '_admin', 'stats');
const STATS_TTL_MS = 5 * 60 * 1000;

/** Heuristic: if there are payments but zero revenue, the cache was populated
 *  before the payment schema fix and should be discarded. */
function isLikelyStale(s: AdminStats): boolean {
  return s.totalPayments > 0 && s.totalRevenue === 0;
}

export async function fetchAdminStats(): Promise<AdminStats | null> {
  const ss = ssGet<AdminStats>(SS_STATS_KEY, STATS_TTL_MS);
  if (ss && !isLikelyStale(ss as unknown as AdminStats)) return ss as unknown as AdminStats;

  try {
    const snap = await getDoc(STATS_DOC);
    if (!snap.exists()) return null;
    const data = snap.data() as AdminStats;
    const age = Date.now() - data.updatedAt.toMillis();
    if (age < STATS_TTL_MS && !isLikelyStale(data)) {
      ssPut(SS_STATS_KEY, data);
      return data;
    }
    return null; // caller will refresh
  } catch {
    return null;
  }
}

export async function refreshAdminStats(): Promise<AdminStats> {
  const [totalEvents, publishedEvents, totalUsers, totalPayments, totalRevenue] = await Promise.all([
    fetchEventCount(),
    fetchPublishedEventCount(),
    fetchUserCount(),
    fetchPaymentCount(),
    fetchPaymentRevenue(),
  ]);
  const stats: AdminStats = {
    totalEvents,
    publishedEvents,
    totalUsers,
    totalPayments,
    totalRevenue,
    updatedAt: Timestamp.now(),
  };
  ssPut(SS_STATS_KEY, stats);
  try {
    await setDoc(STATS_DOC, stats);
  } catch {
    /* may fail if admin rules not set up yet */
  }
  return stats;
}

// ─── Analytics cache doc ─────────────────────────────────────────────────────

export interface AnalyticsCache {
  events: Event[];
  payments: Payment[];
  updatedAt: Timestamp;
}

const ANALYTICS_DOC = doc(db, '_admin', 'analyticsCache');
const ANALYTICS_TTL_MS = 10 * 60 * 1000;

export async function fetchAnalyticsCache(): Promise<AnalyticsCache | null> {
  const ss = ssGet<AnalyticsCache>(SS_ANALYTICS_KEY, ANALYTICS_TTL_MS);
  if (ss) return ss as unknown as AnalyticsCache;

  try {
    const snap = await getDoc(ANALYTICS_DOC);
    if (!snap.exists()) return null;
    const data = snap.data();
    const age = Date.now() - (data.updatedAt as Timestamp).toMillis();
    if (age < ANALYTICS_TTL_MS) {
      const result: AnalyticsCache = {
        events: (data.events ?? []) as Event[],
        payments: (data.payments ?? []) as Payment[],
        updatedAt: data.updatedAt as Timestamp,
      };
      ssPut(SS_ANALYTICS_KEY, result);
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

export async function refreshAnalyticsCache(): Promise<AnalyticsCache> {
  const [events, payments] = await Promise.all([
    fetchEventsForCharts(200),
    fetchPaymentsForCharts(200),
  ]);
  const cache: AnalyticsCache = { events, payments, updatedAt: Timestamp.now() };
  ssPut(SS_ANALYTICS_KEY, cache);
  try {
    await setDoc(ANALYTICS_DOC, cache);
  } catch {
    /* Write may fail if rules aren't set */
  }
  return cache;
}
