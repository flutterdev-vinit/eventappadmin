import {
  collection,
  getDocs,
  doc,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  getCountFromServer,
  getAggregateFromServer,
  sum,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { Payment } from '../../types';
import { sanitize } from './sanitize';
import { PAGE_SIZE, type Page } from './pagination';

// ─── Firestore `payment` schema notes ────────────────────────────────────────
// The mobile app writes these snake_case fields (different from the admin's
// clean `Payment` interface):
//   user_id:     DocumentReference → "users/{uid}"
//   eventId:     DocumentReference → "Event/{id}"   (camelCase in mobile)
//   created_at:  Timestamp  (NOT `date`)
//   amount:      number     (total charged)
//   subtotal:    number     (pre-fees)
//   service_fee, process_fee, seller_earn: number (breakdown)
//   payment_id:  string     (Stripe intent id)
//   status:      "" = successful/completed, "refund" = refunded
//               (No "pending"/"failed" values observed in production.)
//
// `sanitizePayment()` below normalises everything into the clean interface so
// UI code stays stable. Status queries against Firestore use the *actual*
// strings ("" and "refund"); only the client-side layer exposes "completed" /
// "refunded".

/** Map mobile-app status values to the admin's canonical enum. */
function normaliseStatus(raw: unknown): Payment['status'] {
  const s = (raw ?? '') as string;
  if (s === '' || s === 'completed' || s === 'success' || s === 'succeeded') return 'completed';
  if (s === 'refund' || s === 'refunded') return 'refunded';
  if (s === 'pending') return 'pending';
  if (s === 'failed' || s === 'error') return 'failed';
  return 'completed';
}

/** Reverse map: clean enum → Firestore raw value used for `where()` queries. */
function statusFilterToFirestoreValue(f: 'completed' | 'pending' | 'failed' | 'refunded'): string {
  // Production convention: empty string = completed, "refund" = refunded.
  if (f === 'completed') return '';
  if (f === 'refunded') return 'refund';
  return f;
}

export function sanitizePayment(id: string, raw: Record<string, unknown>): Payment {
  const clean = sanitize(raw) as Record<string, unknown>;
  return {
    id,
    amount: typeof clean.amount === 'number' ? (clean.amount as number) : Number(clean.amount) || 0,
    status: normaliseStatus(clean.status),
    date: (clean.created_at ?? clean.date) as Timestamp | undefined,
    userId: (clean.user_id ?? clean.userId) as string | undefined,
    eventId: (clean.eventId ?? clean.event_id) as string | undefined,
    currency: clean.currency as string | undefined,
  };
}

// ─── User-scoped fetches ─────────────────────────────────────────────────────

/**
 * Fetch payment history for a specific user.
 * `user_id` in payment docs is a DocumentReference (production) but older docs
 * may use a string UID or the `userId` camelCase field. We try each variant.
 *
 * NOTE: We intentionally do NOT use `orderBy('created_at')` in the server
 * query — that would require a composite index ({user_id asc, created_at desc})
 * that may not be deployed. A single user typically has < 50 payments, so
 * we fetch the filtered set and sort client-side.
 */
export async function fetchPaymentsByUser(userId: string): Promise<Payment[]> {
  const userRef = doc(db, 'users', userId);
  const PAGE = 100;
  const attempts: Promise<Payment[]>[] = [
    getDocs(query(collection(db, 'payment'), where('user_id', '==', userRef), limit(PAGE)))
      .then((s) => s.docs.map((d) => sanitizePayment(d.id, d.data())))
      .catch(() => []),
    getDocs(query(collection(db, 'payment'), where('user_id', '==', userId), limit(PAGE)))
      .then((s) => s.docs.map((d) => sanitizePayment(d.id, d.data())))
      .catch(() => []),
    getDocs(query(collection(db, 'payment'), where('userId', '==', userRef), limit(PAGE)))
      .then((s) => s.docs.map((d) => sanitizePayment(d.id, d.data())))
      .catch(() => []),
  ];

  for (const attempt of attempts) {
    const rows = await attempt;
    if (rows.length > 0) {
      // Client-side sort (desc by created_at) — cheap for < 100 rows.
      return rows.sort((a, b) =>
        ((b.date?.toMillis?.() ?? 0) as number) - ((a.date?.toMillis?.() ?? 0) as number),
      );
    }
  }
  return [];
}

/**
 * Count of successful payments for one event.
 * Tries DocumentReference first, falls back to string id. Uses the actual
 * Firestore value ("") for completed/successful.
 */
export async function fetchCompletedPaymentCountForEvent(eventId: string): Promise<number> {
  const successValue = ''; // "" = successful in production
  const tryCount = async (value: unknown) => {
    const q = query(
      collection(db, 'payment'),
      where('eventId', '==', value),
      where('status', '==', successValue),
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  };

  try {
    const eventRef = doc(db, 'Event', eventId);
    const count = await tryCount(eventRef);
    if (count > 0) return count;
  } catch { /* try next */ }

  try {
    return await tryCount(eventId);
  } catch {
    return 0;
  }
}

// ─── Generic fetches ─────────────────────────────────────────────────────────

export async function fetchPayments(constraints: QueryConstraint[] = []): Promise<Payment[]> {
  const hasLimit = constraints.some((c) => (c as { type?: string }).type === 'limit');
  const effective = hasLimit ? constraints : [...constraints, limit(50)];
  const q = query(collection(db, 'payment'), ...effective);
  const snap = await getDocs(q);
  return snap.docs.map((d) => sanitizePayment(d.id, d.data()));
}

export async function fetchRecentPayments(n = 5): Promise<Payment[]> {
  return fetchPayments([orderBy('created_at', 'desc'), limit(n)]);
}

/**
 * Cursor-based paginated payment fetch.
 * Orders by `created_at` (actual field). Filter values are translated via
 * `statusFilterToFirestoreValue` so the UI can keep using its clean enum.
 */
export async function fetchPaymentsPage(
  statusFilter: 'all' | 'completed' | 'pending' | 'failed' | 'refunded' = 'all',
  cursor: QueryDocumentSnapshot | null = null,
): Promise<Page<Payment>> {
  const statusValue = statusFilter !== 'all' ? statusFilterToFirestoreValue(statusFilter) : null;

  // Primary path: server-side orderBy + cursor pagination. Requires composite
  // index (status asc, created_at desc) when a status filter is applied.
  const primaryConstraints: QueryConstraint[] = [orderBy('created_at', 'desc'), limit(PAGE_SIZE)];
  if (statusValue !== null) primaryConstraints.push(where('status', '==', statusValue));
  if (cursor) primaryConstraints.push(startAfter(cursor));

  try {
    const snap = await getDocs(query(collection(db, 'payment'), ...primaryConstraints));
    const items = snap.docs.map((d) => sanitizePayment(d.id, d.data()));
    if (items.length > 0 || cursor) {
      return {
        items,
        cursor: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === PAGE_SIZE,
      };
    }
  } catch { /* fall through */ }

  // Fallback path: composite index missing, or orderBy field missing for
  // some docs. Fetch the filtered set without orderBy, then sort/paginate
  // client-side. Bounded by limit(500) so we never scan the whole collection.
  // For a typical admin with a few hundred payments this is still efficient.
  if (cursor) {
    // Cursor pagination requires the same ordered query — if we hit here on
    // page 2+, return empty rather than risk inconsistent pagination.
    return { items: [], cursor: null, hasMore: false };
  }

  try {
    const filterConstraints: QueryConstraint[] = [limit(500)];
    if (statusValue !== null) filterConstraints.unshift(where('status', '==', statusValue));
    const snap = await getDocs(query(collection(db, 'payment'), ...filterConstraints));
    const all = snap.docs.map((d) => ({ doc: d, pay: sanitizePayment(d.id, d.data()) }));
    all.sort((a, b) => {
      const ta = (a.pay.date?.toMillis?.() ?? 0) as number;
      const tb = (b.pay.date?.toMillis?.() ?? 0) as number;
      return tb - ta;
    });
    const slice = all.slice(0, PAGE_SIZE);
    return {
      items: slice.map((x) => x.pay),
      cursor: slice[slice.length - 1]?.doc ?? null,
      hasMore: all.length > PAGE_SIZE,
    };
  } catch {
    return { items: [], cursor: null, hasMore: false };
  }
}

/**
 * Total number of payment docs. Single aggregation read, no doc reads.
 */
export async function fetchPaymentCount(): Promise<number> {
  try {
    const snap = await getCountFromServer(collection(db, 'payment'));
    return snap.data().count;
  } catch {
    return 0;
  }
}

/**
 * Server-side sum of completed-payment amounts.
 * Prefers sum() aggregation (1 billed read). If aggregation fails once in a
 * session (e.g. missing composite index for the empty-string status filter),
 * subsequent calls skip straight to the bounded getDocs fallback to avoid
 * console spam from the Firestore SDK's own internal error logging.
 */
let _aggRevenueDisabled = false;

export async function fetchPaymentRevenue(): Promise<number> {
  const successValue = '';

  if (!_aggRevenueDisabled) {
    try {
      const q = query(collection(db, 'payment'), where('status', '==', successValue));
      const snap = await getAggregateFromServer(q, { totalRevenue: sum('amount') });
      const v = snap.data().totalRevenue;
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    } catch {
      _aggRevenueDisabled = true;
    }
  }

  try {
    const snap = await getDocs(
      query(collection(db, 'payment'), where('status', '==', successValue), limit(1000)),
    );
    return snap.docs.reduce((acc, d) => {
      const amt = d.data().amount;
      return acc + (typeof amt === 'number' ? amt : Number(amt) || 0);
    }, 0);
  } catch {
    return 0;
  }
}

/**
 * Payments for charts — capped. Ordered by `created_at`.
 */
export async function fetchPaymentsForCharts(n = 300): Promise<Payment[]> {
  return fetchPayments([orderBy('created_at', 'desc'), limit(n)]);
}

/**
 * Exact counts per payment status. Each aggregation is independent so one
 * failure (missing index, failed-precondition) doesn't zero out the others.
 */
export async function fetchPaymentStatusCounts(): Promise<{
  completed: number;
  pending: number;
  failed: number;
  refunded: number;
}> {
  const safeCount = async (firestoreValue: string): Promise<number> => {
    try {
      const snap = await getCountFromServer(
        query(collection(db, 'payment'), where('status', '==', firestoreValue)),
      );
      return snap.data().count;
    } catch (e) {
      console.warn(`fetchPaymentStatusCounts: aggregation for status="${firestoreValue}" failed`, e);
      return 0;
    }
  };

  // Query using actual Firestore values. "" = completed in production.
  const [completed, pending, failed, refund] = await Promise.all([
    safeCount(''),
    safeCount('pending'),
    safeCount('failed'),
    safeCount('refund'),
  ]);
  return { completed, pending, failed, refunded: refund };
}
