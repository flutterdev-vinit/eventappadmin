import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from '../../firebase';

// ─── Firebase Storage helpers ────────────────────────────────────────────
// Small wrapper so pages don't have to reach into firebase/storage directly.
// Both helpers are admin-only in practice — write rules are enforced in
// admin/storage.rules (`allow write: if isAdmin()`).

export interface UploadedImage {
  url: string;
  fullPath: string;
}

/**
 * Upload a single image file under `<pathPrefix>/<timestamp>-<safeName>`
 * and return its public download URL.
 *
 * @param pathPrefix  e.g. "categories" or "gallery". No leading or trailing slash.
 */
export async function uploadImage(file: File, pathPrefix: string): Promise<UploadedImage> {
  const cleanPrefix = pathPrefix.replace(/^\/+|\/+$/g, '');
  const safeName = file.name.replace(/[^\w.-]+/g, '_');
  const fullPath = `${cleanPrefix}/${Date.now()}-${safeName}`;

  const ref = storageRef(storage, fullPath);
  await uploadBytes(ref, file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(ref);
  return { url, fullPath };
}

/**
 * Delete a Storage object by its public download URL (the shape returned by
 * `uploadImage`). Silently no-ops for:
 *   - empty/undefined URLs
 *   - URLs that don't belong to Firebase Storage (e.g. legacy http images
 *     stored in Firestore but hosted elsewhere)
 *   - objects that no longer exist
 *
 * Callers can treat this as fire-and-forget after the Firestore doc is gone.
 */
export async function deleteImageByUrl(url: string | undefined | null): Promise<void> {
  if (!url) return;

  // Only Firebase Storage download URLs are decodable to a bucket path.
  // Format: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encodedPath>?alt=media&token=...
  const match = url.match(/\/o\/([^?]+)/);
  if (!match) return;

  try {
    const fullPath = decodeURIComponent(match[1]);
    await deleteObject(storageRef(storage, fullPath));
  } catch (err) {
    // Swallow object-not-found and auth errors — deletion is best-effort.
    console.warn('[storage] deleteImageByUrl failed', err);
  }
}
