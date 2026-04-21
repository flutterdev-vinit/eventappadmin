import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface PaginationProps {
  page: number;
  hasMore: boolean;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  pageSize?: number;
  itemCount: number;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  loading?: boolean;
  emptyMessage?: string;
  pagination?: PaginationProps;
}

export default function DataTable<T>({ columns, data, keyField, loading, emptyMessage = 'No data found.', pagination }: Props<T>) {
  return (
    <div>
      <div style={styles.wrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{ ...styles.th, textAlign: col.align ?? 'left', width: col.width }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} style={styles.td}>
                      <div style={styles.skeleton} />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ ...styles.td, textAlign: 'center', color: '#9ca3af', padding: '40px 16px' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={String(row[keyField])} style={styles.row}>
                  {columns.map((col) => (
                    <td key={col.key} style={{ ...styles.td, textAlign: col.align ?? 'left' }}>
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <PaginationBar {...pagination} />
      )}
    </div>
  );
}

function PaginationBar({ page, hasMore, loading, onPrev, onNext, pageSize = 20, itemCount }: PaginationProps) {
  const start = (page - 1) * pageSize + 1;
  const end = (page - 1) * pageSize + itemCount;

  return (
    <div style={styles.paginationBar}>
      <span style={styles.paginationInfo}>
        {loading ? 'Loading…' : itemCount === 0 ? 'No results' : `Showing ${start}–${end}`}
      </span>
      <div style={styles.paginationControls}>
        <button
          style={{ ...styles.pageBtn, opacity: page <= 1 || loading ? 0.4 : 1 }}
          onClick={onPrev}
          disabled={page <= 1 || loading}
          title="Previous page"
        >
          <ChevronLeft size={16} />
          <span>Prev</span>
        </button>
        <span style={styles.pageNumber}>Page {page}</span>
        <button
          style={{ ...styles.pageBtn, opacity: !hasMore || loading ? 0.4 : 1 }}
          onClick={onNext}
          disabled={!hasMore || loading}
          title="Next page"
        >
          <span>Next</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    overflowX: 'auto',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
  },
  th: {
    padding: '11px 16px',
    fontSize: 12,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '13px 16px',
    fontSize: 14,
    color: '#374151',
    borderBottom: '1px solid #f3f4f6',
    verticalAlign: 'middle',
  },
  row: {
    transition: 'background 0.1s',
  },
  skeleton: {
    height: 14,
    borderRadius: 4,
    background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
  },
  paginationBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 4px 0',
    flexWrap: 'wrap',
    gap: 8,
  },
  paginationInfo: {
    fontSize: 13,
    color: '#6b7280',
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  pageBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '7px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    transition: 'background 0.15s',
  },
  pageNumber: {
    fontSize: 13,
    fontWeight: 600,
    color: '#111827',
    padding: '0 4px',
  },
};
