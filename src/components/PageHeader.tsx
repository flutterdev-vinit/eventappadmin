interface Props {
  title: string;
  subtitle?: string;
}

export default function PageHeader({ title, subtitle }: Props) {
  return (
    <div style={styles.header}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>{subtitle}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    marginBottom: 24,
  },
};
