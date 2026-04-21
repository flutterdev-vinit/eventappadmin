import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import {
  fetchEventsPage, updateEvent, deleteEvent,
  fetchAttendeeCountForEvent, fetchCompletedPaymentCountForEvent,
  searchEvents, fetchCategoryMap,
} from '../lib/firestore';
import type { Event } from '../types';
import { useDebounce } from './useDebounce';

export type StatusFilter = 'all' | 'published' | 'draft';

export interface UseEventsPageReturn {
  // Browse mode
  items: Event[];
  loading: boolean;
  page: number;
  hasMore: boolean;
  loadPage: (pageNum: number) => Promise<void>;

  // Filters
  status: StatusFilter;
  setStatus: (s: StatusFilter) => void;
  mode: string;
  setMode: (m: string) => void;
  search: string;
  setSearch: (s: string) => void;
  minPrice: string;
  setMinPrice: (p: string) => void;
  maxPrice: string;
  setMaxPrice: (p: string) => void;

  // Search mode
  searchMode: boolean;
  searchResults: Event[];
  searchLoading: boolean;
  triggerSearch: () => Promise<void>;
  exitSearchMode: () => void;

  // Quick-view modal
  selected: Event | null;
  openSelected: (ev: Event) => void;
  closeSelected: () => void;
  selectedAttendees: number | null;
  selectedPaidCount: number | null;

  // Category map
  catMap: Record<string, string>;

  // Computed
  displayItems: Event[];

  // Mutations
  togglePublish: (ev: Event) => Promise<void>;
  handleDelete: (ev: Event) => Promise<void>;
}

export function useEventsPage(): UseEventsPageReturn {
  // ── Browse mode state ────────────────────────────────────────────────────
  const [items, setItems] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageNum, setPageNum] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // ── Server-side filters (each change resets pagination) ──────────────────
  const [status, setStatus] = useState<StatusFilter>('all');
  const [mode, setMode] = useState('');
  const debouncedMode = useDebounce(mode, 400);

  // ── Client-side filters (applied to current page — zero extra reads) ─────
  const [search, setSearch] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // ── Search mode (Enter / Search button → cross-page Firestore prefix query) ─
  const [searchMode, setSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState<Event[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Event detail state ───────────────────────────────────────────────────
  const [selected, setSelected] = useState<Event | null>(null);
  const [selectedAttendees, setSelectedAttendees] = useState<number | null>(null);
  const [selectedPaidCount, setSelectedPaidCount] = useState<number | null>(null);
  const [catMap, setCatMap] = useState<Record<string, string>>({});

  // Cursor stack: index i holds the cursor needed to fetch page i+1
  const cursors = useRef<(QueryDocumentSnapshot | null)[]>([null]);

  // Refs to current filters so loadPage stays stable (no re-creation = no duplicate effect runs).
  const statusRef = useRef(status);
  const modeRef = useRef(debouncedMode);
  const searchModeRef = useRef(searchMode);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { modeRef.current = debouncedMode; }, [debouncedMode]);
  useEffect(() => { searchModeRef.current = searchMode; }, [searchMode]);

  // Stable loadPage — reads filters via refs so its identity never changes,
  // preventing duplicate Firestore reads from effect re-runs.
  const loadPage = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const cursor = cursors.current[page - 1] ?? null;
      const result = await fetchEventsPage(statusRef.current, cursor, modeRef.current);
      setItems(result.items);
      setHasMore(result.hasMore);
      setPageNum(page);
      if (result.cursor && result.hasMore) {
        cursors.current[page] = result.cursor;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load category map once
  useEffect(() => {
    fetchCategoryMap().then(setCatMap);
  }, []);

  // Reload page 1 whenever status or debouncedMode changes.
  // Single effect avoids the double-load bug where two effects both call loadPage on mount.
  // `loadPage` is a stable useCallback(deps: []) so this effect only fires when
  // the filter values actually change.
  useEffect(() => {
    if (searchModeRef.current) return;
    cursors.current = [null];
    loadPage(1);
  }, [status, debouncedMode, loadPage]);

  // ── Enter-to-search: fires a cross-page Firestore prefix query ───────────
  const triggerSearch = useCallback(async () => {
    const term = search.trim();
    if (!term) {
      setSearchMode(false);
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setSearchMode(true);
    try {
      const results = await searchEvents(term, statusRef.current);
      setSearchResults(results);
    } catch (e) {
      console.error(e);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [search]);

  const exitSearchMode = useCallback(() => {
    setSearchMode(false);
    setSearchResults([]);
    setSearch('');
    cursors.current = [null];
    loadPage(1);
  }, [loadPage]);

  // ── Client-side filter on current page (price range + text search) ───────
  // Memoized to avoid recomputation on unrelated state changes.
  const browseFiltered = useMemo(() => items.filter((ev) => {
    const q = search.toLowerCase();
    if (
      q &&
      !ev.name?.toLowerCase().includes(q) &&
      !ev.description?.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (minPrice && (ev.price ?? 0) < Number(minPrice)) return false;
    if (maxPrice && (ev.price ?? 0) > Number(maxPrice)) return false;
    return true;
  }), [items, search, minPrice, maxPrice]);

  const searchFiltered = useMemo(() => searchResults.filter((ev) => {
    if (minPrice && (ev.price ?? 0) < Number(minPrice)) return false;
    if (maxPrice && (ev.price ?? 0) > Number(maxPrice)) return false;
    return true;
  }), [searchResults, minPrice, maxPrice]);

  const displayItems = searchMode ? searchFiltered : browseFiltered;

  // ── Quick-view modal: open/close must reset counts to null so the funnel shows a spinner,
  // not stale data from a previous event.
  const openSelected = useCallback(async (ev: Event) => {
    setSelected(ev);
    setSelectedAttendees(null);
    setSelectedPaidCount(null);
    try {
      const [attendees, paid] = await Promise.all([
        fetchAttendeeCountForEvent(ev.id),
        fetchCompletedPaymentCountForEvent(ev.id),
      ]);
      setSelectedAttendees(attendees);
      setSelectedPaidCount(paid);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const closeSelected = useCallback(() => {
    setSelected(null);
    setSelectedAttendees(null);
    setSelectedPaidCount(null);
  }, []);

  const togglePublish = useCallback(
    async (ev: Event) => {
      await updateEvent(ev.id, { is_published: !ev.is_published });
      if (!searchModeRef.current) {
        cursors.current = [null];
        loadPage(1);
      } else {
        // Keep search results in sync visually
        setSearchResults((prev) => prev.map((e) => e.id === ev.id ? { ...e, is_published: !ev.is_published } : e));
      }
    },
    [loadPage],
  );

  // Preserve the original UX: confirm() dialog before deletion,
  // plus in-memory removal from search results when in search mode.
  const handleDelete = useCallback(
    async (ev: Event) => {
      if (!confirm(`Delete "${ev.name}"?`)) return;
      await deleteEvent(ev.id, { name: ev.name ?? null });
      if (!searchModeRef.current) {
        cursors.current = [null];
        loadPage(1);
      } else {
        setSearchResults((prev) => prev.filter((e) => e.id !== ev.id));
      }
    },
    [loadPage],
  );

  return {
    // Browse mode
    items,
    loading,
    page: pageNum,
    hasMore,
    loadPage,

    // Filters
    status,
    setStatus,
    mode,
    setMode,
    search,
    setSearch,
    minPrice,
    setMinPrice,
    maxPrice,
    setMaxPrice,

    // Search mode
    searchMode,
    searchResults,
    searchLoading,
    triggerSearch,
    exitSearchMode,

    // Quick-view modal
    selected,
    openSelected,
    closeSelected,
    selectedAttendees,
    selectedPaidCount,

    // Category map
    catMap,

    // Computed
    displayItems,

    // Mutations
    togglePublish,
    handleDelete,
  };
}
