import React from 'react';
import {
  BrowserRouter, Routes, Route, Navigate,
  useParams, useNavigate, Link,
} from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import Logo            from './components/Logo';
import Login           from './pages/Login';
import AdminUsers      from './pages/AdminUsers';
import DashboardRutas      from './pages/DashboardRutas';
import DashboardFacturacion from './pages/DashboardFacturacion';
import DashboardFlota      from './pages/DashboardFlota';
import './index.css';

// ── Etiquetas de centros ───────────────────────────────────────────────────────
const CENTRO_LABELS = { getafe: 'GETAFE', illescas: 'ILLESCAS' };

// ── Tabs disponibles por centro (mismas para todos) ───────────────────────────
const TABS = [
  { id: 'rutas',        label: 'Rutas' },
  { id: 'facturacion',  label: 'Facturación' },
  { id: 'flota',        label: 'Flota & Gasoil' },
];

// ── Ruta protegida ─────────────────────────────────────────────────────────────
function ProtectedRoute({ children, adminOnly = false }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

// ── Layout del dashboard (header + nav + contenido) ───────────────────────────
function DashboardLayout() {
  const { user, logout } = useAuth();
  const { centro, tab }  = useParams();
  const navigate          = useNavigate();

  // Si el usuario no tiene acceso a este centro → primer centro disponible
  if (!user.centros?.includes(centro)) {
    const fallback = user.centros?.[0];
    if (!fallback) return (
      <div style={{ padding: 48, color: '#888', textAlign: 'center' }}>
        No tienes acceso a ningún centro. Contacta con el administrador.
      </div>
    );
    return <Navigate to={`/dashboard/${fallback}/rutas`} replace />;
  }

  // Si el tab no es válido, redirige a rutas
  if (!TABS.find(t => t.id === tab)) {
    return <Navigate to={`/dashboard/${centro}/rutas`} replace />;
  }

  const centrosAccesibles = user.centros.filter(c => CENTRO_LABELS[c]);

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a1a', color: '#fff' }}>

      {/* ── TOP BAR ── */}
      <div style={{
        background: '#111',
        padding: '10px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #222',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        {/* Izquierda: logo + título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Logo height={52} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
              Dashboard Operativo · {CENTRO_LABELS[centro] || centro}
            </div>
            <div style={{ fontSize: 11, color: '#555' }}>
              Gestión de rutas y facturación · DIA % Areatrans
            </div>
          </div>
        </div>

        {/* Derecha: selector de centro + usuario + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Selector de centro (solo si el usuario tiene más de uno) */}
          {centrosAccesibles.length > 1 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {centrosAccesibles.map(c => (
                <button key={c}
                  onClick={() => navigate(`/dashboard/${c}/${tab}`)}
                  style={{
                    background:  c === centro ? '#1e3a8a' : '#2a2a2a',
                    border:      c === centro ? '1px solid #4da6ff' : '1px solid #3a3a3a',
                    borderRadius: 7,
                    color:       c === centro ? '#4da6ff' : '#888',
                    fontSize:    12, fontWeight: 700,
                    padding:     '6px 14px', cursor: 'pointer',
                  }}>
                  {CENTRO_LABELS[c]}
                </button>
              ))}
            </div>
          )}

          {/* Usuario */}
          <span style={{ fontSize: 12, color: '#555' }}>
            {user.username}
            {user.role === 'admin' && (
              <span style={{ marginLeft: 6, color: '#7c3aed', fontSize: 10, fontWeight: 700 }}>ADMIN</span>
            )}
          </span>

          {/* Admin: enlace a gestión de usuarios */}
          {user.role === 'admin' && (
            <Link to="/admin/users" style={{
              background: 'transparent', border: '1px solid #3a2a5a',
              borderRadius: 7, color: '#9d6dff', fontSize: 12, padding: '6px 12px',
              textDecoration: 'none', fontWeight: 600,
            }}>
              Usuarios
            </Link>
          )}

          {/* Logout */}
          <button onClick={logout} style={{
            background: 'transparent', border: '1px solid #3a2a2a',
            borderRadius: 7, color: '#888', fontSize: 12,
            padding: '6px 12px', cursor: 'pointer',
          }}>
            Salir
          </button>
        </div>
      </div>

      {/* ── NAV TABS ── */}
      <nav className="nav-tabs">
        {TABS.map(t => (
          <button key={t.id}
            className={`nav-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => navigate(`/dashboard/${centro}/${t.id}`)}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── CONTENIDO ── */}
      {tab === 'rutas'        && <DashboardRutas       centro={centro} />}
      {tab === 'facturacion'  && <DashboardFacturacion centro={centro} />}
      {tab === 'flota'        && <DashboardFlota        centro={centro} />}
    </div>
  );
}

// ── Admin layout (mismo header simplificado) ──────────────────────────────────
function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: '#1a1a1a', color: '#fff' }}>
      <div style={{
        background: '#111', padding: '10px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid #222',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Logo height={48} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#9d6dff' }}>Panel de administración</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => navigate('/')} style={{
            background: 'transparent', border: '1px solid #2a3a5a',
            borderRadius: 7, color: '#4da6ff', fontSize: 12, padding: '6px 12px', cursor: 'pointer',
          }}>
            Volver al dashboard
          </button>
          <button onClick={logout} style={{
            background: 'transparent', border: '1px solid #3a2a2a',
            borderRadius: 7, color: '#888', fontSize: 12, padding: '6px 12px', cursor: 'pointer',
          }}>
            Salir
          </button>
        </div>
      </div>
      <AdminUsers />
    </div>
  );
}

// ── Redirección raíz ──────────────────────────────────────────────────────────
function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const centro = user.centros?.[0] || 'getafe';
  return <Navigate to={`/dashboard/${centro}/rutas`} replace />;
}

// ── App principal ─────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootRedirect />} />
          <Route path="/dashboard/:centro/:tab" element={
            <ProtectedRoute><DashboardLayout /></ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>
          } />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
