import {
  collection,
  collectionGroup,
  getDocs,
  documentId,
  query,
  where,
  limit,
  getCountFromServer,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { fetchEventsPage, fetchAttendeeCountForEvent } from './events';

/** Count of chat messages for a specific event (sub-collection). */
export async function fetchMessageCountForEvent(eventId: string): Promise<number> {
  const col = collection(db, 'Event', eventId, 'chat_messages');
  try {
    const snap = await getCountFromServer(col);
    return snap.data().count;
  } catch {
    try {
      const snap = await getDocs(query(col, limit(500)));
      return snap.size;
    } catch {
      return 0;
    }
  }
}

/** Total chat messages across all events using collectionGroup. */
export async function fetchTotalMessageCount(): Promise<number> {
  try {
    const snap = await getCountFromServer(collectionGroup(db, 'chat_messages'));
    return snap.data().count;
  } catch {
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
 */
export async function fetchEventsActivity(
  statusFilter: 'all' | 'published' | 'draft',
  cursor: QueryDocumentSnapshot | null,
): Promise<{ rows: EventActivity[]; cursor: QueryDocumentSnapshot | null; hasMore: boolean }> {
  const result = await fetchEventsPage(statusFilter, cursor);
  const events = result.items;

  if (!events.length) return { rows: [], cursor: null, hasMore: false };

  const [msgCounts, attCounts] = await Promise.all([
    Promise.all(events.map((ev) => fetchMessageCountForEvent(ev.id))),
    Promise.all(events.map((ev) => fetchAttendeeCountForEvent(ev.id).catch(() => 0))),
  ]);

  const authorUids = [...new Set(
    events.map((ev) => String(ev.author ?? '').split('/').pop() ?? '').filter(Boolean)
  )];

  // Batch-fetch organisers via `where(documentId() in chunk)` — up to 30 per
  // query. A typical page of 20 events has < 20 unique organisers → 1 read.
  const organiserMap: Record<string, { name: string | null; email: string | null }> = {};
  if (authorUids.length) {
    const CHUNK = 30;
    const chunks: string[][] = [];
    for (let i = 0; i < authorUids.length; i += CHUNK) chunks.push(authorUids.slice(i, i + CHUNK));

    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk))).catch(() => null),
      ),
    );
    snaps.forEach((snap) => {
      snap?.docs.forEach((d) => {
        const u = d.data();
        organiserMap[d.id] = {
          name: (u.first_name ?? u.displayName ?? u.email ?? null) as string | null,
          email: (u.email ?? null) as string | null,
        };
      });
    });
  }
  authorUids.forEach((uid) => {
    if (!organiserMap[uid]) organiserMap[uid] = { name: 'Unknown organiser', email: null };
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

  rows.sort((a, b) => b.messageCount - a.messageCount);

  return { rows, cursor: result.cursor, hasMore: result.hasMore };
}
