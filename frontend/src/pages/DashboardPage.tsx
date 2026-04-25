import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Dashboard from '../components/Dashboard';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 1000,
        background: 'rgba(2,6,23,0.9)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(148,163,184,0.2)',
        borderRadius: 8,
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        color: '#f8fafc',
        fontSize: 13,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}>
        <span style={{ fontWeight: 600 }}>{user?.name}</span>
        <span style={{ opacity: 0.45, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {user?.role === 'admin' ? 'Global admin' : 'Regional'}
        </span>
        <button
          onClick={handleLogout}
          style={{
            background: 'rgba(148,163,184,0.12)',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 6,
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 12,
            padding: '4px 10px',
          }}
        >
          Log out
        </button>
      </div>
      <Dashboard />
    </div>
  );
}
