import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';

// Admin audit log — records every destructive admin action so we have a
// forensic trail if something goes wrong on production data.
//
// Docs live in /_admin_audit/{auto-id} with the shape:
//   {
//     type        : e.g. 'event.delete' | 'event.publish' | 'event.unpublish'
//                       | 'event.update' | 'user.update' | 'user.delete'
//     actor       : { uid, email, name? }
//     target      : { kind, id, name? }      // entity touched
//     metadata    : Record<string, unknown>  // free-form before/after snapshot
//     createdAt   : server timestamp
//     expiresAt   : createdAt + 90 days
//   }
//
// `expiresAt` is the field watched by the Firestore TTL policy (configured
// once via the Firebase console or REST API — see README "Ops runbook"). TTL
// deletes bypass security rules so `allow delete: if false` is fine.

const RETENTION_DAYS = 90;
const COLLECTION = '_admin_audit';

export type AuditActionType =
  | 'event.delete'
  | 'event.publish'
  | 'event.unpublish'
  | 'event.update'
  | 'user.update'
  | 'user.delete'
  | 'payment.update'
  | 'payment.delete';

export interface AuditEntry {
  type: AuditActionType;
  target: { kind: 'event' | 'user' | 'payment'; id: string; name?: string | null };
  metadata?: Record<string, unknown>;
}

/** Fire-and-forget audit write. Failures are logged but never block the UI. */
export async function logAdminAction(entry: AuditEntry): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const now = Date.now();
    const expiresAt = Timestamp.fromMillis(now + RETENTION_DAYS * 24 * 60 * 60 * 1000);

    await addDoc(collection(db, COLLECTION), {
      type: entry.type,
      actor: {
        uid: user.uid,
        email: user.email ?? null,
        name: user.displayName ?? null,
      },
      target: entry.target,
      metadata: entry.metadata ?? {},
      createdAt: Timestamp.fromMillis(now),
      expiresAt,
    });
  } catch (err) {
    console.warn('[audit] failed to write audit log', err);
  }
}
