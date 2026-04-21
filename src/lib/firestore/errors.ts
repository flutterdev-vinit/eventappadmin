import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';

// Client-side error log — append-only forensic record of uncaught errors
// originating in the admin web app. Mirrors the audit-log design:
//   - admin-only read/write (enforced in firestore.rules)
//   - Firestore TTL policy on `expiresAt` auto-deletes after 90 days
//   - writes are fire-and-forget so a failing log write never crashes the app
//
// Only admin users can hit this path (the app is gated by AuthGate), so the
// rule `allow create: if isAdmin()` is safe even though any signed-in
// JavaScript on the page could theoretically attempt the write.

const RETENTION_DAYS = 90;
const COLLECTION = '_admin_errors';
const MAX_STACK_CHARS = 4000;  // keep doc under Firestore's 1 MB limit
const MAX_MESSAGE_CHARS = 1000;

export interface ClientErrorContext {
  /** Where the error came from — 'boundary' | 'window' | 'promise' | custom. */
  source?: string;
  /** Optional extra metadata — route name, user action, etc. */
  extras?: Record<string, unknown>;
}

/** Best-effort Firestore write. Never throws. */
export async function logClientError(err: unknown, ctx: ClientErrorContext = {}): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const now = Date.now();
    const expiresAt = Timestamp.fromMillis(now + RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const message = extractMessage(err).slice(0, MAX_MESSAGE_CHARS);
    const stack = extractStack(err).slice(0, MAX_STACK_CHARS);

    await addDoc(collection(db, COLLECTION), {
      message,
      stack,
      source: ctx.source ?? 'unknown',
      extras: ctx.extras ?? {},
      url: typeof window !== 'undefined' ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      actor: {
        uid: user.uid,
        email: user.email ?? null,
        name: user.displayName ?? null,
      },
      createdAt: Timestamp.fromMillis(now),
      expiresAt,
    });
  } catch (writeErr) {
    // Intentionally `warn`, never `error`, to avoid triggering the window
    // 'error' listener recursively.
    console.warn('[errors] failed to log client error', writeErr);
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || 'Error';
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function extractStack(err: unknown): string {
  if (err instanceof Error && typeof err.stack === 'string') return err.stack;
  return '';
}
