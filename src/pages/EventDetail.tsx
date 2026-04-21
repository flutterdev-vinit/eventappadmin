import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, Ticket, MessageSquare, DollarSign,
  MapPin, Calendar, Globe, Lock, Clock, Tag, User, CheckCircle, XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import Badge from '../components/Badge';
import {
  fetchEventById, fetchAttendeeCountForEvent, fetchCompletedPaymentCountForEvent,
  fetchAttendeesForEvent, fetchCategoryMap, fetchMessageCountForEvent, fetchUserById,
} from '../lib/firestore';
import type { Event, AppUser } from '../types';
import type { AttendeeWithUser } from '../lib/firestore';

const GREEN = '#3d7a5a';
const LIGHT_GREEN = '#e8f5ee';

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [catMap, setCatMap] = useState<Record<string, string>>({});
  const [organiser, setOrganiser] = useState<AppUser | null>(null);

  // Stats
  const [attendeeCount, setAttendeeCount] = useState<number | null>(null);
  const [paidCount, setPaidCount] = useState<number | null>(null);
  const [messageCount, setMessageCount] = useState<number | null>(null);

  // Attendees list
  const [attendees, setAttendees] = useState<AttendeeWithUser[] | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    // Wrapped in an async fn so the initial `setLoading(true)` / `setOrganiser(null)`
    // are not literal setState statements in the effect body — that would
    // trip react-hooks/set-state-in-effect. Functionally identical.
    async function load(eventId: string) {
      setLoading(true);
      setOrganiser(null);
      try {
        const [ev, cats, att, paid, msgs, attList] = await Promise.all([
          fetchEventById(eventId),
          fetchCategoryMap(),
          fetchAttendeeCountForEvent(eventId).catch(() => 0),
          fetchCompletedPaymentCountForEvent(eventId).catch(() => 0),
          fetchMessageCountForEvent(eventId).catch(() => 0),
          fetchAttendeesForEvent(eventId),
        ]);
        if (cancelled) return;
        setEvent(ev as Event | null);
        setCatMap(cats as Record<string, string>);
        setAttendeeCount(att as number);
        setPaidCount(paid as number);
        setMessageCount(msgs as number);
        setAttendees(attList as AttendeeWithUser[]);
        const authorPath = (ev as Event | null)?.author;
        if (authorPath) {
          const uid = String(authorPath).split('/').pop();
          if (uid) {
            const user = await fetchUserById(uid);
            if (!cancelled) setOrganiser(user);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load(id);
    return () => { cancelled = true; };
  }, [id]);

  const fmt = (ts: unknown, withTime = false) => {
    if (!ts) return '—';
    try {
      const d = (ts as { toDate(): Date }).toDate();
      return format(d, withTime ? 'dd MMM yyyy, h:mm a' : 'dd MMM yyyy');
    } catch { return '—'; }
  };

  const categoryName = () => {
    if (!event?.category) return '—';
    const id = event.category.split('/').pop() ?? event.category;
    return catMap[event.category] ?? catMap[id] ?? 'Unknown category';
  };

  const inviteeCount = event?.invitees?.length ?? 0;

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <p style={{ color: '#6b7280', marginTop: 12, fontSize: 14 }}>Loading event…</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div style={styles.loadingWrap}>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Event not found.</p>
        <button style={styles.backBtn} onClick={() => navigate('/events')}>
          <ArrowLeft size={14} /> Back to Events
        </button>
      </div>
    );
  }

  // Funnel conversion percentages
  const funnelSteps = [
    { label: 'Invited', count: inviteeCount, color: '#6366f1' },
    { label: 'Attended', count: attendeeCount ?? 0, color: GREEN },
    { label: 'Paid', count: paidCount ?? 0, color: '#f59e0b' },
  ];
  const funnelMax = Math.max(...funnelSteps.map((s) => s.count), 1);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* ── Back nav ─────────────────────────────────────────── */}
      <button style={styles.backBtn} onClick={() => navigate('/events')}>
        <ArrowLeft size={14} /> Back to Events
      </button>

      {/* ── Event header card ─────────────────────────────────── */}
      <div style={styles.headerCard}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <Badge status={event.is_published ? 'active' : 'draft' as string} />
              {event.mode && (
                <span style={modeBadgeStyle(event.mode)}>{event.mode}</span>
              )}
              {event.is_private && (
                <span style={{ ...styles.chip, background: '#fef3c7', color: '#92400e' }}>
                  <Lock size={10} /> Private
                </span>
              )}
              {event.is_paid && (
                <span style={{ ...styles.chip, background: '#dbeafe', color: '#1e40af' }}>
                  <DollarSign size={10} /> Paid · ${event.price ?? 0}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1.3, marginBottom: 6 }}>
              {event.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Tag size={13} color="#9ca3af" />
              <span style={{ fontSize: 13, color: '#6b7280' }}>{categoryName()}</span>
              {event.create_at && (
                <>
                  <span style={{ color: '#d1d5db' }}>·</span>
                  <Clock size={12} color="#9ca3af" />
                  <span style={{ fontSize: 13, color: '#6b7280' }}>Created {fmt(event.create_at)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────── */}
      <div style={styles.statsRow}>
        <StatCard icon={<Users size={18} color={GREEN} />} label="Attendees" value={attendeeCount ?? '…'} color={LIGHT_GREEN} />
        <StatCard icon={<Ticket size={18} color="#6366f1" />} label="Invited" value={inviteeCount} color="#eef2ff" />
        <StatCard icon={<DollarSign size={18} color="#f59e0b" />} label="Paid Tickets" value={paidCount ?? '…'} color="#fffbeb" />
        <StatCard icon={<MessageSquare size={18} color="#2563eb" />} label="Messages" value={messageCount ?? '…'} color="#dbeafe" />
      </div>

      {/* ── Main content: details + funnel ────────────────────── */}
      <div style={styles.twoCol}>

        {/* Left: event details */}
        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Event Details</h3>

          {event.description && (
            <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-wrap' }}>
              {event.description}
            </p>
          )}

          <dl>
            {event.startDate && (
              <DLRow icon={<Calendar size={14} color={GREEN} />} label="Start" value={fmt(event.startDate, true)} />
            )}
            {event.endDate && (
              <DLRow icon={<Calendar size={14} color="#9ca3af" />} label="End" value={fmt(event.endDate, true)} />
            )}
            {event.location?.address && (
              <DLRow icon={<MapPin size={14} color="#dc2626" />} label="Location" value={event.location.address} />
            )}
            {event.mode && (
              <DLRow icon={<Globe size={14} color={GREEN} />} label="Mode" value={
                <span style={{ textTransform: 'capitalize' }}>{event.mode}</span>
              } />
            )}
            {event.author && (
              <DLRow icon={<User size={14} color="#6366f1" />} label="Organiser" value={(() => {
                const uid = String(event.author).split('/').pop() ?? '';
                const name = organiser?.displayName || organiser?.email;
                return (
                  <button
                    onClick={() => navigate(`/users/${uid}`)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', background: '#eef2ff',
                      color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 11, flexShrink: 0,
                    }}>
                      {name ? name[0].toUpperCase() : '?'}
                    </div>
                    <span style={{ fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                      {name ?? (organiser === null && event.author ? 'Loading…' : 'Unknown organiser')}
                    </span>
                  </button>
                );
              })()} />
            )}
          </dl>
        </div>

        {/* Right: funnel */}
        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Conversion Funnel</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            {funnelSteps.map((step, i) => {
              const prevCount = i === 0 ? step.count : funnelSteps[i - 1].count;
              const pct = prevCount > 0 ? Math.round((step.count / prevCount) * 100) : 0;
              const barWidth = funnelMax > 0 ? `${Math.round((step.count / funnelMax) * 100)}%` : '0%';

              return (
                <div key={step.label}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{step.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {i > 0 && (
                        <span style={{ fontSize: 11, color: pct >= 50 ? GREEN : '#dc2626', fontWeight: 600 }}>
                          {pct}% from prev
                        </span>
                      )}
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{step.count}</span>
                    </div>
                  </div>
                  <div style={{ background: '#f3f4f6', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                    <div style={{
                      width: barWidth,
                      height: '100%',
                      background: step.color,
                      borderRadius: 99,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary insight */}
          {(attendeeCount !== null && inviteeCount > 0) && (
            <div style={{ marginTop: 18, padding: '10px 14px', background: LIGHT_GREEN, borderRadius: 8 }}>
              <p style={{ fontSize: 13, color: GREEN, fontWeight: 500 }}>
                {Math.round((attendeeCount / inviteeCount) * 100)}% of invited users attended this event.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Attendees list ────────────────────────────────────── */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={styles.sectionTitle}>Attendees</h3>
          {attendees !== null && (
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              Showing {attendees.length}{(attendeeCount ?? 0) > attendees.length ? ` of ${attendeeCount}` : ''}
            </span>
          )}
        </div>

        {attendees === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={styles.skeletonRow} />
            ))}
          </div>
        ) : attendees.length === 0 ? (
          <div style={styles.emptyState}>
            <Users size={32} color="#d1d5db" />
            <p style={{ marginTop: 8, color: '#9ca3af', fontSize: 14 }}>No attendees yet.</p>
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div style={styles.tableHeader}>
              <span style={{ flex: 2 }}>User</span>
              <span style={{ flex: 1.5 }}>Email</span>
              <span style={{ flex: 1 }}>Status</span>
            </div>
            {attendees.map((a) => (
              <div
                key={a.attendeeDocId}
                style={{ ...styles.tableRow, cursor: a.userId ? 'pointer' : 'default' }}
                onClick={() => a.userId && navigate(`/users/${a.userId}`)}
                title={a.userId ? 'View user details' : undefined}
              >
                <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={styles.avatar}>
                    {(a.displayName || a.email || 'U')[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: a.userId ? '#6366f1' : '#111827', textDecoration: a.userId ? 'underline' : 'none', textDecorationStyle: 'dotted' }}>
                    {a.displayName || a.email || 'Unknown user'}
                  </span>
                </div>
                <span style={{ flex: 1.5, fontSize: 13, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.email || '—'}
                </span>
                <div style={{ flex: 1 }}>
                  {a.isCancelled
                    ? <span style={styles.cancelChip}><XCircle size={11} /> Cancelled</span>
                    : <span style={styles.activeChip}><CheckCircle size={11} /> Active</span>
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────────── */

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: React.ReactNode; color: string }) {
  return (
    <div style={{ ...styles.statCard, background: color }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</span>
      </div>
      <p style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{value}</p>
    </div>
  );
}

function DLRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 110, flexShrink: 0, paddingTop: 1 }}>
        {icon}
        <dt style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>{label}</dt>
      </div>
      <dd style={{ fontSize: 13, color: '#111827' }}>{value}</dd>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */

function modeBadgeStyle(mode: string): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
    background: mode === 'online' ? '#dbeafe' : mode === 'hybrid' ? '#f3e8ff' : LIGHT_GREEN,
    color: mode === 'online' ? '#1e40af' : mode === 'hybrid' ? '#7c3aed' : GREEN,
    display: 'inline-flex', alignItems: 'center', gap: 3,
    textTransform: 'capitalize',
  };
}

const styles: Record<string, React.CSSProperties> = {
  loadingWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '60vh', gap: 8,
  },
  spinner: {
    width: 36, height: 36, border: '3px solid #e5e7eb',
    borderTopColor: GREEN, borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16,
    background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
    padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    color: '#374151',
  },
  headerCard: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
    padding: '20px 24px', marginBottom: 16,
  },
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12, marginBottom: 16,
  },
  statCard: {
    borderRadius: 10, padding: '14px 18px', border: '1px solid transparent',
  },
  twoCol: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 20px',
  },
  sectionTitle: {
    fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 12,
  },
  chip: {
    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
    display: 'inline-flex', alignItems: 'center', gap: 3,
  },
  tableHeader: {
    display: 'flex', padding: '6px 10px', borderRadius: 6, background: '#f9fafb',
    fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: 4,
  },
  tableRow: {
    display: 'flex', alignItems: 'center', padding: '10px 10px',
    borderBottom: '1px solid #f9fafb', gap: 8,
  },
  avatar: {
    width: 30, height: 30, borderRadius: '50%', background: LIGHT_GREEN,
    color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 12, flexShrink: 0,
  },
  activeChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
    fontWeight: 600, background: LIGHT_GREEN, color: GREEN,
    padding: '3px 8px', borderRadius: 20,
  },
  cancelChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
    fontWeight: 600, background: '#fee2e2', color: '#dc2626',
    padding: '3px 8px', borderRadius: 20,
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '32px 0', color: '#9ca3af',
  },
  skeletonRow: {
    height: 44, borderRadius: 8, background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
    backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease infinite',
  },
};
