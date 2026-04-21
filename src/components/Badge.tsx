interface Props {
  status: string;
}

const config: Record<string, { bg: string; color: string; label: string }> = {
  active:    { bg: '#dcfce7', color: '#16a34a', label: 'Active' },
  suspended: { bg: '#fee2e2', color: '#dc2626', label: 'Suspended' },
  published: { bg: '#dcfce7', color: '#16a34a', label: 'Published' },
  draft:     { bg: '#f3f4f6', color: '#6b7280', label: 'Draft' },
  private:   { bg: '#ede9fe', color: '#7c3aed', label: 'Private' },
  paid:      { bg: '#dbeafe', color: '#2563eb', label: 'Paid' },
  free:      { bg: '#f0fdf4', color: '#16a34a', label: 'Free' },
  completed: { bg: '#dcfce7', color: '#16a34a', label: 'Completed' },
  pending:   { bg: '#fef9c3', color: '#ca8a04', label: 'Pending' },
  failed:    { bg: '#fee2e2', color: '#dc2626', label: 'Failed' },
  refunded:  { bg: '#f3f4f6', color: '#6b7280', label: 'Refunded' },
  online:    { bg: '#dbeafe', color: '#2563eb', label: 'Online' },
  'in-person': { bg: '#fef3c7', color: '#d97706', label: 'In-Person' },
  hybrid:    { bg: '#ede9fe', color: '#7c3aed', label: 'Hybrid' },
};

export default function Badge({ status }: Props) {
  const s = config[status?.toLowerCase()] ?? { bg: '#f3f4f6', color: '#6b7280', label: status };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      background: s.bg,
      color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}
