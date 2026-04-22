import {
  collection,
  doc,
  getDocs,
  query,
  where,
  limit,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import type { Report, ReportStatus } from '../../types';
import { sanitize } from './sanitize';
import { logAdminAction } from './audit';

// Mobile users file reports via
// event-app/lib/components/report_event_bottomsheet_widget.dart which writes
// ONLY {event_id, user_id, message}. Legacy docs therefore have no
// `status` / `createdAt` — we treat absence of `status` as "open" in the UI.
// Admin moderation writes: status, resolved_at, resolved_by.

const COLLECTION = 'reports_event';

const MAX_SCAN = 500;   // reports volume is admin-scale; this is plenty
const LIST_LIMIT = 200; // one-shot inbox load

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract the trailing id from either a plain id or a sanitised ref path
 * ("Event/abc" or "users/xyz"). Matches the behaviour of other helpers.
 */
function extractId(pathOrId: string | undefined): string {
  if (!pathOrId) return '';
  return pathOrId.includes('/') ? (pathOrId.split('/').pop() ?? '') : pathOrId;
}

function sanitizeReport(id: string, data: Record<string, unknown>): Report {
  const raw = sanitize(data) as Record<string, unknown>;
  return {
    id,
    event_id: extractId(raw.event_id as string | undefined),
    user_id: extractId(raw.user_id as string | undefined),
    message: raw.message as string | undefined,
    status: (raw.status ?? 'open') as ReportStatus,
    createdAt: raw.createdAt as Timestamp | undefined,
    resolved_at: raw.resolved_at as Timestamp | undefined,
    resolved_by: raw.resolved_by as Report['resolved_by'],
  };
}

function sortRecent(a: Report, b: Report): number {
  const ta = a.createdAt?.toMillis?.() ?? 0;
  const tb = b.createdAt?.toMillis?.() ?? 0;
  if (ta !== tb) return tb - ta;
  // Fall back to doc id — Firestore auto-ids are time-ordered lexically.
  return b.id.localeCompare(a.id);
}

// ─── Queries ──────────────────────────────────────────────────────────────

export interface ListReportsOptions {
  status?: ReportStatus | 'all';
  eventId?: string;
}

/**
 * List reports matching the given filter. Results are client-side sorted by
 * `createdAt` desc (falling back to doc id). Capped at 200 items — the admin
 * inbox is low-volume and a single page is fine.
 */
export async function listReports(opts: ListReportsOptions = {}): Promise<Report[]> {
  const { status = 'all', eventId } = opts;

  // Build the narrowest server query we can. Avoid `status == 'open'` because
  // legacy docs written by the mobile app don't have that field at all.
  const serverFilters = [] as Parameters<typeof where>[];
  if (eventId) {
    // `event_id` in Firestore is a DocumentReference; try both shapes.
    serverFilters.push(['event_id', '==', doc(db, 'Event', eventId)]);
  }
  if (status === 'resolved' || status === 'dismissed') {
    serverFilters.push(['status', '==', status]);
  }

  const runQuery = async (filters: Parameters<typeof where>[]) => {
    const clauses = filters.map((f) => where(...f));
    return getDocs(query(collection(db, COLLECTION), ...clauses, limit(LIST_LIMIT)));
  };

  let snap;
  try {
    snap = await runQuery(serverFilters);
    if (snap.empty && eventId) {
      // Retry with the string-path shape for legacy event_id storage.
      const alt = serverFilters.map((f) =>
        f[0] === 'event_id' ? (['event_id', '==', `Event/${eventId}`] as Parameters<typeof where>) : f,
      );
      snap = await runQuery(alt);
    }
  } catch {
    snap = await runQuery([]);
  }

  let items = snap.docs.map((d) => sanitizeReport(d.id, d.data()));

  // Client-side filter for the "open" bucket — captures both explicit
  // `status: 'open'` and legacy docs that have no status at all.
  if (status === 'open') {
    items = items.filter((r) => r.status === 'open' || !r.status);
  }

  return items.sort(sortRecent);
}

export async function getReportsForEvent(eventId: string): Promise<Report[]> {
  return listReports({ eventId });
}

export interface ReportCounts {
  open: number;
  resolved: number;
  dismissed: number;
  total: number;
}

/**
 * Aggregate report counts by status. Scans up to MAX_SCAN docs — we don't use
 * getCountFromServer because the "open" bucket must include status-less legacy
 * docs, which a server-side count can't express in one query.
 */
export async function countReportsByStatus(): Promise<ReportCounts> {
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), limit(MAX_SCAN)));
    const counts: ReportCounts = { open: 0, resolved: 0, dismissed: 0, total: 0 };
    snap.docs.forEach((d) => {
      const s = (d.data().status as string | undefined) ?? 'open';
      counts.total += 1;
      if (s === 'resolved') counts.resolved += 1;
      else if (s === 'dismissed') counts.dismissed += 1;
      else counts.open += 1;
    });
    return counts;
  } catch {
    return { open: 0, resolved: 0, dismissed: 0, total: 0 };
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────

async function setStatus(id: string, status: Exclude<ReportStatus, 'open'>): Promise<void> {
  const user = auth.currentUser;
  await updateDoc(doc(db, COLLECTION, id), {
    status,
    resolved_at: Timestamp.now(),
    resolved_by: user
      ? { uid: user.uid, email: user.email ?? null }
      : { uid: 'unknown' },
  });
  await logAdminAction({
    type: status === 'resolved' ? 'report.resolve' : 'report.dismiss',
    target: { kind: 'report', id, name: null },
  });
}

export async function resolveReport(id: string): Promise<void> {
  await setStatus(id, 'resolved');
}

export async function dismissReport(id: string): Promise<void> {
  await setStatus(id, 'dismissed');
}

// Exposed for tests — pure helpers.
export const __INTERNAL__ = { sortRecent, sanitizeReport };
