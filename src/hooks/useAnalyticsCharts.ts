import { useEffect, useMemo, useState } from 'react';
import {
  fetchAnalyticsCache,
  refreshAnalyticsCache,
  fetchCategoryMap,
  fetchUserNames,
} from '../lib/firestore';
import type { Event, Payment } from '../types';
import { buildLastNMonthsEventCounts, buildLastNMonthsRevenue } from '../lib/dateUtils';

export interface UseAnalyticsChartsReturn {
  // Data state
  events: Event[];
  payments: Payment[];
  loading: boolean;
  cached: boolean;

  // Lookups
  catMap: Record<string, string>;
  organiserNames: Record<string, string>;

  // Computed charts (useMemo'd)
  categoryData: { name: string; value: number }[];
  modeData: { name: string; value: number }[];
  publishData: { name: string; value: number }[];
  paidData: { name: string; value: number }[];
  eventsOverTime: { month: string; count: number }[];
  revenueOverTime: { month: string; revenue: number }[];
  revByCategory: { name: string; revenue: number }[];
  geoPoints: { id: string; lat: number; lng: number; name: string; published: boolean }[];
  organiserData: { uid: string; total: number }[];
}

export function useAnalyticsCharts(): UseAnalyticsChartsReturn {
  const [events, setEvents] = useState<Event[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState(false);
  const [catMap, setCatMap] = useState<Record<string, string>>({});
  const [organiserNames, setOrganiserNames] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [map, hit] = await Promise.all([fetchCategoryMap(), fetchAnalyticsCache()]);
        setCatMap(map);
        const fresh = hit ?? (await refreshAnalyticsCache());
        const evs = fresh.events;
        const pays = fresh.payments;
        setEvents(evs);
        setPayments(pays);
        setCached(!!hit);

        // Resolve organiser UIDs to names (top 20)
        const uids = [...new Set(evs.map((ev) => String(ev.author ?? '').split('/').pop() ?? '').filter(Boolean))].slice(0, 20);
        if (uids.length) {
          fetchUserNames(uids).then(setOrganiserNames);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ─── Category breakdown ──────────────────────────────────────────────────
  const categoryData = useMemo(() => {
    const count: Record<string, number> = {};
    events.forEach((ev) => {
      const raw = ev.category ?? '';
      const name = catMap[raw] ?? catMap[raw.split('/').pop() ?? ''] ?? (raw.split('/').pop() || 'Uncategorised');
      count[name] = (count[name] ?? 0) + 1;
    });
    return Object.entries(count)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [events, catMap]);

  // ─── Mode breakdown ──────────────────────────────────────────────────────
  const modeData = useMemo(() => {
    const map: Record<string, number> = {};
    events.forEach((ev) => {
      const m = (ev.mode ?? 'in-person').toLowerCase().trim();
      map[m] = (map[m] ?? 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [events]);

  // ─── Published vs Draft ──────────────────────────────────────────────────
  const publishData = useMemo(
    () => [
      { name: 'Published', value: events.filter((e) => e.is_published).length },
      { name: 'Draft', value: events.filter((e) => !e.is_published).length },
    ],
    [events],
  );

  // ─── Paid vs Free ────────────────────────────────────────────────────────
  const paidData = useMemo(
    () => [
      { name: 'Paid', value: events.filter((e) => e.is_paid).length },
      { name: 'Free', value: events.filter((e) => !e.is_paid).length },
    ],
    [events],
  );

  // ─── Events created per month (last 12) ──────────────────────────────────
  const eventsOverTime = useMemo(() => buildLastNMonthsEventCounts(events, 12), [events]);

  // ─── Revenue per month ───────────────────────────────────────────────────
  const revenueOverTime = useMemo(() => buildLastNMonthsRevenue(payments, 12, true), [payments]);

  // ─── Top event categories by revenue ────────────────────────────────────
  const revByCategory = useMemo(() => {
    const eventCatMap: Record<string, string> = {};
    events.forEach((ev) => {
      const raw = ev.category ?? '';
      const name = catMap[raw] ?? catMap[raw.split('/').pop() ?? ''] ?? (raw.split('/').pop() || 'Uncategorised');
      eventCatMap[ev.id] = name;
    });
    const catRev: Record<string, number> = {};
    payments.forEach((p) => {
      if (p.status !== 'completed') return;
      const evId = p.eventId ? String(p.eventId).split('/').pop() ?? '' : '';
      const cat = eventCatMap[evId] ?? 'Uncategorised';
      catRev[cat] = (catRev[cat] ?? 0) + (p.amount ?? 0);
    });
    return Object.entries(catRev)
      .map(([name, revenue]) => ({ name, revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [events, payments, catMap]);

  // ─── Event geo points ─────────────────────────────────────────────────────
  const geoPoints = useMemo(
    () =>
      events
        .filter((ev) => ev.location?.geopoint)
        .map((ev) => ({
          id: ev.id,
          lat: ev.location!.geopoint!.latitude,
          lng: ev.location!.geopoint!.longitude,
          name: ev.name ?? 'Event',
          published: ev.is_published ?? false,
        })),
    [events],
  );

  // ─── Organiser leaderboard ────────────────────────────────────────────────
  const organiserData = useMemo(() => {
    const count: Record<string, number> = {};
    events.forEach((ev) => {
      if (!ev.author) return;
      const uid = String(ev.author).split('/').pop() ?? ev.author;
      count[uid] = (count[uid] ?? 0) + 1;
    });
    return Object.entries(count)
      .map(([uid, total]) => ({ uid, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [events]);

  return {
    // Data state
    events,
    payments,
    loading,
    cached,

    // Lookups
    catMap,
    organiserNames,

    // Computed charts
    categoryData,
    modeData,
    publishData,
    paidData,
    eventsOverTime,
    revenueOverTime,
    revByCategory,
    geoPoints,
    organiserData,
  };
}
