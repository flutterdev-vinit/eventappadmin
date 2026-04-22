import {
  collection,
  doc,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { BankAccount } from '../../types';
import { sanitizeDoc } from './sanitize';

// ─── Bank accounts (read-only on admin side) ─────────────────────────────
//
// IMPORTANT: Admin MUST NOT create or update bank_account records. The write
// path is owned by:
//   event-app/lib/custom_code/actions/create_bank_account_token.dart
// which talks to Stripe, gets a tokenised bank_account_id back, then writes
// the Firestore doc. Any admin-side write would bypass Stripe tokenisation
// and produce an unusable record.
//
// We only READ — both for the payout flow (to resolve an organiser's bank)
// and for the UserDetail page.

const COLLECTION = 'bank_account';

/**
 * Look up the first bank_account for a user, matching the Flutter
 * `queryBankAccountRecord(..., singleRecord: true)` behaviour.
 *
 * Accepts either a plain UID ("abc123") or a sanitised path ("users/abc123").
 * Tries both storage shapes, since older docs may use either.
 */
export async function getBankAccountByUserId(userIdOrPath: string): Promise<BankAccount | null> {
  if (!userIdOrPath) return null;
  const uid = userIdOrPath.includes('/') ? (userIdOrPath.split('/').pop() ?? '') : userIdOrPath;
  if (!uid) return null;

  const userRef = doc(db, 'users', uid);

  // DocumentReference is the production shape; the two string variants
  // are for legacy docs.
  const candidates: unknown[] = [userRef, `users/${uid}`, uid];

  for (const value of candidates) {
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTION), where('user_id', '==', value), limit(1)),
      );
      if (!snap.empty) {
        const d = snap.docs[0];
        return sanitizeDoc<BankAccount>(d.id, d.data());
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}
