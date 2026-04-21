import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MessageCircle, RefreshCw, Users, ExternalLink, TrendingUp } from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import PageHeader from '../components/PageHeader';
import { fetchEventsActivity, fetchTotalMessageCount, PAGE_SIZE } from '../lib/firestore';
import type { EventActivity } from '../lib/firestore';
import { format } from 'date-fns';

const GREEN = '#3d7a5a';
const LIGHT_GREEN = '#e8f5ee';

function fmt(ts: unknown): string {
  if (!ts) return '—';
  try { return format((ts as { toDate(): Date }).toDate(), 'dd MMM yyyy'); } catch { return '—'; }
}

export default function Messages() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<EventActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [totalMessages, setTotalMessages] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');

  const cursors = useRef<(QueryDocumentSnapshot | null)[]>([null]);

  const loadPage = useCallback(async (pageNum: number, sf: 'all' | 'published' | 'draft') => {
    setLoading(true);
    try {
      const cursor = cursors.current[pageNum - 1] ?? null;
      const result = await fetchEventsActivity(sf, cursor);
      setRows(result.rows);
      setHasMore(result.hasMore);
      setPage(pageNum);
      if (result.cursor && result.hasMore) cursors.current[pageNum] = result.cursor;
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cursors.current = [null];
    loadPage(1, statusFilter);
    fetchTotalMessageCount().then(setTotalMessages);
  }, [loadPage, statusFilter]);

  const filtered = search
    ? rows.filter((r) =>
        r.eventName.toLowerCase().includes(search.toLowerCase()) ||
        (r.organiserName ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const activeEvents = rows.filter((r) => r.messageCount > 0).length;
  const silentEvents = rows.length - activeEvents;
  const totalOnPage = rows.reduce((s, r) => s + r.messageCount, 0);

  const refresh = () => {
    cursors.current = [null];
    setSearch('');
    loadPage(1, statusFilter);
    fetchTotalMessageCount().then(setTotalMessages);
  };

  return (
    <div>
      <PageHeader
        title="Chat Activity"
        subtitle="Group event chat — all attendees can message within their event's channel."
      />

      {/* ── Hero stat cards ───────────────────────────────────────────── */}
      <div style={styles.statsGrid}>
        <StatCard
          icon={<MessageCircle size={20} color={GREEN} />}
          label="Total Messages"
          value={totalMessages === null ? '…' : totalMessages.toLocaleString()}
          bg={LIGHT_GREEN}
        />
        <StatCard
          icon={<TrendingUp size={20} color="#6366f1" />}
          label="Active Chats (page)"
          value={loading ? '…' : activeEvents.toString()}
          bg="#eef2ff"
        />
        <StatCard
          icon={<MessageCircle size={20} color="#9ca3af" />}
          label="Silent Events (page)"
          value={loading ? '…' : silentEvents.toString()}
          bg="#f9fafb"
        />
        <StatCard
          icon={<TrendingUp size={20} color="#f59e0b" />}
          label="Messages (page total)"
          value={loading ? '…' : totalOnPage.toLocaleString()}
          bg="#fffbeb"
        />
      </div>

      {/* ── Most Active Leaderboard ────────────────────────────────────── */}
      {!loading && filtered.some((r) => r.messageCount > 0) && (
        <div style={{ ...styles.card, marginBottom: 16 }}>
          <h3 style={styles.sectionTitle}>
            <TrendingUp size={14} color={GREEN} style={{ marginRight: 6 }} />
            Most Active Chats — this page
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.filter((r) => r.messageCount > 0).slice(0, 6).map((row, i) => {
              const max = filtered[0]?.messageCount || 1;
              const pct = Math.round((row.messageCount / max) * 100);
              return (
                <div key={row.eventId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Rank */}
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : '#f3f4f6',
                    color: i < 3 ? '#fff' : '#6b7280',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>{i + 1}</span>

                  {/* Name + organiser */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <button
                        onClick={() => navigate(`/events/${row.eventId}`)}
                        style={styles.linkBtn}
                      >
                        {row.eventName}
                      </button>
                      {row.organiserName && (
                        <button
                          onClick={() => row.authorUid && navigate(`/users/${row.authorUid}`)}
                          style={{ ...styles.organiserChip }}
                          title="View organiser"
                        >
                          {row.organiserName[0].toUpperCase()}
                          <span style={{ marginLeft: 4 }}>{row.organiserName}</span>
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                        <div style={{
                          width: `${pct}%`, height: '100%',
                          background: i === 0 ? '#f59e0b' : GREEN,
                          borderRadius: 99, transition: 'width 0.5s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', flexShrink: 0, minWidth: 28 }}>
                        {row.messageCount}
                      </span>
                    </div>
                  </div>

                  {/* Attendees */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <Users size={12} color="#9ca3af" />
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{row.attendeeCount}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Full Table ────────────────────────────────────────────────── */}
      <div style={styles.card}>
        <div style={styles.cardTop}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>All Events — Chat Activity</h2>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {loading ? 'Loading…' : `${filtered.length} events on this page · sorted by messages ↓`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={styles.searchWrap}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                placeholder="Filter by event or organiser…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              style={styles.select}
              value={statusFilter}
              onChange={(e) => {
                cursors.current = [null];
                setStatusFilter(e.target.value as 'all' | 'published' | 'draft');
              }}
            >
              <option value="all">All Events</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
            <button style={styles.refreshBtn} onClick={refresh} title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={styles.skeleton} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={styles.emptyState}>
            <MessageCircle size={36} color="#d1d5db" />
            <p style={{ marginTop: 8, color: '#9ca3af', fontSize: 14 }}>No events found.</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={styles.tableHeader}>
              <span style={{ flex: 3 }}>Event</span>
              <span style={{ flex: 2 }}>Organiser</span>
              <span style={{ flex: 1, textAlign: 'center' }}>Attendees</span>
              <span style={{ flex: 2 }}>Messages</span>
              <span style={{ flex: 1 }}>Date</span>
              <span style={{ width: 28 }} />
            </div>

            {filtered.map((row) => {
              const max = filtered[0]?.messageCount || 1;
              const pct = Math.round((row.messageCount / max) * 100);
              const hasChats = row.messageCount > 0;
              return (
                <div key={row.eventId} style={styles.tableRow}>
                  {/* Event name + mode + status */}
                  <div style={{ flex: 3, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.eventName}
                      </span>
                      {!row.isPublished && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', background: '#f3f4f6', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                          DRAFT
                        </span>
                      )}
                    </div>
                    {row.mode && (
                      <span style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>
                        {row.mode}
                      </span>
                    )}
                  </div>

                  {/* Organiser */}
                  <div style={{ flex: 2, minWidth: 0 }}>
                    {row.organiserName || row.organiserEmail ? (
                      <button
                        onClick={() => row.authorUid && navigate(`/users/${row.authorUid}`)}
                        style={styles.organiserBtn}
                        title="View organiser profile"
                      >
                        <div style={styles.orgAvatar}>
                          {(row.organiserName || row.organiserEmail || '?')[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.organiserName ?? row.organiserEmail}
                        </span>
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: '#d1d5db' }}>—</span>
                    )}
                  </div>

                  {/* Attendees */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Users size={12} color="#9ca3af" />
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{row.attendeeCount}</span>
                  </div>

                  {/* Message bar + count */}
                  <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`, height: '100%',
                        background: hasChats ? GREEN : '#e5e7eb',
                        borderRadius: 99,
                      }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: hasChats ? 700 : 400, color: hasChats ? '#111827' : '#9ca3af', minWidth: 28 }}>
                      {row.messageCount}
                    </span>
                  </div>

                  {/* Start date */}
                  <span style={{ flex: 1, fontSize: 12, color: '#9ca3af' }}>{fmt(row.startDate)}</span>

                  {/* Link */}
                  <button
                    onClick={() => navigate(`/events/${row.eventId}`)}
                    style={{ width: 28, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
                    title="View event"
                  >
                    <ExternalLink size={13} color="#6366f1" />
                  </button>
                </div>
              );
            })}

            {/* Pagination */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 13, color: '#9ca3af' }}>
                Page {page} · {filtered.length} of up to {PAGE_SIZE} shown
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ ...styles.pageBtn, opacity: page <= 1 ? 0.4 : 1 }}
                  onClick={() => { if (page > 1) { cursors.current = cursors.current.slice(0, page - 1); loadPage(page - 1, statusFilter); } }}
                  disabled={page <= 1}
                >
                  ← Prev
                </button>
                <button
                  style={{ ...styles.pageBtn, opacity: !hasMore ? 0.4 : 1 }}
                  onClick={() => { if (hasMore) loadPage(page + 1, statusFilter); }}
                  disabled={!hasMore}
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</p>
        <p style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{value}</p>
      </div>
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    marginBottom: 16,
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '18px 20px',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '7px 10px',
    borderRadius: 6,
    background: '#f9fafb',
    fontSize: 11,
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 4,
    gap: 8,
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '11px 10px',
    borderBottom: '1px solid #f9fafb',
    gap: 8,
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: '#111827',
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  organiserChip: {
    display: 'inline-flex',
    alignItems: 'center',
    background: '#eef2ff',
    color: '#6366f1',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 20,
    padding: '2px 8px',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    gap: 3,
  },
  organiserBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    maxWidth: '100%',
    color: '#374151',
  },
  orgAvatar: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: '#eef2ff',
    color: '#6366f1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 11,
    flexShrink: 0,
  },
  searchWrap: { position: 'relative' as const },
  searchInput: {
    paddingLeft: 32,
    paddingRight: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    fontSize: 14,
    outline: 'none',
    minWidth: 160,
    maxWidth: 240,
    color: '#111827',
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
  refreshBtn: {
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 8,
    padding: '8px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    color: '#374151',
  },
  pageBtn: {
    padding: '6px 14px',
    borderRadius: 7,
    border: '1px solid #e5e7eb',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  skeleton: {
    height: 52,
    borderRadius: 8,
    background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s ease infinite',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
    color: '#9ca3af',
  },
};
