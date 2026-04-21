import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  iconBg?: string;
  trend?: { value: string; up: boolean };
}

export default function StatCard({ label, value, sub, icon, iconBg = '#e8f5ee', trend }: Props) {
  return (
    <div style={styles.card}>
      <div style={styles.top}>
        <div>
          <p style={styles.label}>{label}</p>
          <p style={styles.value}>{value}</p>
          {sub && <p style={styles.sub}>{sub}</p>}
        </div>
        <div style={{ ...styles.iconWrap, background: iconBg }}>{icon}</div>
      </div>
      {trend && (
        <div style={styles.trend}>
          <span style={{ color: trend.up ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: 12 }}>
            {trend.up ? '▲' : '▼'} {trend.value}
          </span>
          <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 6 }}>vs last month</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  top: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: 500,
    marginBottom: 4,
  },
  value: {
    fontSize: 28,
    fontWeight: 700,
    color: '#111827',
    lineHeight: 1.1,
  },
  sub: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trend: {
    display: 'flex',
    alignItems: 'center',
    borderTop: '1px solid #f3f4f6',
    paddingTop: 10,
  },
};
