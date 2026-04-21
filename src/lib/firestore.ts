import {
  collection,
  collectionGroup,
  getDocs,
  getDoc,
  doc,
  setDoc,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  getCountFromServer,
  getAggregateFromServer,
  sum,
  updateDoc,
  deleteDoc,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  Timestamp,
  DocumentReference,
  GeoPoint,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Event, Payment, AppUser } from '../types';

// ─── Pagination types ─────────────────────────────────────────────────────────

export const PAGE_SIZE = 20;

export interface Page<T> {
  items: T[];
  /** Last Firestore snapshot on this page — pass as cursor to fetch next page. */
  cursor: QueryDocumentSnapshot | null;
  /** Whether another page exists (items.length === PAGE_SIZE). */
  hasMore: boolean;
}

// ─── Sanitiser ────────────────────────────────────────────────────────────────
// Converts DocumentReference / GeoPoint objects to safe primitives so no raw
// Firestore object ever reaches a React component.

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof DocumentReference) return value.path;
  if (value instanceof GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
  if (value instanceof Timestamp) return value; // kept — callers call .toDate() themselves
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}

function sanitizeDoc<T>(id: string, data: Record<string, unknown>): T {
  return { id, ...(sanitize(data) as object) } as T;
}

// ─── Events ───────────────────────────────────────────────────────────────────

/**
 * Fetch events with optional constraints.
 * Always apply at least a limit — callers must pass one or accept the default.
 */
export async function fetchEvents(constraints: QueryConstraint[] = []): Promise<Event[]> {
  // Ensure a limit is always applied to avoid unbounded reads.
  const hasLimit = constraints.some((c) => (c as { type?: string }).type === 'limit');
  const effective = hasLimit ? constraints : [...constraints, limit(50)];
  const q = query(collection(db, 'Event'), ...effective);
  const snap = await getDocs(q);
  return snap.docs.map((d) => sanitizeDoc<Event>(d.id, d.data()));
}

export async function fetchEventCount(): Promise<number> {
  const snap = await getCountFromServer(collection(db, 'Event'));
  return snap.data().count;
}

export async function fetchPublishedEventCount(): Promise<number> {
  const q = query(collection(db, 'Event'), where('is_published', '==', true));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

/** Fetch the last N events ordered by creation date. */
export async function fetchRecentEvents(n = 5): Promise<Event[]> {
  return fetchEvents([orderBy('create_at', 'desc'), limit(n)]);
}

/**
 * Fetch up to `n` events for use in aggregation/charting.
 * Ordered by startDate desc to get the most recent records.
 */
export async function fetchEventsForCharts(n = 200): Promise<Event[]> {
  return fetchEvents([orderBy('create_at', 'desc'), limit(n)]);
}

/**
 * Cursor-based paginated event fetch.
 * Pass `cursor` (the last doc from the previous page) to advance.
 * Supports published/draft filter via `statusFilter` and optional server-side mode filter.
 *
 * Note: combining `mode` with `orderBy('create_at')` requires a composite Firestore
 * index `(mode ASC, create_at DESC)`. If the index is missing, we fall back to a
 * client-side mode filter silently so the page never breaks.
 */
export async function fetchEventsPage(
  statusFilter: 'all' | 'published' | 'draft' = 'all',
  cursor: QueryDocumentSnapshot | null = null,
  modeFilter = '',
): Promise<Page<Event> & { serverModeFiltered: boolean }> {
  const base: QueryConstraint[] = [orderBy('create_at', 'desc'), limit(PAGE_SIZE)];
  if (statusFilter === 'published') base.push(where('is_published', '==', true));
  if (statusFilter === 'draft')     base.push(where('is_published', '==', false));
  if (cursor) base.push(startAfter(cursor));

  const runQuery = async (withMode: boolean) => {
    const constraints = withMode && modeFilter
      ? [where('mode', '==', modeFilter), ...base]
      : base;
    const snap = await getDocs(query(collection(db, 'Event'), ...constraints));
    return snap;
  };

  try {
    const snap = modeFilter ? await runQuery(true) : await runQuery(false);
    const items = snap.docs.map((d) => sanitizeDoc<Event>(d.id, d.data()));
    const lastDoc = snap.docs[snap.docs.length - 1] ?? null;
    return { items, cursor: lastDoc, hasMore: snap.docs.length === PAGE_SIZE, serverModeFiltered: !!modeFilter };
  } catch {
    // Index missing — fall back to no mode filter; caller applies client-side
    const snap = await runQuery(false);
    const items = snap.docs.map((d) => sanitizeDoc<Event>(d.id, d.data()));
    const lastDoc = snap.docs[snap.docs.length - 1] ?? null;
    return { items, cursor: lastDoc, hasMore: snap.docs.length === PAGE_SIZE, serverModeFiltered: false };
  }
}

/**
 * Cross-page name prefix search for Events.
 * Triggered on Enter-key / Search button — NOT on every keystroke.
 *
 * Firestore prefix trick: name >= term && name <= term + '\uf8ff'
 * Limitation: case-sensitive. "golf" won't find "Golf".
 * We search lowercase-normalised if a `name_lower` field exists, otherwise raw name.
 * Results are ordered by name, not by date — paginated separately from browse mode.
 */
export async function searchEvents(
  term: string,
  statusFilter: 'all' | 'published' | 'draft' = 'all',
): Promise<Event[]> {
  if (!term.trim()) return [];
  const lo = term.trim();
  const hi = lo + '\uf8ff';
  try {
    const constraints: QueryConstraint[] = [
      where('name', '>=', lo),
      where('name', '<=', hi),
      orderBy('name'),
      limit(60),
    ];
    if (statusFilter === 'published') constraints.push(where('is_published', '==', true));
    if (statusFilter === 'draft')     constraints.push(where('is_published', '==', false));
    const snap = await getDocs(query(collection(db, 'Event'), ...constraints));
    return snap.docs.map((d) => sanitizeDoc<Event>(d.id, d.data()));
  } catch {
    return [];
  }
}

/**
 * Cross-page email prefix search for Users.
 * Triggered on Enter-key / Search button — NOT on every keystroke.
 */
export async function searchUsers(term: string): Promise<AppUser[]> {
  if (!term.trim()) return [];
  const lo = term.trim().toLowerCase();
  const hi = lo + '\uf8ff';
  try {
    const snap = await getDocs(query(
      collection(db, 'users'),
      where('email', '>=', lo),
      where('email', '<=', hi),
      orderBy('email'),
      limit(60),
    ));
    return snap.docs.map((d) => sanitizeUser(d.id, d.data()));
  } catch {
    return [];
  }
}

export async function fetchEventById(eventId: string): Promise<Event | null> {
  try {
    const snap = await getDoc(doc(db, 'Event', eventId));
    if (!snap.exists()) return null;
    return sanitizeDoc<Event>(snap.id, snap.data());
  } catch {
    return null;
  }
}

/**
 * Batch-fetch event names for a list of event IDs.
 * Returns a map of eventId → name (or shortened ID if not found).
 */
export async function fetchEventNames(eventIds: string[]): Promise<Record<string, string>> {
  if (!eventIds.length) return {};
  const unique = [...new Set(eventIds)];
  const snaps = await Promise.all(unique.map((id) => getDoc(doc(db, 'Event', id)).catch(() => null)));
  const map: Record<string, string> = {};
  snaps.forEach((snap, i) => {
    const id = unique[i];
    map[id] = snap?.exists() ? ((snap.data().name as string | undefined) ?? 'Untitled event') : 'Unknown event';
  });
  return map;
}

export async function updateEvent(id: string, data: Partial<Event>): Promise<void> {
  await updateDoc(doc(db, 'Event', id), { ...data, update_at: Timestamp.now() });
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteDoc(doc(db, 'Event', id));
}

// ─── Attendees ────────────────────────────────────────────────────────────────

export async function fetchAttendeeCountForEvent(eventId: string): Promise<number> {
  const q = query(collection(db, 'Event', eventId, 'attendees'));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

/** Cross-collection count of all attendees using collectionGroup. */
export async function fetchTotalAttendeeCount(): Promise<number> {
  try {
    const snap = await getCountFromServer(collectionGroup(db, 'attendees'));
    return snap.data().count;
  } catch {
    return 0;
  }
}

export interface AttendedEventRow {
  eventId: string;
  isCancelled: boolean;
}

/**
 * Fetch all events a specific user has RSVP'd to.
 * Uses the collectionGroup index on attendees.user_id.
 *
 * The mobile app may store user_id in one of three ways:
 *   1. Firestore DocumentReference  → doc(db, 'users', uid)   ← most likely in Flutter
 *   2. Full path string             → "users/uid"
 *   3. Plain UID string             → "uid"
 *
 * We try all three sequentially, stopping at the first that returns results.
 * If all return 0 the user genuinely has no attendances.
 */
export async function fetchAttendedEventsByUser(userId: string): Promise<AttendedEventRow[]> {
  const toRows = (snap: { docs: QueryDocumentSnapshot[] }) =>
    snap.docs.map((d) => ({
      eventId: d.ref.parent.parent?.id ?? '',
      isCancelled: (d.data().isCancelled ?? false) as boolean,
    }));

  // Attempt 1: DocumentReference (Flutter / most mobile apps)
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDocs(query(collectionGroup(db, 'attendees'), where('user_id', '==', userRef)));
    if (snap.docs.length > 0) return toRows(snap);
  } catch { /* index may not cover this type — try next */ }

  // Attempt 2: Path string "users/{uid}"
  try {
    const snap = await getDocs(query(collectionGroup(db, 'attendees'), where('user_id', '==', `users/${userId}`)));
    if (snap.docs.length > 0) return toRows(snap);
  } catch { /* try next */ }

  // Attempt 3: Plain UID string
  try {
    const snap = await getDocs(query(collectionGroup(db, 'attendees'), where('user_id', '==', userId)));
    return toRows(snap); // return whatever we get (including 0)
  } catch {
    return [];
  }
}

export interface AttendeeWithUser {
  attendeeDocId: string;
  userId: string;          // resolved plain UID
  isCancelled: boolean;
  displayName?: string;
  email?: string;
}

/**
 * Fetch attendees for an event with basic user info.
 * Limits to 50 to avoid heavy reads on large events.
 */
export async function fetchAttendeesForEvent(eventId: string, pageLimit = 50): Promise<AttendeeWithUser[]> {
  try {
    const q = query(collection(db, 'Event', eventId, 'attendees'), limit(pageLimit));
    const snap = await getDocs(q);
    if (snap.empty) return [];

    // Resolve user IDs (may be DocumentReference or string)
    const rows = snap.docs.map((d) => {
      const raw = d.data();
      const userIdRaw = raw.user_id;
      let uid = '';
      if (userIdRaw && typeof userIdRaw === 'object' && 'path' in userIdRaw) {
        // DocumentReference
        uid = (userIdRaw as DocumentReference).id;
      } else if (typeof userIdRaw === 'string') {
        uid = userIdRaw.split('/').pop() ?? userIdRaw;
      }
      return { attendeeDocId: d.id, userId: uid, isCancelled: (raw.isCancelled ?? false) as boolean };
    });

    // Batch-fetch user profiles in parallel
    const userSnaps = await Promise.all(
      rows.map(({ userId: uid }) =>
        uid ? getDoc(doc(db, 'users', uid)).catch(() => null) : Promise.resolve(null)
      )
    );

    return rows.map((row, i) => {
      const uSnap = userSnaps[i];
      if (uSnap?.exists()) {
        const u = uSnap.data();
        return {
          ...row,
          displayName: (u.first_name ?? u.displayName ?? '') as string,
          email: (u.email ?? '') as string,
        };
      }
      return row;
    });
  } catch {
    return [];
  }
}

/**
 * Fetch payment history for a specific user.
 * userId field in payment docs may be a DocumentReference, path string, or plain UID.
 */
export async function fetchPaymentsByUser(userId: string): Promise<Payment[]> {
  const baseConstraints = [orderBy('date', 'desc'), limit(20)];

  // Attempt 1: DocumentReference
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDocs(query(collection(db, 'payment'), where('userId', '==', userRef), ...baseConstraints));
    if (snap.docs.length > 0) return snap.docs.map((d) => sanitizeDoc<Payment>(d.id, d.data()));
  } catch { /* try next */ }

  // Attempt 2: Plain UID string (most common in web apps)
  try {
    const snap = await getDocs(query(collection(db, 'payment'), where('userId', '==', userId), ...baseConstraints));
    return snap.docs.map((d) => sanitizeDoc<Payment>(d.id, d.data()));
  } catch {
    return [];
  }
}

/**
 * Fetch payment count for a specific event (for funnel display).
 * eventId in payment docs may be a DocumentReference or a plain ID string.
 */
export async function fetchCompletedPaymentCountForEvent(eventId: string): Promise<number> {
  const tryCount = async (value: unknown) => {
    const q = query(
      collection(db, 'payment'),
      where('eventId', '==', value),
      where('status', '==', 'completed'),
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  };

  // Try DocumentReference first
  try {
    const count = await tryCount(doc(db, 'Event', eventId));
    if (count > 0) return count;
  } catch { /* try next */ }

  // Fall back to plain ID string
  try {
    return await tryCount(eventId);
  } catch {
    return 0;
  }
}

// ─── Payments ─────────────────────────────────────────────────────────────────

/**
 * Fetch payments with optional constraints.
 * Always applies a default limit(50) if no limit is supplied.
 */
export async function fetchPayments(constraints: QueryConstraint[] = []): Promise<Payment[]> {
  const hasLimit = constraints.some((c) => (c as { type?: string }).type === 'limit');
  const effective = hasLimit ? constraints : [...constraints, limit(50)];
  const q = query(collection(db, 'payment'), ...effective);
  const snap = await getDocs(q);
  return snap.docs.map((d) => sanitizeDoc<Payment>(d.id, d.data()));
}

export async function fetchRecentPayments(n = 5): Promise<Payment[]> {
  return fetchPayments([orderBy('date', 'desc'), limit(n)]);
}

/**
 * Cursor-based paginated payment fetch.
 * Supports status filter. Pass cursor to get the next page.
 */
export async function fetchPaymentsPage(
  statusFilter: 'all' | 'completed' | 'pending' | 'failed' | 'refunded' = 'all',
  cursor: QueryDocumentSnapshot | null = null,
): Promise<Page<Payment>> {
  const constraints: QueryConstraint[] = [orderBy('date', 'desc'), limit(PAGE_SIZE)];
  if (statusFilter !== 'all') constraints.push(where('status', '==', statusFilter));
  if (cursor) constraints.push(startAfter(cursor));
  const q = query(collection(db, 'payment'), ...constraints);
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => sanitizeDoc<Payment>(d.id, d.data()));
  const lastDoc = snap.docs[snap.docs.length - 1] ?? null;
  return { items, cursor: lastDoc, hasMore: snap.docs.length === PAGE_SIZE };
}

export async function fetchPaymentCount(): Promise<number> {
  const snap = await getCountFromServer(collection(db, 'payment'));
  return snap.data().count;
}

/**
 * Total revenue for completed payments using a server-side aggregate sum.
 * This is a single read (aggregation) instead of fetching every document.
 */
export async function fetchPaymentRevenue(): Promise<number> {
  try {
    const q = query(collection(db, 'payment'), where('status', '==', 'completed'));
    const snap = await getAggregateFromServer(q, { totalRevenue: sum('amount') });
    return snap.data().totalRevenue ?? 0;
  } catch {
    // Fallback: if aggregate not available or rules block it, return 0
    return 0;
  }
}

/**
 * Fetch payments for charts — capped to avoid unbounded reads.
 * Returns up to `n` most recent payments.
 */
export async function fetchPaymentsForCharts(n = 300): Promise<Payment[]> {
  return fetchPayments([orderBy('date', 'desc'), limit(n)]);
}

/**
 * Exact counts per payment status using server-side aggregations.
 * 4 count queries — no document reads.
 */
export async function fetchPaymentStatusCounts(): Promise<{
  completed: number;
  pending: number;
  failed: number;
  refunded: number;
}> {
  const [completed, pending, failed, refunded] = await Promise.all([
    getCountFromServer(query(collection(db, 'payment'), where('status', '==', 'completed'))),
    getCountFromServer(query(collection(db, 'payment'), where('status', '==', 'pending'))),
    getCountFromServer(query(collection(db, 'payment'), where('status', '==', 'failed'))),
    getCountFromServer(query(collection(db, 'payment'), where('status', '==', 'refunded'))),
  ]);
  return {
    completed: completed.data().count,
    pending: pending.data().count,
    failed: failed.data().count,
    refunded: refunded.data().count,
  };
}

// ─── Users ────────────────────────────────────────────────────────────────────
// Actual Firestore field names differ from the admin's AppUser interface.
// The mobile app stores:  first_name (not displayName), created_time (not createdAt).
// We map them here so the rest of the UI stays stable.

function sanitizeUser(id: string, data: Record<string, unknown>): AppUser {
  const raw = sanitize(data) as Record<string, unknown>;
  return {
    id,
    // Prefer first_name (mobile app), fall back to displayName (other clients)
    displayName: (raw.first_name ?? raw.displayName ?? raw.name) as string | undefined,
    email: raw.email as string | undefined,
    photoURL: raw.photoURL as string | undefined,
    // Prefer created_time (mobile app), fall back to createdAt
    createdAt: (raw.created_time ?? raw.createdAt) as Timestamp | undefined,
    status: (raw.status ?? 'active') as 'active' | 'suspended',
    role: raw.role as string | undefined,
  };
}

/**
 * Fetch users with optional constraints.
 * Always applies a default limit(50) if no limit is supplied.
 */
export async function fetchUsers(constraints: QueryConstraint[] = []): Promise<AppUser[]> {
  const hasLimit = constraints.some((c) => (c as { type?: string }).type === 'limit');
  const effective = hasLimit ? constraints : [...constraints, limit(50)];
  const q = query(collection(db, 'users'), ...effective);
  const snap = await getDocs(q);
  return snap.docs.map((d) => sanitizeUser(d.id, d.data()));
}

/**
 * Batch-fetch user display names for a list of UIDs.
 * Returns a map of uid → best available name (first_name > displayName > email > uid).
 */
export async function fetchUserNames(userIds: string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const unique = [...new Set(userIds.filter(Boolean))];
  const snaps = await Promise.all(unique.map((id) => getDoc(doc(db, 'users', id)).catch(() => null)));
  const map: Record<string, string> = {};
  snaps.forEach((snap, i) => {
    const id = unique[i];
    if (snap?.exists()) {
      const d = snap.data();
      map[id] = ((d.first_name ?? d.displayName ?? d.email ?? 'Unknown user') as string);
    } else {
      map[id] = 'Unknown user';
    }
  });
  return map;
}

export async function fetchUserById(userId: string): Promise<AppUser | null> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return null;
    return sanitizeUser(snap.id, snap.data());
  } catch {
    return null;
  }
}

export async function fetchUserCount(): Promise<number> {
  try {
    const snap = await getCountFromServer(collection(db, 'users'));
    return snap.data().count;
  } catch {
    return 0;
  }
}

export async function fetchRecentUsers(n = 5): Promise<AppUser[]> {
  try {
    return fetchUsers([orderBy('created_time', 'desc'), limit(n)]);
  } catch {
    return fetchUsers([limit(n)]);
  }
}

/**
 * Cursor-based paginated user fetch.
 * Ordered by created_time (actual Firestore field name in the mobile app).
 * Falls back to unordered if the field / index is missing.
 */
export async function fetchUsersPage(
  statusFilter: 'all' | 'active' | 'suspended' = 'all',
  cursor: QueryDocumentSnapshot | null = null,
): Promise<Page<AppUser>> {
  const constraints: QueryConstraint[] = [limit(PAGE_SIZE)];
  if (statusFilter !== 'all') constraints.push(where('status', '==', statusFilter));
  if (cursor) constraints.push(startAfter(cursor));

  const runQuery = async (ordered: boolean) => {
    const orderConstraints = ordered ? [orderBy('created_time', 'desc')] : [];
    const q = query(collection(db, 'users'), ...orderConstraints, ...constraints);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => sanitizeUser(d.id, d.data()));
    const lastDoc = snap.docs[snap.docs.length - 1] ?? null;
    return { items, cursor: lastDoc, hasMore: snap.docs.length === PAGE_SIZE };
  };

  try {
    const result = await runQuery(true);
    // If ordered query returns nothing, fall back to unordered (field may not exist on all docs)
    if (result.items.length === 0 && !cursor) return runQuery(false);
    return result;
  } catch {
    return runQuery(false);
  }
}

export async function updateUser(id: string, data: Partial<AppUser>): Promise<void> {
  await updateDoc(doc(db, 'users', id), data);
}

// ─── Event categories ─────────────────────────────────────────────────────────
// The event_category collection stores human-readable category names.
// Event documents store a DocumentReference to this collection; the sanitiser
// converts it to the path string "event_category/{id}".

let _categoryMapCache: Record<string, string> | null = null;

export async function fetchCategoryMap(): Promise<Record<string, string>> {
  if (_categoryMapCache) return _categoryMapCache;
  try {
    const snap = await getDocs(query(collection(db, 'event_category'), limit(200)));
    const map: Record<string, string> = {};
    snap.docs.forEach((d) => {
      const data = d.data();
      const name = (data.name ?? data.title ?? data.label ?? d.id) as string;
      // Index by both full path and plain ID so callers can use either format
      map[`event_category/${d.id}`] = name;
      map[d.id] = name;
    });
    _categoryMapCache = map;
    return map;
  } catch {
    return {};
  }
}

// ─── Chat messages ────────────────────────────────────────────────────────────

/** Count of chat messages for a specific event (sub-collection).
 *  Tries getCountFromServer first (cheapest). Falls back to getDocs+limit
 *  if the aggregation is denied (e.g. rules only allow document reads).
 */
export async function fetchMessageCountForEvent(eventId: string): Promise<number> {
  const col = collection(db, 'Event', eventId, 'chat_messages');
  try {
    const snap = await getCountFromServer(col);
    return snap.data().count;
  } catch {
    // Fallback: read up to 500 docs and count — catches rule configs that
    // allow list reads but not COUNT aggregations.
    try {
      const snap = await getDocs(query(col, limit(500)));
      return snap.size;
    } catch {
      return 0;
    }
  }
}

/** Total chat messages across all events using collectionGroup (1 aggregation read). */
export async function fetchTotalMessageCount(): Promise<number> {
  try {
    const snap = await getCountFromServer(collectionGroup(db, 'chat_messages'));
    return snap.data().count;
  } catch {
    // Fallback: count across a limited set of docs (rough estimate)
    try {
      const snap = await getDocs(query(collectionGroup(db, 'chat_messages'), limit(1000)));
      return snap.size;
    } catch {
      return 0;
    }
  }
}

export interface EventActivity {
  eventId: string;
  eventName: string;
  authorUid: string;
  organiserName: string | null;
  organiserEmail: string | null;
  mode: string;
  isPublished: boolean;
  startDate: unknown;
  attendeeCount: number;
  messageCount: number;
  inviteeCount: number;
}

/**
 * Fetch a rich activity snapshot for a page of events.
 * Parallelises: message counts + attendee counts + organiser lookups.
 * Returns events sorted by messageCount desc.
 */
export async function fetchEventsActivity(
  statusFilter: 'all' | 'published' | 'draft',
  cursor: QueryDocumentSnapshot | null,
): Promise<{ rows: EventActivity[]; cursor: QueryDocumentSnapshot | null; hasMore: boolean }> {
  const result = await fetchEventsPage(statusFilter, cursor);
  const events = result.items;

  if (!events.length) return { rows: [], cursor: null, hasMore: false };

  // Parallel: message counts + attendee counts
  const [msgCounts, attCounts] = await Promise.all([
    Promise.all(events.map((ev) => fetchMessageCountForEvent(ev.id))),
    Promise.all(events.map((ev) => fetchAttendeeCountForEvent(ev.id).catch(() => 0))),
  ]);

  // Batch-fetch unique organiser profiles
  const authorUids = [...new Set(
    events.map((ev) => String(ev.author ?? '').split('/').pop() ?? '').filter(Boolean)
  )];
  const organiserSnaps = await Promise.all(
    authorUids.map((uid) => getDoc(doc(db, 'users', uid)).catch(() => null))
  );
  const organiserMap: Record<string, { name: string | null; email: string | null }> = {};
  authorUids.forEach((uid, i) => {
    const d = organiserSnaps[i];
    organiserMap[uid] = d?.exists()
      ? { name: (d.data().first_name ?? d.data().displayName ?? d.data().email ?? null) as string | null, email: (d.data().email ?? null) as string | null }
      : { name: 'Unknown organiser', email: null };
  });

  const rows: EventActivity[] = events.map((ev, i) => {
    const uid = String(ev.author ?? '').split('/').pop() ?? '';
    const org = organiserMap[uid] ?? { name: null, email: null };
    return {
      eventId: ev.id,
      eventName: ev.name ?? 'Untitled',
      authorUid: uid,
      organiserName: org.name,
      organiserEmail: org.email,
      mode: ev.mode ?? '',
      isPublished: ev.is_published ?? false,
      startDate: ev.startDate,
      attendeeCount: attCounts[i] as number,
      messageCount: msgCounts[i],
      inviteeCount: ev.invitees?.length ?? 0,
    };
  });

  // Sort most active first
  rows.sort((a, b) => b.messageCount - a.messageCount);

  return { rows, cursor: result.cursor, hasMore: result.hasMore };
}

// ─── sessionStorage mirror helpers ────────────────────────────────────────────
// Keeps a serialised copy of each cache doc in sessionStorage so repeated tab
// opens within the same browser session cost 0 Firestore reads.

const SS_STATS_KEY = 'admin_stats_v1';
const SS_ANALYTICS_KEY = 'admin_analytics_v1';

function ssGet<T extends { updatedAt: { toMillis?: () => number; _seconds?: number } }>(
  key: string,
  ttlMs: number,
): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    // updatedAt may be serialised as { _seconds, _nanoseconds } (plain JSON of Timestamp)
    const millis =
      typeof parsed.updatedAt.toMillis === 'function'
        ? parsed.updatedAt.toMillis()
        : (parsed.updatedAt._seconds ?? 0) * 1000;
    if (Date.now() - millis < ttlMs) return parsed;
    sessionStorage.removeItem(key);
  } catch { /* ignore */ }
  return null;
}

function ssPut(key: string, value: unknown): void {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* quota ignore */ }
}

// ─── Admin stats cache doc ────────────────────────────────────────────────────
// A lightweight _admin/stats doc caches expensive counts so the Dashboard
// doesn't fire N separate aggregation requests on every load.

export interface AdminStats {
  totalEvents: number;
  publishedEvents: number;
  totalUsers: number;
  totalPayments: number;
  totalRevenue: number;
  updatedAt: Timestamp;
}

const STATS_DOC = doc(db, '_admin', 'stats');
const STATS_TTL_MS = 5 * 60 * 1000; // refresh cache every 5 minutes

export async function fetchAdminStats(): Promise<AdminStats | null> {
  // 1. Check in-tab sessionStorage first (zero Firestore reads)
  const ss = ssGet<AdminStats>(SS_STATS_KEY, STATS_TTL_MS);
  if (ss) return ss as unknown as AdminStats;

  try {
    const snap = await getDoc(STATS_DOC);
    if (!snap.exists()) return null;
    const data = snap.data() as AdminStats;
    const age = Date.now() - data.updatedAt.toMillis();
    if (age < STATS_TTL_MS) {
      ssPut(SS_STATS_KEY, data);
      return data;
    }
    return null; // stale — caller will refresh
  } catch {
    return null;
  }
}

export async function refreshAdminStats(): Promise<AdminStats> {
  const [totalEvents, publishedEvents, totalUsers, totalPayments, totalRevenue] = await Promise.all([
    fetchEventCount(),
    fetchPublishedEventCount(),
    fetchUserCount(),
    fetchPaymentCount(),
    fetchPaymentRevenue(),
  ]);
  const stats: AdminStats = {
    totalEvents,
    publishedEvents,
    totalUsers,
    totalPayments,
    totalRevenue,
    updatedAt: Timestamp.now(),
  };
  ssPut(SS_STATS_KEY, stats);
  try {
    await setDoc(STATS_DOC, stats);
  } catch {
    // May fail if admin rules not set up yet — stats still returned
  }
  return stats;
}

// ─── Analytics cache doc ───────────────────────────────────────────────────
// Caches the expensive event + payment arrays used by the Analytics page
// so repeated visits don't re-fetch hundreds of documents.

export interface AnalyticsCache {
  events: Event[];
  payments: Payment[];
  updatedAt: Timestamp;
}

const ANALYTICS_DOC = doc(db, '_admin', 'analyticsCache');
const ANALYTICS_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function fetchAnalyticsCache(): Promise<AnalyticsCache | null> {
  // 1. Check sessionStorage first (zero Firestore reads)
  const ss = ssGet<AnalyticsCache>(SS_ANALYTICS_KEY, ANALYTICS_TTL_MS);
  if (ss) return ss as unknown as AnalyticsCache;

  try {
    const snap = await getDoc(ANALYTICS_DOC);
    if (!snap.exists()) return null;
    const data = snap.data();
    const age = Date.now() - (data.updatedAt as Timestamp).toMillis();
    if (age < ANALYTICS_TTL_MS) {
      const result: AnalyticsCache = {
        events: (data.events ?? []) as Event[],
        payments: (data.payments ?? []) as Payment[],
        updatedAt: data.updatedAt as Timestamp,
      };
      ssPut(SS_ANALYTICS_KEY, result);
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

export async function refreshAnalyticsCache(): Promise<AnalyticsCache> {
  const [events, payments] = await Promise.all([
    fetchEventsForCharts(200),
    fetchPaymentsForCharts(200),
  ]);
  const cache: AnalyticsCache = { events, payments, updatedAt: Timestamp.now() };
  ssPut(SS_ANALYTICS_KEY, cache);
  try {
    await setDoc(ANALYTICS_DOC, cache);
  } catch {
    // Write may fail if rules aren't set — data still returned from memory
  }
  return cache;
}
