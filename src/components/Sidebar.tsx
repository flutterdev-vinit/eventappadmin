import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  Users,
  CreditCard,
  MessageSquare,
  BarChart3,
  LogOut,
  X,
} from 'lucide-react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '../firebase';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/events', icon: Calendar, label: 'Events' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/payments', icon: CreditCard, label: 'Payments' },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
}

export default function Sidebar({ open, onClose, isMobile }: Props) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return unsub;
  }, []);

  const displayName = user?.displayName ?? 'Admin';
  const email = user?.email ?? '';
  const initials = displayName.trim().charAt(0).toUpperCase();

  // On mobile: overlay + slide-in drawer. On desktop: sticky rail.
  if (isMobile) {
    return (
      <>
        {/* Overlay */}
        {open && (
          <div
            style={styles.overlay}
            onClick={onClose}
          />
        )}
        {/* Drawer */}
        <aside
          style={{
            ...styles.sidebar,
            position: 'fixed',
            transform: open ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
            zIndex: 200,
          }}
        >
          <SidebarContent
            displayName={displayName}
            email={email}
            initials={initials}
            onNavClick={onClose}
            showClose
            onClose={onClose}
          />
        </aside>
      </>
    );
  }

  return (
    <aside style={styles.sidebar}>
      <SidebarContent
        displayName={displayName}
        email={email}
        initials={initials}
        onNavClick={() => {}}
        showClose={false}
        onClose={() => {}}
      />
    </aside>
  );
}

interface ContentProps {
  displayName: string;
  email: string;
  initials: string;
  onNavClick: () => void;
  showClose: boolean;
  onClose: () => void;
}

function SidebarContent({ displayName, email, initials, onNavClick, showClose, onClose }: ContentProps) {
  const handleSignOut = () => {
    signOut(auth);
  };

  return (
    <>
      {/* Logo */}
      <div style={styles.logo}>
        <div style={styles.logoIcon}>
          <Calendar size={20} color="#fff" />
        </div>
        <span style={styles.logoText}>JoinIn Admin</span>
        {showClose && (
          <button style={styles.closeBtn} onClick={onClose} title="Close menu">
            <X size={18} color="#6b7280" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={styles.nav}>
        <p style={styles.navLabel}>MAIN MENU</p>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavClick}
            style={({ isActive }) => ({
              ...styles.navItem,
              ...(isActive ? styles.navItemActive : {}),
            })}
          >
            {({ isActive }) => (
              <>
                <Icon size={18} color={isActive ? '#fff' : '#6b7280'} />
                <span style={{ color: isActive ? '#fff' : '#374151' }}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div style={styles.bottom}>
        <div style={styles.adminCard}>
          <div style={styles.avatar}>{initials}</div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <p style={{ fontWeight: 600, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </p>
            {email && (
              <p style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email}
              </p>
            )}
          </div>
        </div>
        <button style={styles.signOutBtn} title="Sign out" onClick={handleSignOut}>
          <LogOut size={16} color="#dc2626" />
        </button>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 199,
  },
  sidebar: {
    width: 240,
    minWidth: 240,
    minHeight: '100vh',
    background: '#ffffff',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    position: 'sticky',
    top: 0,
    alignSelf: 'flex-start',
    height: '100vh',
    overflowY: 'auto',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px 16px 16px',
    borderBottom: '1px solid #f3f4f6',
  },
  logoIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    background: '#3d7a5a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoText: {
    fontWeight: 700,
    fontSize: 15,
    color: '#111827',
    flex: 1,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
  },
  nav: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#9ca3af',
    letterSpacing: '0.08em',
    padding: '4px 8px 8px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 8,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    transition: 'background 0.15s',
  },
  navItemActive: {
    background: '#3d7a5a',
  },
  bottom: {
    borderTop: '1px solid #f3f4f6',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  adminCard: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#3d7a5a',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  },
  signOutBtn: {
    background: '#fef2f2',
    border: 'none',
    cursor: 'pointer',
    padding: 6,
    borderRadius: 6,
    display: 'flex',
  },
};
