import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, CreditCard, Tag, CheckCircle, XCircle,
  Mail, Shield, Clock, ExternalLink, Megaphone, Landmark,
} from 'lucide-react';
import { format } from 'date-fns';
import Badge from '../components/Badge';
import {
  fetchUserById, fetchAttendedEventsByUser, fetchPaymentsByUser,
  fetchCategoryMap, fetchEventNames, fetchEventsByOrganiser,
  getBankAccountByUserId,
} from '../lib/firestore';
import type { AppUser, Event, Payment, BankAccount } from '../types';
import type { AttendedEventRow } from '../lib/firestore';
import { formatGbp } from '../lib/formatMoney';

const GREEN = '#3d7a5a';
const LIGHT_GREEN = '#e8f5ee';

type Tab = 'overview' | 'organised' | 'events' | 'payments';

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [catMap, setCatMap] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>('overview');

  const [events, setEvents] = useState<AttendedEventRow[] | null>(null);
  const [eventNames, setEventNames] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [organised, setOrganised] = useState<Event[] | null>(null);
  const [bank, setBank] = useState<BankAccount | null | undefined>(undefined); // undefined = not loaded yet

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    // Wrapped in an async fn so setState calls aren't direct statements in
    // the effect body (avoids react-hooks/set-state-in-effect false positive).
    async function load(userId: string) {
      setLoading(true);
      setBank(undefined);
      try {
        const [u, cats, evRows, pays, org, ba] = await Promise.all([
          fetchUserById(userId),
          fetchCategoryMap(),
          fetchAttendedEventsByUser(userId),
          fetchPaymentsByUser(userId),
          fetchEventsByOrganiser(userId),
          getBankAccountByUserId(userId),
        ]);
        if (cancelled) return;
        setUser(u as AppUser | null);
        setCatMap(cats as Record<string, string>);
        const rows = evRows as AttendedEventRow[];
        setEvents(rows);
        setPayments(pays as Payment[]);
        setOrganised(org as Event[]);
        setBank(ba);
        if (rows.length > 0) {
          const names = await fetchEventNames(rows.map((r) => r.eventId));
          if (!cancelled) setEventNames(names);
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

  const attended = events?.filter((e) => !e.isCancelled) ?? [];
  const cancelled = events?.filter((e) => e.isCancelled) ?? [];
  const totalPaid = payments?.filter((p) => p.status === 'completed').reduce((s, p) => s + (p.amount ?? 0), 0) ?? 0;
  const organisedPublished = organised?.filter((e) => e.is_published).length ?? 0;
  const organisedDraft = (organised?.length ?? 0) - organisedPublished;

  const interests = (user as (AppUser & { interest?: unknown[] }) | null)?.interest as string[] | undefined;

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <p style={{ color: '#6b7280', marginTop: 12, fontSize: 14 }}>Loading user…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.loadingWrap}>
        <p style={{ color: '#6b7280', fontSize: 14 }}>User not found.</p>
        <button style={styles.backBtn} onClick={() => navigate('/users')}>
          <ArrowLeft size={14} /> Back to Users
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      {/* ── Back nav ──────────────────────────────────────────── */}
      <button style={styles.backBtn} onClick={() => navigate('/users')}>
        <ArrowLeft size={14} /> Back to Users
      </button>

      {/* ── Profile header ────────────────────────────────────── */}
      <div style={styles.headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={styles.bigAvatar}>
            {(user.displayName || user.email || 'U')[0].toUpperCase()}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
                {user.displayName ?? 'Unknown User'}
              </h1>
              <Badge status={user.status ?? 'active'} />
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {user.email && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#6b7280' }}>
                  <Mail size={13} color="#9ca3af" />
                  {user.email}
                </span>
              )}
              {user.role && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#6b7280' }}>
                  <Shield size={13} color="#9ca3af" />
                  {user.role}
                </span>
              )}
              {user.createdAt && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#9ca3af' }}>
                  <Clock size={12} color="#d1d5db" />
                  Joined {fmt(user.createdAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────── */}
      <div style={styles.statsRow}>
        <StatCard
          label="Events Organised"
          value={organised === null ? '…' : organised.length}
          color="#ede9fe"
          textColor="#6d28d9"
        />
        <StatCard
          label="Events Attended"
          value={events === null ? '…' : attended.length}
          color={LIGHT_GREEN}
          textColor={GREEN}
        />
        <StatCard
          label="Cancelled"
          value={events === null ? '…' : cancelled.length}
          color="#fee2e2"
          textColor="#dc2626"
        />
        <StatCard
          label="Total Paid"
          value={payments === null ? '…' : formatGbp(totalPaid)}
          color="#fffbeb"
          textColor="#b45309"
        />
        <StatCard
          label="Payments"
          value={payments === null ? '…' : payments.length}
          color="#dbeafe"
          textColor="#2563eb"
        />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <div style={styles.card}>
        <div style={styles.tabBar}>
          {(['overview', 'organised', 'events', 'payments'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              ...styles.tabBtn,
              color: tab === t ? GREEN : '#6b7280',
              borderBottom: tab === t ? `2px solid ${GREEN}` : '2px solid transparent',
              fontWeight: tab === t ? 700 : 400,
            }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'organised' && organised !== null && (
                <span style={styles.tabBadge}>{organised.length}</span>
              )}
              {t === 'events' && events !== null && (
                <span style={styles.tabBadge}>{events.length}</span>
              )}
              {t === 'payments' && payments !== null && (
                <span style={styles.tabBadge}>{payments.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div style={styles.tabContent}>
            <dl>
              <DLRow icon={<Mail size={14} color={GREEN} />} label="Email" value={user.email ?? '—'} />
              <DLRow icon={<Shield size={14} color="#6366f1" />} label="Role" value={user.role ?? 'User'} />
              <DLRow icon={<CheckCircle size={14} color={GREEN} />} label="Status" value={<Badge status={user.status ?? 'active'} />} />
              <DLRow icon={<Clock size={14} color="#9ca3af" />} label="Joined" value={fmt(user.createdAt)} />
              <DLRow icon={<Shield size={14} color="#9ca3af" />} label="UID"
                value={<code style={{ fontSize: 11, color: '#9ca3af' }}>{user.id}</code>} />
              <DLRow
                icon={<Landmark size={14} color="#0ea5e9" />}
                label="Bank account"
                value={
                  bank === undefined ? (
                    <span style={{ color: '#9ca3af' }}>Loading…</span>
                  ) : bank === null ? (
                    <span style={{ color: '#9ca3af' }}>No bank account on file</span>
                  ) : (
                    <span>
                      {bank.last4 ? `•••• ${bank.last4}` : 'Linked'}
                      {bank.bank_account_id && (
                        <code style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af' }}>
                          {bank.bank_account_id}
                        </code>
                      )}
                    </span>
                  )
                }
              />
            </dl>

            {/* Interests */}
            {interests && interests.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Tag size={12} /> Interests
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {interests.map((ref) => {
                    const catId = String(ref).split('/').pop() ?? String(ref);
                    const name = catMap[String(ref)] ?? catMap[catId] ?? 'Unknown interest';
                    return (
                      <span key={String(ref)} style={styles.interestChip}>{name}</span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Organised (events where the user is the author) ── */}
        {tab === 'organised' && (
          <div style={styles.tabContent}>
            {organised === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(3)].map((_, i) => <div key={i} style={styles.skeletonRow} />)}
              </div>
            ) : organised.length === 0 ? (
              <div style={styles.emptyState}>
                <Megaphone size={32} color="#d1d5db" />
                <p style={{ marginTop: 8, color: '#9ca3af', fontSize: 14 }}>
                  This user hasn't organised any events.
                </p>
              </div>
            ) : (
              <>
                <div style={{ padding: '8px 12px', background: '#f9fafb', borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#6b7280' }}>
                  <strong style={{ color: '#111827' }}>{organisedPublished}</strong> published ·
                  {' '}<strong style={{ color: '#111827' }}>{organisedDraft}</strong> draft
                </div>
                <div style={styles.tableHeader}>
                  <span style={{ flex: 3 }}>Event</span>
                  <span style={{ flex: 1 }}>Status</span>
                  <span style={{ flex: 1.2 }}>Created</span>
                  <span style={{ width: 32 }} />
                </div>
                {organised.map((ev) => (
                  <div key={ev.id} style={styles.tableRow}>
                    <div style={{ flex: 3, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <Megaphone size={14} color="#6d28d9" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.name ?? 'Untitled event'}
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      {ev.is_published
                        ? <span style={styles.activeChip}><CheckCircle size={11} /> Published</span>
                        : <span style={styles.draftChip}>Draft</span>
                      }
                    </div>
                    <span style={{ flex: 1.2, fontSize: 12, color: '#9ca3af' }}>
                      {fmt(ev.create_at)}
                    </span>
                    <button
                      title="View event details"
                      onClick={() => navigate(`/events/${ev.id}`)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', width: 32 }}
                    >
                      <ExternalLink size={13} color="#6366f1" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Events ── */}
        {tab === 'events' && (
          <div style={styles.tabContent}>
            {events === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(3)].map((_, i) => <div key={i} style={styles.skeletonRow} />)}
              </div>
            ) : events.length === 0 ? (
              <div style={styles.emptyState}>
                <Calendar size={32} color="#d1d5db" />
                <p style={{ marginTop: 8, color: '#9ca3af', fontSize: 14 }}>No events attended yet.</p>
              </div>
            ) : (
              <>
                <div style={styles.tableHeader}>
                  <span style={{ flex: 3 }}>Event</span>
                  <span style={{ flex: 1 }}>Status</span>
                  <span style={{ width: 32 }} />
                </div>
                {events.map((row) => {
                  const name = eventNames[row.eventId];
                  return (
                    <div key={row.eventId} style={styles.tableRow}>
                      <div style={{ flex: 3, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Calendar size={14} color={row.isCancelled ? '#dc2626' : GREEN} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {Object.keys(eventNames).length === 0
                            ? <span style={{ color: '#d1d5db' }}>Loading…</span>
                            : (name || 'Unknown event')
                          }
                        </span>
                      </div>
                      <div style={{ flex: 1 }}>
                        {row.isCancelled
                          ? <span style={styles.cancelChip}><XCircle size={11} /> Cancelled</span>
                          : <span style={styles.activeChip}><CheckCircle size={11} /> Active</span>
                        }
                      </div>
                      <button
                        title="View event details"
                        onClick={() => navigate(`/events/${row.eventId}`)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', width: 32 }}
                      >
                        <ExternalLink size={13} color="#6366f1" />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── Payments ── */}
        {tab === 'payments' && (
          <div style={styles.tabContent}>
            {payments === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(3)].map((_, i) => <div key={i} style={styles.skeletonRow} />)}
              </div>
            ) : payments.length === 0 ? (
              <div style={styles.emptyState}>
                <CreditCard size={32} color="#d1d5db" />
                <p style={{ marginTop: 8, color: '#9ca3af', fontSize: 14 }}>No payment history.</p>
              </div>
            ) : (
              <>
                <div style={{ padding: '8px 12px', background: '#f9fafb', borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#6b7280' }}>
                  Total completed payments: <strong style={{ color: '#111827' }}>{formatGbp(totalPaid)}</strong>
                </div>
                <div style={styles.tableHeader}>
                  <span style={{ flex: 1.5 }}>Date</span>
                  <span style={{ flex: 1 }}>Amount</span>
                  <span style={{ flex: 1 }}>Status</span>
                </div>
                {payments.map((p) => (
                  <div key={p.id} style={styles.tableRow}>
                    <span style={{ flex: 1.5, fontSize: 13, color: '#6b7280' }}>{fmt(p.date)}</span>
                    <strong style={{ flex: 1, fontSize: 14, color: '#111827' }}>{formatGbp(p.amount ?? 0)}</strong>
                    <div style={{ flex: 1 }}>
                      <Badge status={p.status ?? 'pending'} />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function StatCard({ label, value, color, textColor }: { label: string; value: React.ReactNode; color: string; textColor: string }) {
  return (
    <div style={{ background: color, borderRadius: 10, padding: '14px 18px' }}>
      <p style={{ fontSize: 24, fontWeight: 700, color: textColor, marginBottom: 4 }}>{value}</p>
      <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</p>
    </div>
  );
}

function DLRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 110, flexShrink: 0, paddingTop: 1 }}>
        {icon}
        <dt style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>{label}</dt>
      </div>
      <dd style={{ fontSize: 13, color: '#111827' }}>{value ?? '—'}</dd>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────── */

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
  bigAvatar: {
    width: 56, height: 56, borderRadius: '50%', background: LIGHT_GREEN,
    color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 22, flexShrink: 0,
  },
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12, marginBottom: 16,
  },
  card: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden',
  },
  tabBar: {
    display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '0 4px',
  },
  tabBtn: {
    padding: '12px 16px', fontSize: 13, background: 'none', border: 'none',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
  },
  tabBadge: {
    fontSize: 11, fontWeight: 700, background: '#f3f4f6', color: '#6b7280',
    borderRadius: 20, padding: '1px 7px',
  },
  tabContent: {
    padding: '16px 20px',
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
  draftChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
    fontWeight: 600, background: '#f3f4f6', color: '#6b7280',
    padding: '3px 8px', borderRadius: 20,
  },
  interestChip: {
    fontSize: 12, fontWeight: 600, background: LIGHT_GREEN, color: GREEN,
    borderRadius: 20, padding: '4px 12px',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '40px 0', color: '#9ca3af',
  },
  skeletonRow: {
    height: 44, borderRadius: 8,
    background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
    backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease infinite',
  },
};
