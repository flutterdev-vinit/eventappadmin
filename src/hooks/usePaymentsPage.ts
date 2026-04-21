import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import {
  fetchPaymentsPage,
  fetchPaymentCount,
  fetchPaymentRevenue,
  fetchPaymentStatusCounts,
  fetchAnalyticsCache,
  refreshAnalyticsCache,
  fetchEventNames,
  fetchUserNames,
} from '../lib/firestore';
import type { Payment } from '../types';
import { buildMonthlyRevenue } from '../lib/dateUtils';

export type StatusFilter = 'all' | 'completed' | 'pending' | 'failed' | 'refunded';

interface EnrichedPayment extends Payment {
  eventName?: string;
  userName?: string;
}

export type { EnrichedPayment };

export interface UsePaymentsPageReturn {
  // Chart stats
  monthlyRevenue: { month: string; revenue: number }[];
  totalCount: number;
  totalRevenue: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  statsLoading: boolean;

  // Table pagination
  tableItems: EnrichedPayment[];
  tableLoading: boolean;
  tablePage: number;
  tableHasMore: boolean;
  loadTablePage: (pageNum: number) => Promise<void>;

  // Filter
  statusFilter: StatusFilter;
  setStatusFilter: (s: StatusFilter) => void;
}

export function usePaymentsPage(): UsePaymentsPageReturn {
  // ── Chart + stats state ───────────────────────────────────────────────────
  const [monthlyRevenue, setMonthlyRevenue] = useState<{ month: string; revenue: number }[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Table pagination state ────────────────────────────────────────────────
  const [tableItems, setTableItems] = useState<EnrichedPayment[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [tablePage, setTablePage] = useState(1);
  const [tableHasMore, setTableHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const cursors = useRef<(QueryDocumentSnapshot | null)[]>([null]);

  // Ref mirror for the filter so loadTablePage stays stable.
  // Without this, loadTablePage is re-created on every filter change,
  // and the effect below would fire twice → 2× Firestore reads.
  const statusFilterRef = useRef(statusFilter);
  useEffect(() => { statusFilterRef.current = statusFilter; }, [statusFilter]);

  // Load chart stats once — no doc reads, only aggregations + cache
  useEffect(() => {
    async function load() {
      setStatsLoading(true);
      try {
        const [statusCounts, count, revenue, analyticsData] = await Promise.all([
          fetchPaymentStatusCounts(),
          fetchPaymentCount(),
          fetchPaymentRevenue(),
          fetchAnalyticsCache().then((hit) => hit ?? refreshAnalyticsCache()),
        ]);
        setCompletedCount(statusCounts.completed);
        setPendingCount(statusCounts.pending);
        setFailedCount(statusCounts.failed + statusCounts.refunded);
        setTotalCount(count);
        setTotalRevenue(revenue);
        setMonthlyRevenue(buildMonthlyRevenue(analyticsData.payments));
      } catch (e) {
        console.error(e);
      } finally {
        setStatsLoading(false);
      }
    }
    load();
  }, []);

  // Stable loadTablePage — reads filter via ref, deps stay empty.
  const loadTablePage = useCallback(async (pageNum: number) => {
    setTableLoading(true);
    try {
      const cursor = cursors.current[pageNum - 1] ?? null;
      const result = await fetchPaymentsPage(statusFilterRef.current, cursor);
      setTableItems(result.items);
      setTableHasMore(result.hasMore);
      setTablePage(pageNum);
      if (result.cursor && result.hasMore) {
        cursors.current[pageNum] = result.cursor;
      }

      const rawEventIds = result.items
        .map((p) => String(p.eventId ?? '').split('/').pop() ?? '')
        .filter(Boolean);
      const rawUserIds = result.items
        .map((p) => String(p.userId ?? '').split('/').pop() ?? '')
        .filter(Boolean);

      const [eventNames, userNames] = await Promise.all([
        fetchEventNames([...new Set(rawEventIds)]),
        fetchUserNames([...new Set(rawUserIds)]),
      ]);

      setTableItems(result.items.map((p) => {
        const eid = String(p.eventId ?? '').split('/').pop() ?? '';
        const uid = String(p.userId ?? '').split('/').pop() ?? '';
        return {
          ...p,
          eventName: eid ? (eventNames[eid] ?? undefined) : undefined,
          userName: uid ? (userNames[uid] ?? undefined) : undefined,
        };
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setTableLoading(false);
    }
  }, []);

  // Reset table page when filter changes. loadTablePage is stable so this
  // effect only fires when statusFilter changes — no duplicate reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    cursors.current = [null];
    setTablePage(1);
    loadTablePage(1);
  }, [statusFilter]);

  return {
    monthlyRevenue,
    totalCount,
    totalRevenue,
    completedCount,
    pendingCount,
    failedCount,
    statsLoading,

    tableItems,
    tableLoading,
    tablePage,
    tableHasMore,
    loadTablePage,

    statusFilter,
    setStatusFilter,
  };
}
