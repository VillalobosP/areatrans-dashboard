import React, { useState } from 'react';
import Logo from './components/Logo';
import DashboardRutas from './pages/DashboardRutas';
import DashboardFacturacion from './pages/DashboardFacturacion';
import DashboardFlota from './pages/DashboardFlota';
import './index.css';

const TABS = [
  { id: 'rutas',        label: '🚛  Rutas' },
  { id: 'facturacion',  label: '💶  Facturación' },
  { id: 'flota',        label: '⛽  Flota & Gasoil' },
];

export default function App() {
  const [tab, setTab] = useState('rutas');

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a1a', color: '#fff' }}>

      {/* ── TOP BAR con logo ─────────────────────────────────────────────────── */}
      <div style={{
        background: '#111',
        padding: '12px 28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #222',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
            Dashboard Operativo Getafe
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: '#555', marginTop: 2 }}>
            Gestión de rutas y facturación · DIA % Areatrans
          </p>
        </div>
        <Logo height={60} />
      </div>

      {/* ── NAV TABS ─────────────────────────────────────────────────────────── */}
      <nav className="nav-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── CONTENIDO ────────────────────────────────────────────────────────── */}
      {tab === 'rutas'       && <DashboardRutas />}
      {tab === 'facturacion' && <DashboardFacturacion />}
      {tab === 'flota'       && <DashboardFlota />}
    </div>
  );
}
