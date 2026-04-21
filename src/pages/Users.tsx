import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RotateCcw, UserX, UserCheck, Eye, X } from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import PageHeader from '../components/PageHeader';
import Badge from '../components/Badge';
import DataTable from '../components/Table';
import { fetchUsersPage, updateUser, PAGE_SIZE, searchUsers } from '../lib/firestore';
import type { AppUser } from '../types';
import { format } from 'date-fns';

type StatusFilter = 'all' | 'active' | 'suspended';

export default function Users() {
  const navigate = useNavigate();

  const [items, setItems] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // ── Search mode: Enter-key triggers cross-page Firestore prefix query ──────
  const [searchMode, setSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState<AppUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Cursor stack: cursors[i] = cursor to fetch page i+1
  const cursors = useRef<(QueryDocumentSnapshot | null)[]>([null]);

  const loadPage = useCallback(async (pageNum: number, filter: StatusFilter) => {
    setLoading(true);
    try {
      const cursor = cursors.current[pageNum - 1] ?? null;
      const result = await fetchUsersPage(filter, cursor);
      setItems(result.items);
      setHasMore(result.hasMore);
      setPage(pageNum);
      if (result.cursor && result.hasMore) cursors.current[pageNum] = result.cursor;
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cursors.current = [null];
    setPage(1);
    setSearch('');
    loadPage(1, statusFilter);
  }, [statusFilter, loadPage]);

  const triggerSearch = useCallback(async () => {
    const term = search.trim();
    if (!term) { exitSearchMode(); return; }
    setSearchLoading(true);
    setSearchMode(true);
    try {
      setSearchResults(await searchUsers(term));
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  }, [search]);

  const exitSearchMode = useCallback(() => {
    setSearchMode(false);
    setSearchResults([]);
    setSearch('');
    cursors.current = [null];
    loadPage(1, statusFilter);
  }, [statusFilter, loadPage]);

  const pageFiltered = searchMode
    ? searchResults
    : items.filter((u) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)) ?? false;
      });

  const fmt = (ts: unknown) => {
    if (!ts) return '—';
    try { return format((ts as { toDate(): Date }).toDate(), 'dd MMM yyyy'); } catch { return '—'; }
  };

  const toggleStatus = async (u: AppUser) => {
    const next = u.status === 'suspended' ? 'active' : 'suspended';
    await updateUser(u.id, { status: next });
    cursors.current = [null];
    loadPage(1, statusFilter);
  };

  const columns = [
    {
      key: 'displayName',
      header: 'User',
      width: '220px',
      render: (u: AppUser) => (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => navigate(`/users/${u.id}`)}
        >
          <div style={styles.avatar}>{(u.displayName ?? 'U')[0].toUpperCase()}</div>
          <div style={{ overflow: 'hidden' }}>
            <p style={{ fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.displayName ?? 'Unknown'}
            </p>
            <p style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.email ?? ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Join Date',
      render: (u: AppUser) => fmt(u.createdAt),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u: AppUser) => (
        <span style={{ fontSize: 13, color: '#374151', textTransform: 'capitalize' as const }}>
          {u.role ?? 'User'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u: AppUser) => <Badge status={u.status ?? 'active'} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (u: AppUser) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <ActionBtn
            title="View details"
            onClick={() => navigate(`/users/${u.id}`)}
            icon={<Eye size={14} color="#6366f1" />}
          />
          <ActionBtn
            title={u.status === 'suspended' ? 'Activate' : 'Suspend'}
            onClick={() => toggleStatus(u)}
            icon={u.status === 'suspended'
              ? <UserCheck size={14} color="#16a34a" />
              : <UserX size={14} color="#dc2626" />}
            danger={u.status !== 'suspended'}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Users" subtitle="Manage all registered users on JoinIn." />

      <div style={styles.card}>
        <div style={styles.cardTop}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>All Users</h2>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {(loading || searchLoading) ? 'Loading…' : searchMode
                ? `${pageFiltered.length} search results`
                : `${pageFiltered.length} on this page`}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={styles.searchWrap}>
              <Search
                size={16}
                color={searchMode ? '#3d7a5a' : '#9ca3af'}
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                style={{ ...styles.searchInput, borderColor: searchMode ? '#3d7a5a' : '#e5e7eb', paddingRight: search ? 28 : 12 }}
                placeholder="Type to filter · Enter to search all by email"
                value={search}
                onChange={(e) => { setSearch(e.target.value); if (searchMode && !e.target.value) exitSearchMode(); }}
                onKeyDown={(e) => { if (e.key === 'Enter') triggerSearch(); if (e.key === 'Escape') exitSearchMode(); }}
              />
              {search && (
                <button onClick={exitSearchMode} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                  <X size={14} color="#9ca3af" />
                </button>
              )}
            </div>

            <select
              style={{ ...styles.select, borderColor: statusFilter !== 'all' ? '#3d7a5a' : '#e5e7eb' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>

            <button style={styles.resetBtn} onClick={() => { setSearch(''); setStatusFilter('all'); if (searchMode) exitSearchMode(); }}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        {searchMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#e8f5ee', borderRadius: 8, margin: '8px 0', fontSize: 13 }}>
            <Search size={14} color="#3d7a5a" />
            <span style={{ color: '#3d7a5a', fontWeight: 500 }}>
              Searching all users by email prefix: "{search}"
            </span>
            <button onClick={exitSearchMode} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#3d7a5a', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              Back to browse ×
            </button>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <DataTable
            columns={columns}
            data={pageFiltered}
            keyField="id"
            loading={loading || searchLoading}
            emptyMessage={searchMode ? `No users found matching "${search}"` : 'No users found.'}
            pagination={searchMode ? undefined : {
              page,
              hasMore,
              loading,
              onPrev: () => { if (page > 1) loadPage(page - 1, statusFilter); },
              onNext: () => loadPage(page + 1, statusFilter),
              pageSize: PAGE_SIZE,
              itemCount: pageFiltered.length,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ title, onClick, icon, danger }: { title: string; onClick: () => void; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} style={{
      background: danger ? '#fee2e2' : '#f0f0ff',
      border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
      display: 'flex', alignItems: 'center',
    }}>
      {icon}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 20px', overflow: 'hidden' },
  cardTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 0, flexWrap: 'wrap', gap: 12 },
  searchWrap: { position: 'relative' },
  searchInput: { paddingLeft: 32, paddingTop: 8, paddingBottom: 8, borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', width: '100%', minWidth: 150, maxWidth: 220, color: '#111827' },
  select: { padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none' },
  resetBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: '#e8f5ee', color: '#3d7a5a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
};
