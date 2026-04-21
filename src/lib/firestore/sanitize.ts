import {
  DocumentReference,
  GeoPoint,
  Timestamp,
} from 'firebase/firestore';

// Converts DocumentReference / GeoPoint objects to safe primitives so no raw
// Firestore object ever reaches a React component.

export function sanitize(value: unknown): unknown {
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

export function sanitizeDoc<T>(id: string, data: Record<string, unknown>): T {
  return { id, ...(sanitize(data) as object) } as T;
}
