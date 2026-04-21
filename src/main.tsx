import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import 'leaflet/dist/leaflet.css';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { logClientError } from './lib/firestore/errors';

// Global async error capture — anything that escapes React's render tree
// (setTimeout callbacks, unhandled promise rejections, etc.) lands here.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (evt) => {
    void logClientError(evt.error ?? evt.message, {
      source: 'window.error',
      extras: {
        filename: evt.filename,
        lineno: evt.lineno,
        colno: evt.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (evt) => {
    void logClientError(evt.reason, { source: 'unhandledrejection' });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
