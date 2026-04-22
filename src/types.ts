import type { Timestamp } from 'firebase/firestore';

export interface Event {
  id: string;
  name: string;
  description?: string;
  author?: string; // DocumentReference path (e.g. "users/abc123"), sanitised to string
  category?: string;
  startDate?: Timestamp;
  endDate?: Timestamp;
  publish_date?: Timestamp;
  create_at?: Timestamp;
  update_at?: Timestamp;
  is_published?: boolean;
  is_private?: boolean;
  is_paid?: boolean;
  price?: number;
  mode?: 'in-person' | 'online' | 'hybrid';
  invitees?: string[];
  location?: {
    geohash?: string;
    geopoint?: { latitude: number; longitude: number };
    address?: string;
  };
  attendeeCount?: number;
}

export interface Attendee {
  id: string;
  user_id: string;
  isCancelled?: boolean;
  event_id?: string;
}

export interface ChatMessage {
  id: string;
  event_ref?: string;
  sender_ref?: string;
  receiver_ref?: string;
  participant_refs?: string[];
  timestamp?: Timestamp;
  message?: string;
}

export interface Payment {
  id: string;
  eventId?: string;
  status?: 'pending' | 'completed' | 'failed' | 'refunded';
  amount?: number;
  userId?: string;
  date?: Timestamp;
  currency?: string;
}

export interface AppUser {
  id: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  createdAt?: Timestamp;
  status?: 'active' | 'suspended';
  role?: string;
}

// ─── Event categories ─────────────────────────────────────────────────────
// Field names preserved from Flutter schema
// (event-dashboard/lib/backend/schema/event_category_record.dart) so the
// mobile app + Flutter dashboard keep reading the same docs.
export interface EventCategory {
  id: string;
  name?: string;
  image_path?: string;
}

// ─── Gallery images (per category) ────────────────────────────────────────
// Mirrors event-dashboard/lib/backend/schema/gallery_record.dart.
// `category` is stored as a DocumentReference in Firestore; sanitised to a
// string path (e.g. "event_category/abc123") before it reaches React.
export interface GalleryItem {
  id: string;
  image?: string;
  category?: string;
}

// ─── Abuse reports ────────────────────────────────────────────────────────
// Base shape from event-app/lib/backend/schema/reports_event_record.dart.
// The `status` / `resolved_at` / `resolved_by` fields are new — written only
// by the admin UI on resolve/dismiss. Legacy docs with no `status` are
// treated as "open" at read time.
export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface Report {
  id: string;
  event_id?: string;
  user_id?: string;
  message?: string;
  status?: ReportStatus;
  createdAt?: Timestamp;
  resolved_at?: Timestamp;
  resolved_by?: {
    uid: string;
    email?: string | null;
  };
}

// ─── Payouts ──────────────────────────────────────────────────────────────
// `orgnizer_id` is NOT a typo on our side — it matches the Firestore field
// name the Flutter apps already write/read. Keep the spelling so the mobile
// organiser's transaction-history page keeps surfacing admin-created payouts.
export type PayoutStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export interface Payout {
  id: string;
  event_id?: string;
  amount?: number;
  status?: PayoutStatus | string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  orgnizer_id?: string;
  payment_method?: string;
  transaction_id?: string;
  bankAccount?: string;
}

// ─── Bank accounts (organiser payout details) ─────────────────────────────
// Written by the mobile app via Stripe + organizerBankAdd cloud function —
// see event-app/lib/custom_code/actions/create_bank_account_token.dart.
// The admin UI only reads these (for UserDetail + the payout flow).
export interface BankAccount {
  id: string;
  bank_account_id?: string;
  last4?: string;
  user_id?: string;
}
