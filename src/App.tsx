import { useState, lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import AuthGate from './components/AuthGate';
import Sidebar from './components/Sidebar';
import PageLoader from './components/PageLoader';
import Login from './pages/Login';
import { useWindowSize } from './hooks/useWindowSize';

// Route-level code splitting — each page becomes its own JS chunk, fetched
// on first navigation. Login + AuthGate + Sidebar stay eager because they
// render before the first route and determine whether anything else loads.
const Dashboard       = lazy(() => import('./pages/Dashboard'));
const Events          = lazy(() => import('./pages/Events'));
const EventDetail     = lazy(() => import('./pages/EventDetail'));
const Users           = lazy(() => import('./pages/Users'));
const UserDetail      = lazy(() => import('./pages/UserDetail'));
const Payments        = lazy(() => import('./pages/Payments'));
const Messages        = lazy(() => import('./pages/Messages'));
const Analytics       = lazy(() => import('./pages/Analytics'));
const Categories      = lazy(() => import('./pages/Categories'));
const CategoryGallery = lazy(() => import('./pages/CategoryGallery'));
const Reports         = lazy(() => import('./pages/Reports'));
const Payouts         = lazy(() => import('./pages/Payouts'));

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/events': 'Events',
  '/users': 'Users',
  '/payments': 'Payments',
  '/messages': 'Messages',
  '/analytics': 'Analytics',
  '/categories': 'Categories',
  '/reports': 'Reports',
  '/payouts': 'Payouts',
};

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isMobile } = useWindowSize();
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Admin';

  return (
    <AuthGate loginPage={<Login />}>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f2f5' }}>
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isMobile={isMobile}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {isMobile && (
            <div style={styles.mobileBar}>
              <button
                style={styles.hamburger}
                onClick={() => setSidebarOpen(true)}
                title="Open menu"
              >
                <Menu size={22} color="#374151" />
              </button>
              <span style={styles.mobileTitle}>{pageTitle}</span>
            </div>
          )}

          <main style={{
            flex: 1,
            padding: isMobile ? '16px 16px 40px' : '32px 32px 48px',
            overflowX: 'hidden',
          }}>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/events" element={<Events />} />
                <Route path="/events/:id" element={<EventDetail />} />
                <Route path="/users" element={<Users />} />
                <Route path="/users/:id" element={<UserDetail />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/categories/:id/gallery" element={<CategoryGallery />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/payouts" element={<Payouts />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}

const styles: Record<string, React.CSSProperties> = {
  mobileBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    background: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  hamburger: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    borderRadius: 6,
  },
  mobileTitle: {
    fontWeight: 700,
    fontSize: 16,
    color: '#111827',
  },
};
