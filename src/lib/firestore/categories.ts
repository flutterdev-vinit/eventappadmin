import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { EventCategory } from '../../types';
import { sanitizeDoc } from './sanitize';
import { logAdminAction } from './audit';
import { clearCategoryMapCache } from './events';

// Mirrors the Flutter schema (event-dashboard/lib/backend/schema/event_category_record.dart).
// Collection name is `event_category` (snake_case). Admin is the only writer —
// mobile reads the results via the category picker + home feed.

const COLLECTION = 'event_category';

export async function listCategories(): Promise<EventCategory[]> {
  // Name is the natural sort key; order client-side if the field is missing.
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), orderBy('name'), limit(200)));
    return snap.docs.map((d) => sanitizeDoc<EventCategory>(d.id, d.data()));
  } catch {
    // Fall back to unordered read if the `name` field is missing on some docs.
    const snap = await getDocs(query(collection(db, COLLECTION), limit(200)));
    return snap.docs
      .map((d) => sanitizeDoc<EventCategory>(d.id, d.data()))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }
}

export async function getCategory(id: string): Promise<EventCategory | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return sanitizeDoc<EventCategory>(snap.id, snap.data());
  } catch {
    return null;
  }
}

export interface CategoryInput {
  name: string;
  image_path?: string;
}

export async function createCategory(input: CategoryInput): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('Category name is required');

  const ref = await addDoc(collection(db, COLLECTION), {
    name,
    image_path: input.image_path ?? '',
  });

  clearCategoryMapCache();
  await logAdminAction({
    type: 'category.create',
    target: { kind: 'category', id: ref.id, name },
    metadata: { image_path: input.image_path ?? null },
  });
  return ref.id;
}

export async function updateCategory(id: string, patch: Partial<CategoryInput>): Promise<void> {
  const data: Record<string, unknown> = {};
  if (typeof patch.name === 'string') data.name = patch.name.trim();
  if (typeof patch.image_path === 'string') data.image_path = patch.image_path;
  if (Object.keys(data).length === 0) return;

  await updateDoc(doc(db, COLLECTION, id), data);
  clearCategoryMapCache();
  await logAdminAction({
    type: 'category.update',
    target: { kind: 'category', id, name: (data.name as string | undefined) ?? null },
    metadata: { changedFields: Object.keys(data) },
  });
}

/** True if ANY Event doc still references this category. Cheap — queries with limit(1). */
export async function countEventsUsingCategory(categoryId: string): Promise<number> {
  // Events store category as either the plain id ("abc123") or the full path
  // ("event_category/abc123"). Check both to mirror sanitiser behaviour.
  const candidates = [categoryId, `${'event_category'}/${categoryId}`];
  let total = 0;
  for (const val of candidates) {
    try {
      const snap = await getDocs(query(collection(db, 'Event'), where('category', '==', val), limit(1)));
      total += snap.docs.length;
    } catch {
      /* ignore — query may fail on legacy docs */
    }
  }
  return total;
}

/**
 * Deleting a category breaks every event that references it. We refuse the
 * delete if any event still points at the doc; the admin must reassign events
 * first. Gallery images are admin-managed — we do NOT cascade-delete them,
 * but the UI should warn.
 */
export async function deleteCategory(
  id: string,
  snapshot?: { name?: string | null },
): Promise<void> {
  const refs = await countEventsUsingCategory(id);
  if (refs > 0) {
    throw new Error(
      `Cannot delete category: ${refs} event${refs === 1 ? '' : 's'} still reference${refs === 1 ? 's' : ''} it.`,
    );
  }

  await deleteDoc(doc(db, COLLECTION, id));
  clearCategoryMapCache();
  await logAdminAction({
    type: 'category.delete',
    target: { kind: 'category', id, name: snapshot?.name ?? null },
  });
}
