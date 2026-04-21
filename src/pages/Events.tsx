import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RotateCcw, Eye, Trash2, ToggleLeft, ToggleRight, X, ExternalLink } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Badge from '../components/Badge';
import DataTable from '../components/Table';
import EntityLink from '../components/EntityLink';
import { PAGE_SIZE } from '../lib/firestore';
import type { Event } from '../types';
import { formatDayMonthYear } from '../lib/dateUtils';
import { useWindowSize } from '../hooks/useWindowSize';
import { useEventsPage, type StatusFilter } from '../hooks/useEventsPage';

// Fixed list of event modes — not derived from current page so mode filter
// works even when a mode doesn't appear on the first page of results.
const EVENT_MODES = ['in-person', 'online', 'hybrid'];

export default function Events() {
  const { isMobile } = useWindowSize();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    loading,
    page,
    hasMore,
    loadPage,
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
    searchMode,
    searchLoading,
    triggerSearch,
    exitSearchMode,
    selected,
    openSelected,
    closeSelected,
    selectedAttendees,
    selectedPaidCount,
    catMap,
    displayItems,
    togglePublish,
    handleDelete,
  } = useEventsPage();

  const resetFilters = () => {
    setSearch('');
    setMode('');
    setMinPrice('');
    setMaxPrice('');
    if (searchMode) exitSearchMode();
  };

  const goNext = () => loadPage(page + 1);
  const goPrev = () => { if (page > 1) loadPage(page - 1); };

  const columns = [
    {
      key: 'name',
      header: 'Event',
      render: (ev: Event) => (
        <div style={{ minWidth: 160 }}>
          <EntityLink kind="event" id={ev.id} label={ev.name ?? '—'} strong />
          <p style={{ fontSize: 12, color: '#9ca3af' }}>
            {ev.category
              ? (catMap[ev.category] ?? catMap[ev.category.split('/').pop() ?? ''] ?? 'Unknown category')
              : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'startDate',
      header: 'Start Date',
      render: (ev: Event) => formatDayMonthYear(ev.startDate),
    },
    {
      key: 'endDate',
      header: 'End Date',
      render: (ev: Event) => formatDayMonthYear(ev.endDate),
    },
    {
      key: 'mode',
      header: 'Mode',
      render: (ev: Event) => <Badge status={ev.mode ?? 'in-person'} />,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right' as const,
      render: (ev: Event) => ev.is_paid ? `$${(ev.price ?? 0).toFixed(2)}` : 'Free',
    },
    {
      key: 'is_published',
      header: 'Status',
      render: (ev: Event) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge status={ev.is_published ? 'published' : 'draft'} />
          {ev.is_private && <Badge status="private" />}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (ev: Event) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <ActionBtn title="Quick view" onClick={() => openSelected(ev)} icon={<Eye size={14} />} />
          <ActionBtn title="Full details" onClick={() => navigate(`/events/${ev.id}`)} icon={<ExternalLink size={14} color="#6366f1" />} />
          <ActionBtn
            title={ev.is_published ? 'Unpublish' : 'Publish'}
            onClick={() => togglePublish(ev)}
            icon={ev.is_published
              ? <ToggleRight size={14} color="#3d7a5a" />
              : <ToggleLeft size={14} color="#9ca3af" />}
          />
          <ActionBtn title="Delete" onClick={() => handleDelete(ev)} icon={<Trash2 size={14} color="#dc2626" />} danger />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Events" subtitle="Manage all events on the JoinIn platform." />

      <div style={styles.card}>
        <div style={styles.cardTop}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>All Events</h2>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {(loading || searchLoading) ? 'Loading…' : searchMode
                ? `${displayItems.length} search results`
                : `${displayItems.length} on this page`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search box — type to filter page instantly; Enter to search all events */}
            <div style={styles.searchWrap}>
              <Search size={16} color={searchMode ? '#3d7a5a' : '#9ca3af'} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                ref={searchInputRef}
                style={{ ...styles.searchInput, borderColor: searchMode ? '#3d7a5a' : '#e5e7eb' }}
                placeholder="Type to filter page · Enter to search all"
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
            {/* Search all button */}
            <button
              style={{ ...styles.resetBtn, background: searchMode ? '#e8f5ee' : '#f3f4f6', color: searchMode ? '#3d7a5a' : '#374151', borderColor: searchMode ? '#3d7a5a' : '#e5e7eb' }}
              onClick={() => search ? triggerSearch() : exitSearchMode()}
              title="Search across all events (not just this page)"
            >
              <Search size={14} /> {searchMode ? 'In results' : 'Search all'}
            </button>
            <button style={styles.resetBtn} onClick={resetFilters} title="Clear all filters">
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        {/* Search mode banner */}
        {searchMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#e8f5ee', borderRadius: 8, margin: '8px 0', fontSize: 13 }}>
            <Search size={14} color="#3d7a5a" />
            <span style={{ color: '#3d7a5a', fontWeight: 500 }}>
              Showing all events matching "{search}" — prefix search, case-sensitive
            </span>
            <button onClick={exitSearchMode} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#3d7a5a', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              Back to browse ×
            </button>
          </div>
        )}

        {/* Server-side filters row */}
        <div style={styles.filters}>
          {/* Mode: server-side (debounced) — uses fixed list, not page-derived */}
          <select
            style={{ ...styles.select, borderColor: mode ? '#3d7a5a' : '#e5e7eb' }}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            title="Server-side filter — searches across all pages"
          >
            <option value="">All Modes</option>
            {EVENT_MODES.map((m) => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{m}</option>)}
          </select>
          {/* Status: server-side */}
          <select
            style={{ ...styles.select, borderColor: status !== 'all' ? '#3d7a5a' : '#e5e7eb' }}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            title="Server-side filter — searches across all pages"
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          {/* Price: client-side (page-level only) */}
          {!isMobile && (
            <>
              <input style={styles.priceInput} placeholder="Min price" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} type="number" min="0" title="Filters current page only" />
              <input style={styles.priceInput} placeholder="Max price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} type="number" min="0" title="Filters current page only" />
            </>
          )}
          {/* Filter scope legend */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3d7a5a', display: 'inline-block' }} /> All pages
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d1d5db', display: 'inline-block' }} /> This page only
            </span>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={displayItems}
          keyField="id"
          loading={loading || searchLoading}
          emptyMessage={searchMode ? `No events found for "${search}". Note: search is prefix + case-sensitive.` : 'No events match your filters.'}
          pagination={searchMode ? undefined : {
            page,
            hasMore,
            loading,
            onPrev: goPrev,
            onNext: goNext,
            pageSize: PAGE_SIZE,
            itemCount: displayItems.length,
          }}
        />
      </div>

      {selected && (
        <Modal title={selected.name ?? 'Event'} onClose={closeSelected}>
          {/* Funnel: Invited → Attended → Paid */}
          {(() => {
            const invited = selected.invitees?.length ?? 0;
            const attended = selectedAttendees ?? 0;
            const paid = selectedPaidCount ?? 0;
            const maxVal = Math.max(invited, attended, paid, 1);
            const steps = [
              { label: 'Invited', value: invited, color: '#2563eb', loading: false },
              { label: 'Attended', value: attended, color: '#3d7a5a', loading: selectedAttendees === null },
              { label: 'Paid', value: paid, color: '#d97706', loading: selectedPaidCount === null },
            ];
            return (
              <div style={{ padding: '16px 20px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  Event Funnel
                </p>
                {steps.map((s) => (
                  <div key={s.label} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{s.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>
                        {s.loading ? '…' : s.value.toLocaleString()}
                        {!s.loading && invited > 0 && s.label !== 'Invited' && (
                          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>
                            ({Math.round((s.value / Math.max(invited, 1)) * 100)}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        background: s.color,
                        borderRadius: 4,
                        width: s.loading ? '10%' : `${Math.round((s.value / maxVal) * 100)}%`,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                  </div>
                ))}
                <div style={{ textAlign: 'right', marginTop: 4 }}>
                  <Badge status={selected.is_published ? 'published' : 'draft'} />
                </div>
              </div>
            );
          })()}
          <dl style={{ listStyle: 'none' }}>
            <DL label="Category" value={
              selected.category
                ? (catMap[selected.category] ?? catMap[selected.category.split('/').pop() ?? ''] ?? 'Unknown category')
                : '—'
            } />
            <DL label="Mode" value={<Badge status={selected.mode ?? 'in-person'} />} />
            <DL label="Start" value={formatDayMonthYear(selected.startDate)} />
            <DL label="End" value={formatDayMonthYear(selected.endDate)} />
            <DL label="Private" value={selected.is_private ? 'Yes — invite only' : 'Public'} />
            <DL label="Price" value={selected.is_paid ? `$${selected.price}` : 'Free'} />
            {selected.description && <DL label="Description" value={selected.description} />}
          </dl>
        </Modal>
      )}
    </div>
  );
}

function ActionBtn({ title, onClick, icon, danger }: { title: string; onClick: () => void; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        background: danger ? '#fee2e2' : '#f3f4f6',
        border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
        display: 'flex', alignItems: 'center',
      }}
    >
      {icon}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={{ fontSize: 16 }}>{title}</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: '70vh' }}>{children}</div>
      </div>
    </div>
  );
}

function DL({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
      <dt style={{ width: 100, flexShrink: 0, fontSize: 13, fontWeight: 600, color: '#6b7280' }}>{label}</dt>
      <dd style={{ fontSize: 13, color: '#111827' }}>{value ?? '—'}</dd>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', padding: '18px 20px' },
  cardTop: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingBottom: 0, flexWrap: 'wrap', gap: 12, marginBottom: 0,
  },
  searchWrap: { position: 'relative' },
  searchInput: {
    paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
    borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none',
    width: '100%', minWidth: 160, maxWidth: 240, color: '#111827',
  },
  resetBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff',
    cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap',
  },
  filters: {
    display: 'flex', gap: 10, padding: '14px 0',
    flexWrap: 'wrap',
  },
  select: {
    padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
    fontSize: 14, color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none',
  },
  priceInput: {
    padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
    fontSize: 14, color: '#374151', width: 110, outline: 'none',
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: '#fff', borderRadius: 12, width: '90vw', maxWidth: 480,
    border: '1px solid #e5e7eb',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', borderBottom: '1px solid #f3f4f6',
  },
  closeBtn: {
    background: '#f3f4f6', border: 'none', borderRadius: 6,
    width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#374151',
  },
};
