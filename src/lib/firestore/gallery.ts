import {
  collection,
  doc,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  addDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { GalleryItem } from '../../types';
import { sanitizeDoc } from './sanitize';
import { logAdminAction } from './audit';
import { uploadImage, deleteImageByUrl } from './storage';

// Collection name mirrors the Flutter schema
// (event-dashboard/lib/backend/schema/gallery_record.dart). Mobile app reads
// via queryGalleryRecord() in event-app/lib/gallery/gallery_widget.dart;
// admin is the sole writer.
const COLLECTION = 'gallery';

/**
 * In Firestore, `category` is stored as a DocumentReference to event_category.
 * We query with the reference shape the mobile/Flutter apps write, but also
 * fall back to the string path "event_category/<id>" for legacy docs.
 */
async function runCategoryQuery(categoryId: string) {
  const ref = doc(db, 'event_category', categoryId);
  const pathStr = `event_category/${categoryId}`;

  // Try DocumentReference equality first — this is the production shape.
  try {
    const snap = await getDocs(
      query(collection(db, COLLECTION), where('category', '==', ref), orderBy('__name__', 'desc'), limit(200)),
    );
    if (!snap.empty) return snap;
  } catch {
    /* try fallback */
  }

  // Fallback: some legacy docs may store the string path. Don't orderBy in
  // case the index doesn't exist — client-side sort handles it.
  try {
    return await getDocs(query(collection(db, COLLECTION), where('category', '==', pathStr), limit(200)));
  } catch {
    return { docs: [] as never[] };
  }
}

export async function listGalleryForCategory(categoryId: string): Promise<GalleryItem[]> {
  if (!categoryId) return [];
  const snap = await runCategoryQuery(categoryId);
  return (snap.docs as { id: string; data: () => Record<string, unknown> }[]).map(
    (d) => sanitizeDoc<GalleryItem>(d.id, d.data()),
  );
}

export interface AddGalleryImageInput {
  categoryId: string;
  /** Either an already-uploaded URL OR a File to upload now. */
  image?: string;
  file?: File;
}

/**
 * Create a gallery record. Accepts either a pre-uploaded `image` URL, or a
 * `file` that we upload to Storage first. Returns the new Firestore doc id.
 */
export async function addGalleryImage(input: AddGalleryImageInput): Promise<string> {
  let imageUrl = input.image ?? '';
  if (input.file) {
    const uploaded = await uploadImage(input.file, 'gallery');
    imageUrl = uploaded.url;
  }
  if (!imageUrl) throw new Error('An image URL or file is required');
  if (!input.categoryId) throw new Error('A categoryId is required');

  const categoryRef = doc(db, 'event_category', input.categoryId);
  const ref = await addDoc(collection(db, COLLECTION), {
    image: imageUrl,
    category: categoryRef,
  });

  await logAdminAction({
    type: 'gallery.create',
    target: { kind: 'gallery', id: ref.id, name: null },
    metadata: { categoryId: input.categoryId, image: imageUrl },
  });
  return ref.id;
}

/**
 * Delete a gallery doc and best-effort remove the Storage object behind it.
 * The Storage cleanup is intentionally tolerant of non-Storage URLs (legacy
 * docs may reference externally hosted images).
 */
export async function deleteGalleryImage(id: string, imageUrl?: string | null): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
  await deleteImageByUrl(imageUrl ?? null);
  await logAdminAction({
    type: 'gallery.delete',
    target: { kind: 'gallery', id, name: null },
    metadata: { image: imageUrl ?? null },
  });
}
