import {
  collection,
  doc,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  addDoc,
  updateDoc,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { Payout, PayoutStatus } from '../../types';
import { sanitize } from './sanitize';
import { logAdminAction } from './audit';

// Mirrors event-dashboard/lib/backend/schema/payout_record.dart.
// IMPORTANT: the organiser field is stored as `orgnizer_id` in Firestore
// (typo preserved from the Flutter schema). The mobile app's
// transaction_history page reads it under that spelling — do NOT rename.

const COLLECTION = 'payout';

// ─── Read ─────────────────────────────────────────────────────────────────

function extractId(pathOrId: string | undefined): string {
  if (!pathOrId) return '';
  return pathOrId.includes('/') ? (pathOrId.split('/').pop() ?? '') : pathOrId;
}

function sanitizePayout(id: string, data: Record<string, unknown>): Payout {
  const raw = sanitize(data) as Record<string, unknown>;
  return {
    id,
    event_id: extractId(raw.event_id as string | undefined),
    amount: (raw.amount as number | undefined) ?? 0,
    status: (raw.status ?? 'pending') as PayoutStatus | string,
    createdAt: raw.createdAt as Timestamp | undefined,
    updatedAt: raw.updatedAt as Timestamp | undefined,
    orgnizer_id: extractId(raw.orgnizer_id as string | undefined),
    payment_method: raw.payment_method as string | undefined,
    transaction_id: raw.transaction_id as string | undefined,
    bankAccount: raw.bankAccount as string | undefined,
  };
}

export interface ListPayoutsOptions {
  status?: PayoutStatus | 'all';
  eventId?: string;
  pageSize?: number;
}

/**
 * List recent payouts with optional status + event filter. Server query uses
 * the composite indexes defined in firestore.indexes.json (status+createdAt,
 * event_id+createdAt). Falls back to an unordered query if the index isn't
 * yet deployed.
 */
export async function listPayouts(opts: ListPayoutsOptions = {}): Promise<Payout[]> {
  const { status = 'all', eventId, pageSize = 50 } = opts;
  const filters: QueryConstraint[] = [];
  if (status !== 'all') filters.push(where('status', '==', status));
  if (eventId) filters.push(where('event_id', '==', doc(db, 'Event', eventId)));

  try {
    const snap = await getDocs(
      query(collection(db, COLLECTION), ...filters, orderBy('createdAt', 'desc'), limit(pageSize)),
    );
    return snap.docs.map((d) => sanitizePayout(d.id, d.data()));
  } catch {
    // Ordered query failed (likely missing index) — degrade gracefully.
    try {
      const snap = await getDocs(query(collection(db, COLLECTION), ...filters, limit(pageSize)));
      return snap.docs
        .map((d) => sanitizePayout(d.id, d.data()))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    } catch {
      return [];
    }
  }
}

export interface PayoutCounts {
  pending: number;
  paid: number;
  failed: number;
  cancelled: number;
  total: number;
}

export async function countPayoutsByStatus(): Promise<PayoutCounts> {
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), limit(500)));
    const counts: PayoutCounts = { pending: 0, paid: 0, failed: 0, cancelled: 0, total: 0 };
    snap.docs.forEach((d) => {
      const s = (d.data().status as string | undefined) ?? 'pending';
      counts.total += 1;
      if (s === 'paid') counts.paid += 1;
      else if (s === 'failed') counts.failed += 1;
      else if (s === 'cancelled') counts.cancelled += 1;
      else counts.pending += 1;
    });
    return counts;
  } catch {
    return { pending: 0, paid: 0, failed: 0, cancelled: 0, total: 0 };
  }
}

// ─── Write ────────────────────────────────────────────────────────────────

export interface CreatePayoutInput {
  eventId: string;
  organizerUid: string;
  amount: number;
  paymentMethod?: string;
  transactionId?: string;
  /** Stripe bank_account_id — usually sourced from bank_account.bank_account_id. */
  bankAccount?: string;
  status?: PayoutStatus;
}

/**
 * Create a payout record. Field shape matches what the organiser's mobile
 * transaction_history page expects (`orgnizer_id`, `event_id` as refs; amount
 * as number; status + createdAt + updatedAt as server timestamps).
 */
export async function createPayout(input: CreatePayoutInput): Promise<string> {
  if (!input.eventId) throw new Error('eventId is required');
  if (!input.organizerUid) throw new Error('organizerUid is required');
  if (!(input.amount > 0)) throw new Error('amount must be greater than 0');

  const now = Timestamp.now();
  const data: Record<string, unknown> = {
    event_id: doc(db, 'Event', input.eventId),
    orgnizer_id: doc(db, 'users', input.organizerUid),
    amount: input.amount,
    status: input.status ?? 'pending',
    createdAt: now,
    updatedAt: now,
    payment_method: input.paymentMethod ?? '',
    transaction_id: input.transactionId ?? '',
    bankAccount: input.bankAccount ?? '',
  };

  const ref = await addDoc(collection(db, COLLECTION), data);
  await logAdminAction({
    type: 'payout.create',
    target: { kind: 'payout', id: ref.id, name: null },
    metadata: {
      eventId: input.eventId,
      organizerUid: input.organizerUid,
      amount: input.amount,
      status: data.status,
    },
  });
  return ref.id;
}

export interface UpdatePayoutStatusInput {
  status: PayoutStatus;
  transactionId?: string;
  paymentMethod?: string;
}

export async function updatePayoutStatus(id: string, patch: UpdatePayoutStatusInput): Promise<void> {
  const data: Record<string, unknown> = {
    status: patch.status,
    updatedAt: Timestamp.now(),
  };
  if (typeof patch.transactionId === 'string') data.transaction_id = patch.transactionId;
  if (typeof patch.paymentMethod === 'string') data.payment_method = patch.paymentMethod;

  await updateDoc(doc(db, COLLECTION, id), data);
  await logAdminAction({
    type: 'payout.update',
    target: { kind: 'payout', id, name: null },
    metadata: { changedFields: Object.keys(data), status: patch.status },
  });
}

export const __INTERNAL__ = { sanitizePayout };
