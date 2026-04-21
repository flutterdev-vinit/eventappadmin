import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logClientError } from '../lib/firestore/errors';

// Top-level error boundary. Catches render-time exceptions that would
// otherwise unmount the entire React tree. For async / non-render errors we
// install window-level listeners in main.tsx; those path straight to
// `logClientError` and don't use this boundary.

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void logClientError(error, {
      source: 'boundary',
      extras: { componentStack: info.componentStack ?? '' },
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <AlertTriangle size={32} color="#dc2626" />
          <h1 style={styles.title}>Something went wrong.</h1>
          <p style={styles.message}>
            The error has been reported. You can try reloading the page to
            continue.
          </p>
          <pre style={styles.detail}>{this.state.error.message}</pre>
          <button style={styles.button} onClick={this.handleReload}>
            <RefreshCw size={14} /> Reload
          </button>
        </div>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f0f2f5',
    padding: 24,
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '32px 36px',
    maxWidth: 520,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    textAlign: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: '#111827',
  },
  message: {
    margin: 0,
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 1.5,
  },
  detail: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 12,
    color: '#374151',
    width: '100%',
    maxHeight: 120,
    overflow: 'auto',
    textAlign: 'left',
    whiteSpace: 'pre-wrap',
  },
  button: {
    marginTop: 4,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 18px',
    borderRadius: 8,
    border: 'none',
    background: '#3d7a5a',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
};
