import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase';
import { Calendar } from 'lucide-react';

/**
 * Who may use this admin UI:
 *
 * - Firebase Authentication only decides *identity* (this user signed in).
 * - Custom claims live on the **ID token** (JWT), not in Firestore by default.
 *   After sign-in, `getIdTokenResult()` exposes `token.claims` — e.g. `{ admin: true }`.
 * - Claims are set with the **Firebase Admin SDK** on a trusted server (or a
 *   secured Cloud Function), not from client code. Example:
 *   `admin.auth().setCustomUserClaims(uid, { admin: true })`
 * - A `role` field on a Firestore `users/{uid}` doc is separate; the app does
 *   not read that unless you add code to do so. For this gate we only check
 *   the JWT custom claim `admin` when VITE_ENFORCE_ADMIN_CLAIM=true.
 */
const enforceAdminClaim = import.meta.env.VITE_ENFORCE_ADMIN_CLAIM === 'true';

type AuthState = 'loading' | 'unauthenticated' | 'no-admin' | 'authenticated';

interface Props {
  children: ReactNode;
  loginPage: ReactNode;
}

export default function AuthGate({ children, loginPage }: Props) {
  const [state, setState] = useState<AuthState>('loading');
  const [, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (!fbUser) {
        setState('unauthenticated');
        return;
      }
      if (!enforceAdminClaim) {
        setState('authenticated');
        return;
      }
      const token = await fbUser.getIdTokenResult();
      if (token.claims.admin === true) {
        setState('authenticated');
      } else {
        setState('no-admin');
      }
    });
    return unsub;
  }, []);

  if (state === 'loading') return <LoadingScreen />;
  if (state === 'unauthenticated') return <>{loginPage}</>;
  if (state === 'no-admin') return <AccessDenied />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div style={styles.center}>
      <div style={styles.logoIcon}>
        <Calendar size={28} color="#fff" />
      </div>
      <p style={{ color: '#6b7280', fontSize: 14, marginTop: 16 }}>Loading...</p>
    </div>
  );
}

function AccessDenied() {
  return (
    <div style={styles.center}>
      <div style={{ ...styles.logoIcon, background: '#dc2626' }}>
        <Calendar size={28} color="#fff" />
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginTop: 20 }}>Access Denied</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8, textAlign: 'center', maxWidth: 340 }}>
        Your account does not have admin privileges. Contact the platform administrator.
      </p>
      <button
        onClick={() => auth.signOut()}
        style={styles.signOutBtn}
      >
        Sign out
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#f0f2f5',
    padding: 32,
  },
  logoIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: '#3d7a5a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtn: {
    marginTop: 20,
    padding: '10px 24px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    color: '#374151',
  },
};
