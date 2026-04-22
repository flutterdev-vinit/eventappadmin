import { useEffect, useMemo, useState } from 'react';
import { Plus, X, DollarSign, CheckCircle, Clock, XCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/Table';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import EntityLink from '../components/EntityLink';
import {
  listPayouts,
  countPayoutsByStatus,
  createPayout,
  updatePayoutStatus,
  getBankAccountByUserId,
  fetchEventNames,
  fetchUserNames,
  fetchEventById,
  type PayoutCounts,
} from '../lib/firestore';
import { formatDayMonthYear } from '../lib/dateUtils';
import { useWindowSize } from '../hooks/useWindowSize';
import type { Payout, PayoutStatus } from '../types';

type StatusFilter = PayoutStatus | 'all';

interface EnrichedPayout extends Payout {
  eventName?: string;
  organiserName?: string;
}

export default function Payouts() {
  const { isMobile, isTablet } = useWindowSize();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [items, setItems] = useState<EnrichedPayout[]>([]);
  const [counts, setCounts] = useState<PayoutCounts>({
    pending: 0, paid: 0, failed: 0, cancelled: 0, total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run(currentFilter: StatusFilter) {
      setLoading(true);
      setError(null);
      try {
        const [rows, c] = await Promise.all([
          listPayouts({ status: currentFilter }),
          countPayoutsByStatus(),
        ]);
        if (cancelled) return;
        const eventIds = rows.map((r) => r.event_id ?? '').filter(Boolean) as string[];
        const userIds = rows.map((r) => r.orgnizer_id ?? '').filter(Boolean) as string[];
        const [eventNames, userNames] = await Promise.all([
          fetchEventNames(eventIds),
          fetchUserNames(userIds),
        ]);
        if (cancelled) return;
        setItems(
          rows.map((r) => ({
            ...r,
            eventName: r.event_id ? eventNames[r.event_id] : undefined,
            organiserName: r.orgnizer_id ? userNames[r.orgnizer_id] : undefined,
          })),
        );
        setCounts(c);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run(filter);
    return () => { cancelled = true; };
  }, [filter, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const handleMark = async (p: Payout, status: PayoutStatus) => {
    setBusyId(p.id);
    try {
      await updatePayoutStatus(p.id, { status });
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const statsGridCols = isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)';
  const statCards = useMemo(() => [
    { label: 'Total Payouts', value: counts.total.toLocaleString(), icon: <DollarSign size={22} color="#3d7a5a" />, iconBg: '#e8f5ee' },
    { label: 'Paid',     value: counts.paid.toLocaleString(),     icon: <CheckCircle size={22} color="#16a34a" />, iconBg: '#dcfce7' },
    { label: 'Pending',  value: counts.pending.toLocaleString(),  icon: <Clock       size={22} color="#d97706" />, iconBg: '#fef3c7' },
    { label: 'Failed / Cancelled', value: (counts.failed + counts.cancelled).toLocaleString(), icon: <XCircle size={22} color="#dc2626" />, iconBg: '#fee2e2' },
  ], [counts]);

  const columns = [
    {
      key: 'event',
      header: 'Event',
      render: (p: EnrichedPayout) =>
        p.event_id ? (
          <EntityLink kind="event" id={p.event_id} label={p.eventName ?? p.event_id} strong ellipsis />
        ) : (
          <span style={{ color: '#9ca3af' }}>—</span>
        ),
    },
    {
      key: 'organiser',
      header: 'Organiser',
      render: (p: EnrichedPayout) =>
        p.orgnizer_id ? (
          <EntityLink kind="user" id={p.orgnizer_id} label={p.organiserName ?? p.orgnizer_id} />
        ) : (
          <span style={{ color: '#9ca3af' }}>—</span>
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (p: EnrichedPayout) => <strong>${(p.amount ?? 0).toFixed(2)}</strong>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p: EnrichedPayout) => <Badge status={String(p.status ?? 'pending')} />,
    },
    {
      key: 'date',
      header: 'Created',
      render: (p: EnrichedPayout) => formatDayMonthYear(p.createdAt),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (p: EnrichedPayout) => {
        if (p.status === 'paid' || p.status === 'failed' || p.status === 'cancelled') {
          return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
        }
        const busy = busyId === p.id;
        return (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button style={styles.smallBtn} disabled={busy} onClick={() => void handleMark(p, 'paid')}>
              Mark paid
            </button>
            <button style={{ ...styles.smallBtn, color: '#dc2626', borderColor: '#fecaca' }} disabled={busy} onClick={() => void handleMark(p, 'failed')}>
              Failed
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Payouts" subtitle="Initiate and track organiser payouts." />

      <div style={{ display: 'grid', gridTemplateColumns: statsGridCols, gap: 16, marginBottom: 20 }}>
        {statCards.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div style={styles.tableCard}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>All payouts</h2>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {loading ? 'Loading…' : `${items.length} on this page`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              style={styles.select}
              value={filter}
              onChange={(e) => setFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button style={styles.primaryBtn} onClick={() => setShowModal(true)}>
              <Plus size={16} /> Initiate payout
            </button>
          </div>
        </div>

        {error && <div style={styles.errorBar}>{error}</div>}

        <DataTable
          columns={columns}
          data={items}
          keyField="id"
          loading={loading}
          emptyMessage="No payouts match this filter."
        />
      </div>

      {showModal && (
        <InitiatePayoutModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ─── Initiate payout modal ───────────────────────────────────────────────

interface ModalProps {
  initialEventId?: string;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

export function InitiatePayoutModal({ initialEventId, onClose, onCreated }: ModalProps) {
  const [eventId, setEventId] = useState(initialEventId ?? '');
  const [organiserUid, setOrganiserUid] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank');
  const [transactionId, setTransactionId] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankLookupMsg, setBankLookupMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Auto-resolve organiser + bank account when the event id is set.
  useEffect(() => {
    if (!eventId.trim()) return;
    let cancelled = false;
    (async () => {
      setBankLookupMsg('Looking up organiser…');
      try {
        const ev = await fetchEventById(eventId.trim());
        if (cancelled) return;
        const uid = ev?.author ? (ev.author.split('/').pop() ?? '') : '';
        if (uid) {
          setOrganiserUid(uid);
          const ba = await getBankAccountByUserId(uid);
          if (cancelled) return;
          if (ba?.bank_account_id) {
            setBankAccount(ba.bank_account_id);
            setBankLookupMsg(`Bank account found${ba.last4 ? ` (•••• ${ba.last4})` : ''}.`);
          } else {
            setBankLookupMsg('No bank account on file for this organiser.');
          }
        } else {
          setBankLookupMsg('Event has no author — enter organiser UID manually.');
        }
      } catch {
        setBankLookupMsg('Lookup failed — enter fields manually.');
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  const handleCreate = async () => {
    const amt = parseFloat(amount);
    if (!eventId.trim()) return setErr('Event ID is required');
    if (!organiserUid.trim()) return setErr('Organiser UID is required');
    if (!(amt > 0)) return setErr('Amount must be greater than 0');

    setSaving(true);
    setErr(null);
    try {
      await createPayout({
        eventId: eventId.trim(),
        organizerUid: organiserUid.trim(),
        amount: amt,
        paymentMethod,
        transactionId: transactionId.trim() || undefined,
        bankAccount: bankAccount.trim() || undefined,
      });
      await onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Initiate payout</h2>
          <button style={styles.iconBtn} onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div style={styles.modalBody}>
          <label style={styles.label}>
            Event ID
            <input
              type="text"
              style={styles.input}
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              placeholder="abc123"
              disabled={!!initialEventId}
            />
          </label>
          <label style={styles.label}>
            Organiser UID
            <input
              type="text"
              style={styles.input}
              value={organiserUid}
              onChange={(e) => setOrganiserUid(e.target.value)}
              placeholder="users uid"
            />
          </label>
          <label style={styles.label}>
            Amount (USD)
            <input
              type="number"
              step="0.01"
              style={styles.input}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
            />
          </label>
          <label style={styles.label}>
            Bank account (Stripe bank_account_id)
            <input
              type="text"
              style={styles.input}
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="ba_xxx"
            />
            {bankLookupMsg && (
              <small style={{ color: '#6b7280', fontWeight: 400 }}>{bankLookupMsg}</small>
            )}
          </label>
          <label style={styles.label}>
            Payment method
            <input
              type="text"
              style={styles.input}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="bank"
            />
          </label>
          <label style={styles.label}>
            Transaction ID (optional)
            <input
              type="text"
              style={styles.input}
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="tx_xxx"
            />
          </label>

          {err && <div style={styles.errorBar}>{err}</div>}
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.secondaryBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button style={styles.primaryBtn} onClick={() => void handleCreate()} disabled={saving}>
            {saving ? 'Creating…' : 'Create payout'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tableCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '18px 20px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: '#3d7a5a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    background: '#fff',
    color: '#374151',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  smallBtn: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    color: '#374151',
    borderRadius: 8,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
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
    margin: '10px 0',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(17, 24, 39, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 500,
    padding: 16,
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 520,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '90vh',
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalBody: {
    padding: '18px 20px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  modalFooter: {
    padding: '14px 20px',
    borderTop: '1px solid #f3f4f6',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    color: '#111827',
    outline: 'none',
    fontWeight: 400,
  },
};
