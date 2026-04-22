import { useEffect, useMemo, useState } from 'react';
import { Check, X as XIcon, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/Table';
import Badge from '../components/Badge';
import EntityLink from '../components/EntityLink';
import { formatDayMonthYear } from '../lib/dateUtils';
import {
  listReports,
  resolveReport,
  dismissReport,
  countReportsByStatus,
  fetchUserNames,
  fetchEventNames,
  deleteEvent,
  type ReportCounts,
} from '../lib/firestore';
import type { Report, ReportStatus } from '../types';

type Tab = 'open' | 'resolved' | 'dismissed' | 'all';

interface EnrichedReport extends Report {
  userName?: string;
  eventName?: string;
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>('open');
  const [items, setItems] = useState<EnrichedReport[]>([]);
  const [counts, setCounts] = useState<ReportCounts>({ open: 0, resolved: 0, dismissed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run(currentTab: Tab) {
      setLoading(true);
      setError(null);
      try {
        const [rows, c] = await Promise.all([
          listReports({ status: currentTab }),
          countReportsByStatus(),
        ]);
        if (cancelled) return;
        const userIds = rows.map((r) => r.user_id ?? '').filter(Boolean) as string[];
        const eventIds = rows.map((r) => r.event_id ?? '').filter(Boolean) as string[];
        const [userNames, eventNames] = await Promise.all([
          fetchUserNames(userIds),
          fetchEventNames(eventIds),
        ]);
        if (cancelled) return;
        setItems(
          rows.map((r) => ({
            ...r,
            userName: r.user_id ? userNames[r.user_id] : undefined,
            eventName: r.event_id ? eventNames[r.event_id] : undefined,
          })),
        );
        setCounts(c);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run(tab);
    return () => { cancelled = true; };
  }, [tab, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const handleResolve = async (r: Report) => {
    setBusyId(r.id);
    try {
      await resolveReport(r.id);
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (r: Report) => {
    setBusyId(r.id);
    try {
      await dismissReport(r.id);
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteEvent = async (r: Report) => {
    if (!r.event_id) return;
    const ok = window.confirm(
      `Delete the reported event? This removes the event doc and marks this report resolved.`,
    );
    if (!ok) return;
    setBusyId(r.id);
    try {
      await deleteEvent(r.event_id);
      await resolveReport(r.id);
      reload();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const tabs: { id: Tab; label: string; count: number }[] = useMemo(
    () => [
      { id: 'open',      label: 'Open',      count: counts.open },
      { id: 'resolved',  label: 'Resolved',  count: counts.resolved },
      { id: 'dismissed', label: 'Dismissed', count: counts.dismissed },
      { id: 'all',       label: 'All',       count: counts.total },
    ],
    [counts],
  );

  const columns = [
    {
      key: 'message',
      header: 'Report',
      render: (r: EnrichedReport) => (
        <div style={{ maxWidth: 380 }}>
          <p style={{ fontSize: 13, color: '#111827', whiteSpace: 'pre-wrap' }}>
            {r.message ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'event',
      header: 'Event',
      render: (r: EnrichedReport) =>
        r.event_id ? (
          <EntityLink kind="event" id={r.event_id} label={r.eventName ?? r.event_id} strong ellipsis />
        ) : (
          <span style={{ color: '#9ca3af' }}>—</span>
        ),
    },
    {
      key: 'user',
      header: 'Reporter',
      render: (r: EnrichedReport) =>
        r.user_id ? (
          <EntityLink kind="user" id={r.user_id} label={r.userName ?? r.user_id} />
        ) : (
          <span style={{ color: '#9ca3af' }}>—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: EnrichedReport) => <Badge status={(r.status ?? 'open') as ReportStatus} />,
    },
    {
      key: 'date',
      header: 'Date',
      render: (r: EnrichedReport) => formatDayMonthYear(r.createdAt ?? r.resolved_at),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (r: EnrichedReport) => {
        if (r.status && r.status !== 'open') {
          return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
        }
        const busy = busyId === r.id;
        return (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              style={styles.iconBtn}
              title="Mark resolved"
              disabled={busy}
              onClick={() => void handleResolve(r)}
            >
              <Check size={14} color="#16a34a" />
            </button>
            <button
              style={styles.iconBtn}
              title="Dismiss"
              disabled={busy}
              onClick={() => void handleDismiss(r)}
            >
              <XIcon size={14} color="#6b7280" />
            </button>
            <button
              style={{ ...styles.iconBtn, borderColor: '#fecaca' }}
              title="Delete event"
              disabled={busy || !r.event_id}
              onClick={() => void handleDeleteEvent(r)}
            >
              <Trash2 size={14} color="#dc2626" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Moderation inbox for user-filed abuse reports." />

      <div style={styles.tabs}>
        {tabs.map((t) => (
          <button
            key={t.id}
            style={{
              ...styles.tab,
              ...(t.id === tab ? styles.tabActive : {}),
            }}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            <span style={{ ...styles.tabCount, background: t.id === tab ? '#fff' : '#f3f4f6', color: t.id === tab ? '#3d7a5a' : '#6b7280' }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {error && <div style={styles.errorBar}>{error}</div>}

      <div style={styles.tableCard}>
        <DataTable
          columns={columns}
          data={items}
          keyField="id"
          loading={loading}
          emptyMessage={tab === 'open' ? 'No open reports — inbox zero.' : 'No reports in this view.'}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tabs: {
    display: 'flex',
    gap: 6,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  tab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: '#fff',
    border: '1px solid #e5e7eb',
    color: '#374151',
    borderRadius: 20,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  tabActive: {
    background: '#3d7a5a',
    borderColor: '#3d7a5a',
    color: '#fff',
  },
  tabCount: {
    fontSize: 11,
    padding: '1px 8px',
    borderRadius: 999,
    fontWeight: 700,
  },
  tableCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '18px 20px',
  },
  iconBtn: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '6px 8px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBar: {
    background: '#fee2e2',
    color: '#b91c1c',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 12,
  },
};
