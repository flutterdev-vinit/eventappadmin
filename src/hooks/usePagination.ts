import { useState, useCallback, useRef } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { Page } from '../lib/firestore';

/**
 * Generic cursor-based Firestore pagination hook.
 *
 * Usage:
 *   const { items, loading, page, hasMore, goNext, goPrev, reset } =
 *     usePagination((cursor) => fetchEventsPage('all', cursor));
 *
 * - Each "page" fetches exactly PAGE_SIZE docs (20).
 * - Cursors are stacked so going backward doesn't re-read Firestore.
 * - Calling `reset()` clears everything and re-fetches page 1.
 */
export function usePagination<T>(
  fetcher: (cursor: QueryDocumentSnapshot | null) => Promise<Page<T>>,
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);           // 1-indexed display page
  const [hasMore, setHasMore] = useState(false);

  // Stack of cursors: index 0 = cursor for page 2, index 1 = cursor for page 3…
  // cursor for page 1 is always null.
  const cursors = useRef<(QueryDocumentSnapshot | null)[]>([null]);

  const loadPage = useCallback(async (pageIndex: number) => {
    setLoading(true);
    try {
      const cursor = cursors.current[pageIndex - 1] ?? null;
      const result = await fetcher(cursor);
      setItems(result.items);
      setHasMore(result.hasMore);
      setPage(pageIndex);
      // Store cursor for the NEXT page if we got a full page back
      if (result.cursor && result.hasMore) {
        cursors.current[pageIndex] = result.cursor;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  const reset = useCallback(async () => {
    cursors.current = [null];
    await loadPage(1);
  }, [loadPage]);

  const goNext = useCallback(() => {
    loadPage(page + 1);
  }, [page, loadPage]);

  const goPrev = useCallback(() => {
    if (page > 1) loadPage(page - 1);
  }, [page, loadPage]);

  return { items, loading, page, hasMore, goNext, goPrev, reset, loadPage };
}
