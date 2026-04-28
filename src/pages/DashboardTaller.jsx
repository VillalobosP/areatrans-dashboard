import React, { useState, useEffect, useCallback } from 'react';
import { getTaller } from '../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtFecha(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function diasLabel(n) {
  if (n == null) return null;
  return n === 0 ? '0 días' : n === 1 ? '1 día' : `${n} días`;
}

// ── Estado de cada registro ───────────────────────────────────────────────────
function getEstado(r) {
  if (!r.fechaEntrada) return { label: 'Pendiente llevar', color: '#eab308', bg: '#2a2000', dot: '#eab308' };
  if (!r.fechaSalida)  return { label: 'En taller',        color: '#f87171', bg: '#2a0808', dot: '#f87171' };
  return                      { label: 'Completado',        color: '#4ade80', bg: '#071a10', dot: '#4ade80' };
}

// ── Componente tarjeta KPI ────────────────────────────────────────────────────
function KPI({ label, value, sub, color = '#4da6ff', warn = false }) {
  return (
    <div style={{
      background: warn ? '#1a0e00' : '#1a1a1a',
      border: `1px solid ${warn ? color + '66' : '#2a2a2a'}`,
      borderRadius: 12, padding: '16px 20px', minWidth: 140, flex: 1,
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Chip inline ───────────────────────────────────────────────────────────────
function Chip({ label, value, color, bg }) {
  if (!value) return null;
  return (
    <span style={{
      display: 'inline-flex', gap: 4, alignItems: 'center',
      background: bg || '#1e1e1e', border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 8px', fontSize: 11, color,
    }}>
      <span style={{ color: '#666', fontSize: 10 }}>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

// ── Tarjeta de registro ───────────────────────────────────────────────────────
function TarjetaTaller({ r }) {
  const [open, setOpen] = useState(false);
  const estado = getEstado(r);

  return (
    <div style={{
      background: '#161616', border: '1px solid #272727', borderRadius: 10,
      overflow: 'hidden', marginBottom: 8,
    }}>
      {/* Cabecera clickable */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          cursor: 'pointer', flexWrap: 'wrap',
        }}
      >
        {/* Matricula */}
        <span style={{
          fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: '#e2e8f0',
          background: '#222', border: '1px solid #333', borderRadius: 6,
          padding: '3px 10px', letterSpacing: '0.05em', minWidth: 90, textAlign: 'center',
        }}>
          {r.matricula}
        </span>

        {/* Estado badge */}
        <span style={{
          background: estado.bg, border: `1px solid ${estado.color}55`,
          color: estado.color, borderRadius: 20, fontSize: 11, fontWeight: 600,
          padding: '3px 10px', whiteSpace: 'nowrap',
        }}>
          <span style={{ marginRight: 5, fontSize: 8 }}>●</span>
          {estado.label}
        </span>

        {/* Taller */}
        {r.taller && (
          <span style={{ fontSize: 12, color: '#888', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.taller}
          </span>
        )}

        {/* Chips días */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {r.diasEspera != null && (
            <Chip label="Sin sustitución" value={diasLabel(r.diasEspera)} color="#fb923c" bg="#1e1000" />
          )}
          {r.diasTaller != null && (
            <Chip
              label={r.fechaSalida ? 'En taller' : 'Lleva en taller'}
              value={diasLabel(r.diasTaller)}
              color={r.fechaSalida ? '#60a5fa' : '#f87171'}
              bg={r.fechaSalida ? '#0d1a2a' : '#1e0808'}
            />
          )}
        </div>

        <span style={{ color: '#444', fontSize: 14 }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Detalle expandido */}
      {open && (
        <div style={{
          borderTop: '1px solid #222', padding: '12px 14px',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px 16px',
          fontSize: 12,
        }}>
          {/* Línea temporal */}
          <div style={{ gridColumn: '1 / -1', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <FechaStep label="Solicitud" fecha={r.fechaSolicitud} color="#a78bfa" />
              {r.diasEspera != null && (
                <Arrow label={`${diasLabel(r.diasEspera)} sin sustitución`} color="#fb923c" />
              )}
              <FechaStep label="Entrada" fecha={r.fechaEntrada} color="#fb923c" sub={r.quienLlevo} />
              {r.diasTaller != null && (
                <Arrow label={diasLabel(r.diasTaller)} color={r.fechaSalida ? '#60a5fa' : '#f87171'} />
              )}
              {r.fechaSalida && <FechaStep label="Salida" fecha={r.fechaSalida} color="#4ade80" sub={r.quienRecogió} />}
            </div>
          </div>

          {/* Campos adicionales */}
          {r.motivo && (
            <Field label="Motivo" value={r.motivo} span />
          )}
          {r.obsSolicitud && (
            <Field label="Observaciones" value={r.obsSolicitud} span />
          )}
        </div>
      )}
    </div>
  );
}

function FechaStep({ label, fecha, color, sub }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 70 }}>
      <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{label}</div>
      <div style={{
        background: '#1e1e1e', border: `1px solid ${color}55`,
        borderRadius: 6, padding: '4px 8px', color, fontWeight: 700, fontSize: 13,
      }}>
        {fecha ? fmtFecha(fecha) : '—'}
      </div>
      {sub && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Arrow({ label, color }) {
  return (
    <div style={{ textAlign: 'center', color, fontSize: 10 }}>
      <div>- {label} -</div>
      <div style={{ fontSize: 16 }}>&#8594;</div>
    </div>
  );
}

function Field({ label, value, span }) {
  return (
    <div style={{ gridColumn: span ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>{label}</div>
      <div style={{ color: '#bbb', lineHeight: 1.4 }}>{value}</div>
    </div>
  );
}

// ── Flota (listado de camiones del centro) ────────────────────────────────────
function TablaFlota({ camiones }) {
  if (!camiones?.length) return null;
  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ color: '#888', fontSize: 13, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Flota registrada
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {camiones.map(c => (
          <div key={c.matricula} style={{
            background: '#161616', border: '1px solid #272727', borderRadius: 8,
            padding: '10px 14px', minWidth: 160,
          }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: '#e2e8f0' }}>
              {c.matricula}
            </div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{c.tipo}</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 1 }}>{c.proveedor}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DashboardTaller({ centro, refreshKey = 0 }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [filtro,  setFiltro]  = useState('todos'); // 'todos' | 'activos' | 'pendiente' | 'completados'

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getTaller(centro)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [centro]);

  useEffect(() => { cargar(); }, [cargar]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (refreshKey > 0) cargar(); }, [refreshKey]);

  const t = { bg: '#1a1a1a', fg: '#e2e8f0', border: '#2a2a2a' };

  if (loading && !data) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#555' }}>Cargando...</div>
  );
  if (error) return (
    <div style={{ padding: 40, color: '#f87171', textAlign: 'center' }}>{error}</div>
  );
  if (!data) return null;

  const { registros, camiones, kpis } = data;

  // Filtrado
  const registrosFiltrados = registros.filter(r => {
    if (filtro === 'activos')     return r.fechaEntrada && !r.fechaSalida;
    if (filtro === 'pendiente')   return !r.fechaEntrada;
    if (filtro === 'completados') return r.fase === 'completada';
    return true;
  });

  return (
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto' }}>

      {/* ── KPIs ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <KPI
          label="En taller ahora"
          value={kpis.enTaller}
          color={kpis.enTaller > 0 ? '#f87171' : '#4ade80'}
          warn={kpis.enTaller > 0}
          sub="Con entrada, sin salida"
        />
        <KPI
          label="Pendiente llevar"
          value={kpis.pendienteLlevar}
          color={kpis.pendienteLlevar > 0 ? '#eab308' : '#4ade80'}
          warn={kpis.pendienteLlevar > 0}
          sub="Solicitud abierta, sin entrada"
        />
        <KPI
          label="Total visitas"
          value={kpis.totalRegistros}
          color="#a78bfa"
          sub="Registros en el sistema"
        />
        {kpis.mediaTaller != null && (
          <KPI
            label="Media dias en taller"
            value={`${kpis.mediaTaller}d`}
            color="#60a5fa"
            sub="Por visita completada"
          />
        )}
        {kpis.mediaEspera != null && (
          <KPI
            label="Media sin sustitución"
            value={`${kpis.mediaEspera}d`}
            color="#fb923c"
            warn={kpis.mediaEspera > 2}
            sub="Solicitud hasta entrada"
          />
        )}
      </div>

      {/* ── Filtros ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'todos',       label: `Todos (${registros.length})` },
          { id: 'activos',     label: `En taller (${kpis.enTaller})`,          color: '#f87171' },
          { id: 'pendiente',   label: `Pendiente llevar (${kpis.pendienteLlevar})`, color: '#eab308' },
          { id: 'completados', label: `Completados (${kpis.completados})`,      color: '#4ade80' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            style={{
              background: filtro === f.id ? '#1e1e2e' : 'transparent',
              border: `1px solid ${filtro === f.id ? (f.color || '#4da6ff') : '#333'}`,
              borderRadius: 20, color: filtro === f.id ? (f.color || '#4da6ff') : '#666',
              fontSize: 12, fontWeight: 600, padding: '5px 14px', cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Lista de registros ── */}
      {registrosFiltrados.length === 0 ? (
        <div style={{ color: '#555', fontSize: 13, padding: '20px 0' }}>
          No hay registros para este filtro.
        </div>
      ) : (
        registrosFiltrados.map((r, i) => (
          <TarjetaTaller key={`${r.matricula}-${r.fechaSolicitud}-${i}`} r={r} />
        ))
      )}

      {/* ── Flota ── */}
      <TablaFlota camiones={camiones} />
    </div>
  );
}
