import {
  collection,
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
  type QueryConstraint,
  type QueryDocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { AppUser } from '../../types';
import { sanitize } from './sanitize';
import { logAdminAction } from './audit';
import { PAGE_SIZE, type Page } from './pagination';

// Actual Firestore field names differ from the admin's AppUser interface.
// The mobile app stores:  first_name (not displayName), created_time (not createdAt).
// We map them here so the rest of the UI stays stable.

function sanitizeUser(id: string, data: Record<string, unknown>): AppUser {
  const raw = sanitize(data) as Record<string, unknown>;
  return {
    id,
    displayName: (raw.first_name ?? raw.displayName ?? raw.name) as string | undefined,
    email: raw.email as string | undefined,
    photoURL: raw.photoURL as string | undefined,
    createdAt: (raw.created_time ?? raw.createdAt) as Timestamp | undefined,
    status: (raw.status ?? 'active') as 'active' | 'suspended',
    role: raw.role as string | undefined,
  };
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
 * Uses Firestore `where(documentId(), 'in', chunk)` which returns up to 30 docs
 * per query → ~30× fewer round trips than N individual getDoc() calls.
 * Returns a map of uid → best available name (first_name > displayName > email > 'Unknown user').
 */
export async function fetchUserNames(userIds: string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const unique = [...new Set(userIds.filter(Boolean))];
  const map: Record<string, string> = {};

  // Firestore `in` filter is capped at 30 values per query.
  const CHUNK = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

  try {
    const results = await Promise.all(
      chunks.map((chunk) =>
        getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk))).catch(() => null),
      ),
    );
    results.forEach((snap) => {
      snap?.docs.forEach((d) => {
        const x = d.data();
        map[d.id] = (x.first_name ?? x.displayName ?? x.email ?? 'Unknown user') as string;
      });
    });
  } catch {
    /* fall through — map will be filled in with fallbacks below */
  }

  // Any UID not resolved gets the fallback label.
  unique.forEach((id) => {
    if (!map[id]) map[id] = 'Unknown user';
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
    if (result.items.length === 0 && !cursor) return runQuery(false);
    return result;
  } catch {
    return runQuery(false);
  }
}

/**
 * Translate a camelCase `Partial<AppUser>` patch into the snake_case field
 * names actually stored in Firestore. The read path already maps the other
 * way (see `sanitizeUser`); without this write-side mapper, callers that
 * pass `displayName` / `createdAt` would silently create stray camelCase
 * fields that the Flutter mobile apps never read.
 *
 * Fields whose keys are identical on both sides (`status`, `role`, `email`,
 * `photoURL`) pass through unchanged. `id` is never written. Unknown or
 * `undefined` values are dropped so we never write `undefined` to Firestore.
 */
export function toFirestoreUserPatch(
  data: Partial<AppUser>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (data.displayName !== undefined) out.first_name = data.displayName;
  if (data.createdAt !== undefined) out.created_time = data.createdAt;
  if (data.status !== undefined) out.status = data.status;
  if (data.role !== undefined) out.role = data.role;
  if (data.email !== undefined) out.email = data.email;
  if (data.photoURL !== undefined) out.photoURL = data.photoURL;
  return out;
}

export async function updateUser(id: string, data: Partial<AppUser>): Promise<void> {
  const patch = toFirestoreUserPatch(data);
  if (Object.keys(patch).length > 0) {
    await updateDoc(doc(db, 'users', id), patch);
  }
  await logAdminAction({
    type: 'user.update',
    target: { kind: 'user', id, name: data.displayName ?? null },
    metadata: { changedFields: Object.keys(patch) },
  });
}
