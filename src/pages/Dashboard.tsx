import { useEffect, useState } from 'react';
import { Calendar, Users, CreditCard, TrendingUp, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import EntityLink from '../components/EntityLink';
import {
  fetchAdminStats,
  refreshAdminStats,
  fetchRecentEvents,
  fetchRecentPayments,
  fetchRecentUsers,
  fetchAnalyticsCache,
  refreshAnalyticsCache,
  fetchCategoryMap,
  fetchEventNames,
  type AdminStats,
} from '../lib/firestore';
import type { Event, Payment, AppUser } from '../types';
import { useWindowSize } from '../hooks/useWindowSize';
import { buildMonthlyEventData, formatDayMonthYear } from '../lib/dateUtils';

const PIE_COLORS = ['#3d7a5a', '#93c9a8'];

/** Compute trend % between current month and previous month. */
function computeTrend(data: { month: string; events: number }[]): { value: string; up: boolean } | undefined {
  if (data.length < 2) return undefined;
  const prev = data[data.length - 2].events;
  const curr = data[data.length - 1].events;
  if (prev === 0) return curr > 0 ? { value: '+100%', up: true } : undefined;
  const pct = Math.round(((curr - prev) / prev) * 100);
  return { value: `${Math.abs(pct)}%`, up: pct >= 0 };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { isMobile, isTablet } = useWindowSize();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentEvents, setRecentEvents] = useState<Event[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [recentUsers, setRecentUsers] = useState<AppUser[]>([]);
  const [chartEvents, setChartEvents] = useState<{ month: string; events: number }[]>([]);
  const [catMap, setCatMap] = useState<Record<string, string>>({});
  const [paymentEventNames, setPaymentEventNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        let s = await fetchAdminStats();
        if (!s) s = await refreshAdminStats();

        const [rEvents, rPayments, rUsers, analyticsData, cats] = await Promise.all([
          fetchRecentEvents(5),
          fetchRecentPayments(5),
          fetchRecentUsers(5),
          fetchAnalyticsCache().then((hit) => hit ?? refreshAnalyticsCache()),
          fetchCategoryMap(),
        ]);

        setStats(s);
        setRecentEvents(rEvents);
        setRecentPayments(rPayments);
        setRecentUsers(rUsers);
        setChartEvents(buildMonthlyEventData(analyticsData.events));
        setCatMap(cats);

        // Resolve event names for recent payments
        const eventIds = [...new Set(
          rPayments.map((p) => String(p.eventId ?? '').split('/').pop() ?? '').filter(Boolean)
        )];
        if (eventIds.length) fetchEventNames(eventIds).then(setPaymentEventNames);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const eventMixData = [
    { name: 'Published', value: stats?.publishedEvents ?? 0 },
    { name: 'Drafts', value: Math.max(0, (stats?.totalEvents ?? 0) - (stats?.publishedEvents ?? 0)) },
  ];

  const eventTrend = computeTrend(chartEvents);

  const statCards = [
    {
      label: 'Total Events',
      value: loading ? '—' : (stats?.totalEvents ?? 0).toLocaleString(),
      sub: `${stats?.publishedEvents ?? 0} published`,
      icon: <Calendar size={22} color="#3d7a5a" />,
      iconBg: '#e8f5ee',
      trend: eventTrend,
    },
    {
      label: 'Total Users',
      value: loading ? '—' : (stats?.totalUsers ?? 0).toLocaleString(),
      icon: <Users size={22} color="#2563eb" />,
      iconBg: '#dbeafe',
    },
    {
      label: 'Total Revenue',
      value: loading ? '—' : `$${(stats?.totalRevenue ?? 0).toLocaleString()}`,
      sub: `${stats?.totalPayments ?? 0} transactions`,
      icon: <CreditCard size={22} color="#d97706" />,
      iconBg: '#fef3c7',
    },
    {
      label: 'Payments / Event',
      value: loading || !stats?.publishedEvents
        ? '—'
        : (stats.totalPayments / Math.max(stats.publishedEvents, 1)).toFixed(1),
      sub: 'based on published events',
      icon: <TrendingUp size={22} color="#7c3aed" />,
      iconBg: '#ede9fe',
    },
  ];

  const statsGridCols = isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)';
  const chartsGridCols = isMobile ? '1fr' : '2fr 1fr';
  const bottomGridCols = isMobile ? '1fr' : isTablet ? '1fr' : '3fr 2fr';

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Welcome back — here's what's happening with JoinIn." />

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: statsGridCols, gap: 16, marginBottom: 20 }}>
        {statCards.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: chartsGridCols, gap: 16, marginBottom: 20 }}>
        <div style={styles.chartCard}>
          <div style={styles.cardHeader}>
            <h2>Event Activity — Last 6 Months</h2>
            <span style={styles.period}>Cached · up to 10 min</span>
          </div>
          {loading ? <div style={styles.chartSkeleton} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartEvents} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="evG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3d7a5a" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3d7a5a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                <Area type="monotone" dataKey="events" stroke="#3d7a5a" strokeWidth={2} fill="url(#evG)" name="New Events" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={styles.chartCard}>
          <div style={styles.cardHeader}>
            <h2>Published vs Drafts</h2>
          </div>
          {loading ? <div style={styles.chartSkeleton} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={eventMixData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {eventMixData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Legend iconType="circle" iconSize={10} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom rows */}
      <div style={{ display: 'grid', gridTemplateColumns: bottomGridCols, gap: 16 }}>
        {/* Recent Events */}
        <div style={styles.tableCard}>
          <div style={styles.cardHeader}>
            <h2>Recent Events</h2>
            <button style={styles.viewAllBtn} onClick={() => navigate('/events')}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          {loading ? (
            <p style={styles.dimText}>Loading…</p>
          ) : recentEvents.length === 0 ? (
            <p style={styles.dimText}>No events yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.miniTable}>
                <thead>
                  <tr>
                    <th style={styles.miniTh}>Event</th>
                    <th style={styles.miniTh}>Mode</th>
                    <th style={styles.miniTh}>Start</th>
                    <th style={styles.miniTh}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((ev) => (
                    <tr key={ev.id}>
                      <td style={styles.miniTd}>
                        <EntityLink kind="event" id={ev.id} label={ev.name ?? '—'} strong />
                        <p style={{ fontSize: 12, color: '#9ca3af' }}>
                          {ev.category
                            ? (catMap[ev.category] ?? catMap[ev.category.split('/').pop() ?? ''] ?? '')
                            : ''}
                        </p>
                      </td>
                      <td style={styles.miniTd}><Badge status={ev.mode ?? 'in-person'} /></td>
                      <td style={styles.miniTd} >{formatDayMonthYear(ev.startDate)}</td>
                      <td style={styles.miniTd}><Badge status={ev.is_published ? 'published' : 'draft'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right col: users + payments stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* New Users */}
          <div style={styles.tableCard}>
            <div style={styles.cardHeader}>
              <h2>New Users</h2>
              <button style={styles.viewAllBtn} onClick={() => navigate('/users')}>
                View all <ArrowRight size={14} />
              </button>
            </div>
            {loading ? (
              <p style={styles.dimText}>Loading…</p>
            ) : recentUsers.length === 0 ? (
              <p style={styles.dimText}>No users found.</p>
            ) : (
              <div>
                {recentUsers.map((u) => (
                  <div key={u.id} style={styles.userRow}>
                    <div style={styles.userAvatar}>{(u.displayName ?? 'U')[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <EntityLink
                        kind="user"
                        id={u.id}
                        label={u.displayName ?? 'Unknown'}
                        strong
                        ellipsis
                        style={{ fontSize: 13 }}
                      />
                      <p style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email ?? ''}
                      </p>
                    </div>
                    <Badge status={u.status ?? 'active'} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Payments */}
          <div style={styles.tableCard}>
            <div style={styles.cardHeader}>
              <h2>Recent Payments</h2>
              <button style={styles.viewAllBtn} onClick={() => navigate('/payments')}>
                View all <ArrowRight size={14} />
              </button>
            </div>
            {loading ? (
              <p style={styles.dimText}>Loading…</p>
            ) : recentPayments.length === 0 ? (
              <p style={styles.dimText}>No payments yet.</p>
            ) : (
              <div>
                {recentPayments.map((p) => {
                  const eid = String(p.eventId ?? '').split('/').pop() ?? '';
                  const name = eid ? (paymentEventNames[eid] ?? 'Loading…') : 'Payment';
                  return (
                  <div key={p.id} style={styles.payRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {eid ? (
                        <EntityLink kind="event" id={eid} label={name} strong ellipsis style={{ fontSize: 13 }} />
                      ) : (
                        <p style={{ fontWeight: 500, fontSize: 13, color: '#111827' }}>Payment</p>
                      )}
                      <p style={{ fontSize: 12, color: '#9ca3af' }}>{formatDayMonthYear(p.date)}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>
                        ${(p.amount ?? 0).toFixed(2)}
                      </p>
                      <Badge status={p.status ?? 'pending'} />
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  chartSkeleton: {
    height: 200,
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
  },
  tableCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '18px 20px',
    overflow: 'hidden',
    minWidth: 0,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  period: {
    fontSize: 12,
    color: '#9ca3af',
    background: '#f3f4f6',
    padding: '3px 10px',
    borderRadius: 20,
    whiteSpace: 'nowrap',
  },
  viewAllBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 13,
    color: '#3d7a5a',
    fontWeight: 600,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  miniTable: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  miniTh: {
    padding: '8px 12px',
    fontSize: 11,
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    background: '#f9fafb',
    textAlign: 'left' as const,
    borderBottom: '1px solid #f3f4f6',
    whiteSpace: 'nowrap',
  },
  miniTd: {
    padding: '10px 12px',
    fontSize: 13,
    borderBottom: '1px solid #f9fafb',
    verticalAlign: 'middle' as const,
    whiteSpace: 'nowrap',
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 0',
    borderBottom: '1px solid #f9fafb',
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#e8f5ee',
    color: '#3d7a5a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  },
  payRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '9px 0',
    borderBottom: '1px solid #f9fafb',
  },
  dimText: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    padding: '20px 0',
  },
};
