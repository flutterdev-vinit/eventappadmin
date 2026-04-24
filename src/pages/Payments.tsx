import { PoundSterling, CheckCircle, Clock, XCircle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import DataTable from '../components/Table';
import EntityLink from '../components/EntityLink';
import { PAGE_SIZE } from '../lib/firestore';
import { formatDayMonthYear } from '../lib/dateUtils';
import { formatGbp } from '../lib/formatMoney';
import { useWindowSize } from '../hooks/useWindowSize';
import { usePaymentsPage } from '../hooks/usePaymentsPage';
import type { EnrichedPayment, StatusFilter } from '../hooks/usePaymentsPage';

const BAR_COLORS = ['#3d7a5a', '#93c9a8', '#5a9d7a', '#7ab5a0', '#4a8c6a', '#2d6a4f'];

export default function Payments() {
  const { isMobile, isTablet } = useWindowSize();

  const {
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
  } = usePaymentsPage();

  const statsGridCols = isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)';
  const chartsGridCols = isMobile ? '1fr' : '3fr 2fr';

  const statCards = [
    {
      label: 'Total Revenue',
      value: statsLoading ? '—' : formatGbp(totalRevenue),
      sub: 'completed payments',
      icon: <PoundSterling size={22} color="#3d7a5a" />,
      iconBg: '#e8f5ee',
    },
    {
      label: 'Total Transactions',
      value: statsLoading ? '—' : totalCount.toLocaleString(),
      icon: <CheckCircle size={22} color="#2563eb" />,
      iconBg: '#dbeafe',
    },
    {
      label: 'Completed',
      value: statsLoading ? '—' : completedCount.toLocaleString(),
      sub: totalCount ? `${Math.round((completedCount / totalCount) * 100)}% success rate` : '',
      icon: <CheckCircle size={22} color="#16a34a" />,
      iconBg: '#dcfce7',
    },
    {
      label: 'Pending / Failed',
      value: statsLoading ? '—' : `${pendingCount} / ${failedCount}`,
      icon: <Clock size={22} color="#d97706" />,
      iconBg: '#fef3c7',
    },
  ];

  const columns = [
    {
      key: 'event',
      header: 'Event',
      render: (p: EnrichedPayment) => (
        <div style={{ minWidth: 120 }}>
          {p.eventName ? (
            <EntityLink kind="event" id={p.eventId} label={p.eventName} strong ellipsis />
          ) : p.eventId ? (
            <span style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</span>
          ) : (
            <span style={{ color: '#9ca3af' }}>Unknown event</span>
          )}
          <p style={{ fontSize: 12, color: '#d1d5db' }}>{p.currency ?? 'Payment'}</p>
        </div>
      ),
    },
    {
      key: 'userId',
      header: 'User',
      render: (p: EnrichedPayment) => {
        if (p.userName) {
          return <EntityLink kind="user" id={p.userId} label={p.userName} />;
        }
        if (p.userId) return <span style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</span>;
        return <span style={{ color: '#9ca3af' }}>—</span>;
      },
    },
    { key: 'amount', header: 'Amount', align: 'right' as const, render: (p: EnrichedPayment) => <strong>{formatGbp(p.amount ?? 0)}</strong> },
    { key: 'status', header: 'Status', render: (p: EnrichedPayment) => <Badge status={p.status ?? 'pending'} /> },
    { key: 'date', header: 'Date', render: (p: EnrichedPayment) => formatDayMonthYear(p.date) },
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
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatGbp(Number(v))} />
                <Tooltip formatter={(v) => [formatGbp(Number(v)), 'Revenue']} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
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
            onPrev: () => { if (tablePage > 1) loadTablePage(tablePage - 1); },
            onNext: () => loadTablePage(tablePage + 1),
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
