import type { QueryDocumentSnapshot } from 'firebase/firestore';

export const PAGE_SIZE = 20;

export interface Page<T> {
  items: T[];
  /** Last Firestore snapshot on this page — pass as cursor to fetch next page. */
  cursor: QueryDocumentSnapshot | null;
  /** Whether another page exists (items.length === PAGE_SIZE). */
  hasMore: boolean;
}
