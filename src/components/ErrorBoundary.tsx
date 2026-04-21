import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: '#f0f2f5', padding: 32,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 32, maxWidth: 560,
            border: '1px solid #e5e7eb', width: '100%',
          }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', marginBottom: 12 }}>
              Something went wrong
            </h1>
            <pre style={{
              fontSize: 12, color: '#374151', background: '#f9fafb', borderRadius: 8,
              padding: 12, overflow: 'auto', whiteSpace: 'pre-wrap',
            }}>
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16, padding: '8px 20px', background: '#3d7a5a', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
