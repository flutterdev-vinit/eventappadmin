import {
  collection,
  collectionGroup,
  getDocs,
  getDoc,
  doc,
  documentId,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  getCountFromServer,
  updateDoc,
  deleteDoc,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  Timestamp,
  DocumentReference,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { Event } from '../../types';
import { sanitizeDoc } from './sanitize';
import { PAGE_SIZE, type Page } from './pagination';
import { logAdminAction, type AuditActionType } from './audit';

/**
 * Fetch events with optional constraints.
 * Always apply at least a limit — callers must pass one or accept the default.
 */
export async function fetchEvents(constraints: QueryConstraint[] = []): Promise<Event[]> {
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
 */
export async function fetchEventsForCharts(n = 200): Promise<Event[]> {
  return fetchEvents([orderBy('create_at', 'desc'), limit(n)]);
}

/**
 * Cursor-based paginated event fetch.
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
    const snap = await runQuery(false);
    const items = snap.docs.map((d) => sanitizeDoc<Event>(d.id, d.data()));
    const lastDoc = snap.docs[snap.docs.length - 1] ?? null;
    return { items, cursor: lastDoc, hasMore: snap.docs.length === PAGE_SIZE, serverModeFiltered: false };
  }
}

/**
 * Cross-page name prefix search for Events.
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
 * Fetch events authored by a specific user (for the UserDetail "Organised" tab).
 * `author` in Event docs is a DocumentReference (production format); older
 * docs may use a string path. We try both. No `orderBy` on the server so we
 * don't require a composite index — an organiser typically has < 200 events.
 */
export async function fetchEventsByOrganiser(userId: string): Promise<Event[]> {
  const userRef = doc(db, 'users', userId);
  const PAGE = 200;
  const attempts: Promise<Event[]>[] = [
    getDocs(query(collection(db, 'Event'), where('author', '==', userRef), limit(PAGE)))
      .then((s) => s.docs.map((d) => sanitizeDoc<Event>(d.id, d.data())))
      .catch(() => []),
    getDocs(query(collection(db, 'Event'), where('author', '==', `users/${userId}`), limit(PAGE)))
      .then((s) => s.docs.map((d) => sanitizeDoc<Event>(d.id, d.data())))
      .catch(() => []),
    getDocs(query(collection(db, 'Event'), where('author', '==', userId), limit(PAGE)))
      .then((s) => s.docs.map((d) => sanitizeDoc<Event>(d.id, d.data())))
      .catch(() => []),
  ];
  for (const attempt of attempts) {
    const rows = await attempt;
    if (rows.length > 0) {
      return rows.sort((a, b) => {
        const ta = (a.create_at?.toMillis?.() ?? 0) as number;
        const tb = (b.create_at?.toMillis?.() ?? 0) as number;
        return tb - ta;
      });
    }
  }
  return [];
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
 * Uses `where(documentId(), 'in', chunk)` for 30-at-a-time batching — a single
 * page of 20 payments with unique events → 1 Firestore read instead of 20.
 */
export async function fetchEventNames(eventIds: string[]): Promise<Record<string, string>> {
  if (!eventIds.length) return {};
  const unique = [...new Set(eventIds.filter(Boolean))];
  const map: Record<string, string> = {};

  const CHUNK = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

  try {
    const results = await Promise.all(
      chunks.map((chunk) =>
        getDocs(query(collection(db, 'Event'), where(documentId(), 'in', chunk))).catch(() => null),
      ),
    );
    results.forEach((snap) => {
      snap?.docs.forEach((d) => {
        map[d.id] = ((d.data().name as string | undefined) ?? 'Untitled event');
      });
    });
  } catch { /* fall through */ }

  unique.forEach((id) => {
    if (!map[id]) map[id] = 'Unknown event';
  });
  return map;
}

export async function updateEvent(id: string, data: Partial<Event>): Promise<void> {
  await updateDoc(doc(db, 'Event', id), { ...data, update_at: Timestamp.now() });

  const type: AuditActionType = 'is_published' in data
    ? (data.is_published ? 'event.publish' : 'event.unpublish')
    : 'event.update';
  await logAdminAction({
    type,
    target: { kind: 'event', id, name: (data.name as string | undefined) ?? null },
    metadata: { changedFields: Object.keys(data) },
  });
}

export async function deleteEvent(id: string, snapshot?: { name?: string | null }): Promise<void> {
  await deleteDoc(doc(db, 'Event', id));
  await logAdminAction({
    type: 'event.delete',
    target: { kind: 'event', id, name: snapshot?.name ?? null },
  });
}

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
 */
export async function fetchAttendedEventsByUser(userId: string): Promise<AttendedEventRow[]> {
  const toRows = (snap: { docs: QueryDocumentSnapshot[] }) =>
    snap.docs.map((d) => ({
      eventId: d.ref.parent.parent?.id ?? '',
      isCancelled: (d.data().isCancelled ?? false) as boolean,
    }));

  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDocs(query(collectionGroup(db, 'attendees'), where('user_id', '==', userRef)));
    if (snap.docs.length > 0) return toRows(snap);
  } catch { /* try next */ }

  try {
    const snap = await getDocs(query(collectionGroup(db, 'attendees'), where('user_id', '==', `users/${userId}`)));
    if (snap.docs.length > 0) return toRows(snap);
  } catch { /* try next */ }

  try {
    const snap = await getDocs(query(collectionGroup(db, 'attendees'), where('user_id', '==', userId)));
    return toRows(snap);
  } catch {
    return [];
  }
}

export interface AttendeeWithUser {
  attendeeDocId: string;
  userId: string;
  isCancelled: boolean;
  displayName?: string;
  email?: string;
}

/**
 * Fetch attendees for an event with basic user info.
 */
export async function fetchAttendeesForEvent(eventId: string, pageLimit = 50): Promise<AttendeeWithUser[]> {
  try {
    const q = query(collection(db, 'Event', eventId, 'attendees'), limit(pageLimit));
    const snap = await getDocs(q);
    if (snap.empty) return [];

    const rows = snap.docs.map((d) => {
      const raw = d.data();
      const userIdRaw = raw.user_id;
      let uid = '';
      if (userIdRaw && typeof userIdRaw === 'object' && 'path' in userIdRaw) {
        uid = (userIdRaw as DocumentReference).id;
      } else if (typeof userIdRaw === 'string') {
        uid = userIdRaw.split('/').pop() ?? userIdRaw;
      }
      return { attendeeDocId: d.id, userId: uid, isCancelled: (raw.isCancelled ?? false) as boolean };
    });

    // Batched user lookup (up to 30 per query) instead of N individual getDoc() calls.
    const uniqueUids = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
    const userMap: Record<string, { displayName: string; email: string }> = {};
    if (uniqueUids.length) {
      const CHUNK = 30;
      const chunks: string[][] = [];
      for (let i = 0; i < uniqueUids.length; i += CHUNK) chunks.push(uniqueUids.slice(i, i + CHUNK));
      const snaps = await Promise.all(
        chunks.map((chunk) =>
          getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk))).catch(() => null),
        ),
      );
      snaps.forEach((s) => {
        s?.docs.forEach((d) => {
          const u = d.data();
          userMap[d.id] = {
            displayName: (u.first_name ?? u.displayName ?? '') as string,
            email: (u.email ?? '') as string,
          };
        });
      });
    }

    return rows.map((row) => {
      const u = userMap[row.userId];
      return u ? { ...row, displayName: u.displayName, email: u.email } : row;
    });
  } catch {
    return [];
  }
}

// ─── Event categories ─────────────────────────────────────────────────────────

let _categoryMapCache: Record<string, string> | null = null;

export async function fetchCategoryMap(): Promise<Record<string, string>> {
  if (_categoryMapCache) return _categoryMapCache;
  try {
    const snap = await getDocs(query(collection(db, 'event_category'), limit(200)));
    const map: Record<string, string> = {};
    snap.docs.forEach((d) => {
      const data = d.data();
      const name = (data.name ?? data.title ?? data.label ?? d.id) as string;
      map[`event_category/${d.id}`] = name;
      map[d.id] = name;
    });
    _categoryMapCache = map;
    return map;
  } catch {
    return {};
  }
}

/** Clear the in-memory category map cache. Called after category mutations. */
export function clearCategoryMapCache(): void {
  _categoryMapCache = null;
}
