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
