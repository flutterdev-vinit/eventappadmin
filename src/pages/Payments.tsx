import { useEffect, useState, useCallback, useRef } from 'react';
import { DollarSign, CheckCircle, Clock, XCircle } from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { format, subMonths } from 'date-fns';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import DataTable from '../components/Table';
import {
  fetchPaymentsPage,
  fetchPaymentCount,
  fetchPaymentRevenue,
  fetchPaymentStatusCounts,
  fetchAnalyticsCache,
  refreshAnalyticsCache,
  fetchEventNames,
  fetchUserNames,
  PAGE_SIZE,
} from '../lib/firestore';
import type { Payment } from '../types';

interface EnrichedPayment extends Payment {
  eventName?: string;
  userName?: string;
}
import { useWindowSize } from '../hooks/useWindowSize';

const BAR_COLORS = ['#3d7a5a', '#93c9a8', '#5a9d7a', '#7ab5a0', '#4a8c6a', '#2d6a4f'];

type StatusFilter = 'all' | 'completed' | 'pending' | 'failed' | 'refunded';

function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  try { return (ts as { toDate(): Date }).toDate(); } catch { return null; }
}

/** Group payments by calendar month, return last 6 months. */
function buildMonthlyRevenue(payments: Payment[]): { month: string; revenue: number }[] {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    return { key: format(d, 'yyyy-MM'), label: format(d, 'MMM'), revenue: 0 };
  });
  payments.forEach((p) => {
    if (p.status !== 'completed') return;
    const d = toDate(p.date);
    if (!d) return;
    const key = format(d, 'yyyy-MM');
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.revenue += p.amount ?? 0;
  });
  return months.map(({ label, revenue }) => ({ month: label, revenue: Math.round(revenue * 100) / 100 }));
}

export default function Payments() {
  const { isMobile, isTablet } = useWindowSize();

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

  // Load paginated table + resolve event/user names
  const loadTablePage = useCallback(async (pageNum: number, filter: StatusFilter) => {
    setTableLoading(true);
    try {
      const cursor = cursors.current[pageNum - 1] ?? null;
      const result = await fetchPaymentsPage(filter, cursor);
      setTableItems(result.items);  // show rows immediately, names loading
      setTableHasMore(result.hasMore);
      setTablePage(pageNum);
      if (result.cursor && result.hasMore) cursors.current[pageNum] = result.cursor;

      // Batch-resolve event and user names in parallel
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

  // Reset table page when filter changes
  useEffect(() => {
    cursors.current = [null];
    setTablePage(1);
    loadTablePage(1, statusFilter);
  }, [statusFilter, loadTablePage]);

  const loading = statsLoading;

  const statsGridCols = isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)';
  const chartsGridCols = isMobile ? '1fr' : '3fr 2fr';

  const statCards = [
    {
      label: 'Total Revenue',
      value: loading ? '—' : `$${totalRevenue.toLocaleString()}`,
      sub: 'completed payments',
      icon: <DollarSign size={22} color="#3d7a5a" />,
      iconBg: '#e8f5ee',
    },
    {
      label: 'Total Transactions',
      value: loading ? '—' : totalCount.toLocaleString(),
      icon: <CheckCircle size={22} color="#2563eb" />,
      iconBg: '#dbeafe',
    },
    {
      label: 'Completed',
      value: loading ? '—' : completedCount.toLocaleString(),
      sub: totalCount ? `${Math.round((completedCount / totalCount) * 100)}% success rate` : '',
      icon: <CheckCircle size={22} color="#16a34a" />,
      iconBg: '#dcfce7',
    },
    {
      label: 'Pending / Failed',
      value: loading ? '—' : `${pendingCount} / ${failedCount}`,
      icon: <Clock size={22} color="#d97706" />,
      iconBg: '#fef3c7',
    },
  ];

  const fmt = (ts: unknown): string => {
    const d = toDate(ts);
    return d ? format(d, 'dd MMM yyyy') : '—';
  };

  const columns = [
    {
      key: 'event',
      header: 'Event',
      render: (p: EnrichedPayment) => (
        <div style={{ minWidth: 120 }}>
          <p style={{ fontWeight: 500, color: '#111827' }}>
            {p.eventName ?? (p.eventId ? <span style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</span> : 'Unknown event')}
          </p>
          <p style={{ fontSize: 12, color: '#d1d5db' }}>{p.currency ?? 'Payment'}</p>
        </div>
      ),
    },
    {
      key: 'userId',
      header: 'User',
      render: (p: EnrichedPayment) => (
        <span style={{ fontSize: 13, color: '#374151' }}>
          {p.userName ?? (p.userId ? <span style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</span> : '—')}
        </span>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right' as const, render: (p: EnrichedPayment) => <strong>${(p.amount ?? 0).toFixed(2)}</strong> },
    { key: 'status', header: 'Status', render: (p: EnrichedPayment) => <Badge status={p.status ?? 'pending'} /> },
    { key: 'date', header: 'Date', render: (p: EnrichedPayment) => fmt(p.date) },
  ];

  return (
    <div>
      <PageHeader title="Payments" subtitle="Revenue tracking and transaction management." />

      <div style={{ display: 'grid', gridTemplateColumns: statsGridCols, gap: 16, marginBottom: 20 }}>
        {statCards.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: chartsGridCols, gap: 16, marginBottom: 20 }}>
        {/* Revenue by month */}
        <div style={styles.chartCard}>
          <div style={styles.cardHeader}>
            <h2>Monthly Revenue — Last 6 Months</h2>
            <span style={styles.tag}>Cached · up to 10 min</span>
          </div>
          {statsLoading ? <div style={styles.chartSkeleton} /> : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={monthlyRevenue} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Revenue']} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {monthlyRevenue.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status breakdown */}
        <div style={styles.chartCard}>
          <div style={styles.cardHeader}>
            <h2>Payment Status</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            {[
              { label: 'Completed', value: completedCount, color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle size={18} color="#16a34a" /> },
              { label: 'Pending', value: pendingCount, color: '#d97706', bg: '#fef3c7', icon: <Clock size={18} color="#d97706" /> },
              { label: 'Failed / Refunded', value: failedCount, color: '#dc2626', bg: '#fee2e2', icon: <XCircle size={18} color="#dc2626" /> },
            ].map(({ label, value, color, bg, icon }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: bg, borderRadius: 8 }}>
                {icon}
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color }}>{label}</span>
                <strong style={{ fontSize: 18, color }}>{value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableCard}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Transaction Log</h2>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {tableLoading ? 'Loading…' : `${tableItems.length} on this page`}
            </p>
          </div>
          <select
            style={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <DataTable
          columns={columns}
          data={tableItems}
          keyField="id"
          loading={tableLoading}
          emptyMessage="No transactions found."
          pagination={{
            page: tablePage,
            hasMore: tableHasMore,
            loading: tableLoading,
            onPrev: () => { if (tablePage > 1) loadTablePage(tablePage - 1, statusFilter); },
            onNext: () => loadTablePage(tablePage + 1, statusFilter),
            pageSize: PAGE_SIZE,
            itemCount: tableItems.length,
          }}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  chartSkeleton: {
    height: 210,
    borderRadius: 8,
    background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
    backgroundSize: '400% 100%',
    animation: 'shimmer 1.4s infinite',
  },
  chartCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '18px 20px',
    minWidth: 0,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
    flexWrap: 'wrap',
  },
  tag: {
    fontSize: 12,
    color: '#9ca3af',
    background: '#f3f4f6',
    padding: '3px 10px',
    borderRadius: 20,
    whiteSpace: 'nowrap',
  },
  tableCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
    padding: '18px 20px',
  },
  select: {
    padding: '7px 12px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    fontSize: 14,
    color: '#374151',
    background: '#fff',
    cursor: 'pointer',
    outline: 'none',
  },
};
