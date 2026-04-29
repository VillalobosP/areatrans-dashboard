import React, { useState, useEffect, useCallback } from 'react';
import { getTaller } from '../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function diasLabel(n) {
  if (n == null) return '—';
  if (n === 0) return '0d';
  if (n === 1) return '1d';
  return `${n}d`;
}

function addOneDay(iso) {
  const d = new Date(iso); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
}

const TODAY = new Date().toISOString().slice(0, 10);

// Días de [start, end) que caen dentro del período [pFrom, pTo] (ambos inclusive).
// Si end=null → ongoing hasta hoy. Si pFrom/pTo=null → sin recorte.
function overlapDays(start, end, pFrom, pTo) {
  if (!start) return 0;
  const effectiveEnd = end || TODAY;
  if (!pFrom && !pTo) {
    return Math.max(0, Math.round((new Date(effectiveEnd) - new Date(start)) / 86400000));
  }
  const clipFrom = pFrom || '2000-01-01';
  const clipTo   = pTo ? addOneDay(pTo) : addOneDay(TODAY); // exclusive upper bound
  const oStart   = start > clipFrom ? start : clipFrom;
  const oEnd     = effectiveEnd < clipTo ? effectiveEnd : clipTo;
  if (oStart >= oEnd) return 0;
  return Math.round((new Date(oEnd) - new Date(oStart)) / 86400000);
}

// Un registro "toca" un período si su ventana activa [solicitud, salida||hoy] se
// solapa con [pFrom, pTo]. Así un registro de mar→abr aparece en ambos meses.
function recordInPeriod(r, pFrom, pTo) {
  if (!pFrom && !pTo) return true;
  const rStart = r.fechaSolicitud;
  const rEnd   = r.fechaSalida || TODAY;
  if (!rStart) return true;
  const clipFrom = pFrom || '2000-01-01';
  const clipTo   = pTo ? addOneDay(pTo) : addOneDay(TODAY);
  return rStart < clipTo && rEnd >= clipFrom;
}

// ── Cálculo de rangos de período ──────────────────────────────────────────────
function getPeriodRange(periodo) {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth(); // 0-based
  const pad = n => String(n).padStart(2, '0');
  const todayStr = now.toISOString().slice(0, 10);

  if (periodo === 'semana') {
    const dow   = now.getDay() || 7; // Lun=1...Dom=7
    const lunes = new Date(now);
    lunes.setDate(now.getDate() - dow + 1);
    return { desde: lunes.toISOString().slice(0, 10), hasta: todayStr };
  }
  if (periodo === 'quincena') {
    const dia   = now.getDate();
    const desde = dia <= 15
      ? `${y}-${pad(m + 1)}-01`
      : `${y}-${pad(m + 1)}-16`;
    return { desde, hasta: todayStr };
  }
  if (periodo === 'mes') {
    return { desde: `${y}-${pad(m + 1)}-01`, hasta: todayStr };
  }
  if (periodo === 'mesAnterior') {
    const pm      = m === 0 ? 11 : m - 1;
    const py      = m === 0 ? y - 1 : y;
    const lastDay = new Date(y, m, 0).getDate();
    return {
      desde: `${py}-${pad(pm + 1)}-01`,
      hasta: `${py}-${pad(pm + 1)}-${lastDay}`,
    };
  }
  return { desde: null, hasta: null }; // 'todo'
}

function labelPeriodo(periodo) {
  const { desde, hasta } = getPeriodRange(periodo);
  if (!desde) return 'Todo el historial';
  return `${fmtFecha(desde)} - ${fmtFecha(hasta)}`;
}

// ── Estado de cada registro ───────────────────────────────────────────────────
function getEstado(r) {
  if (!r.fechaEntrada) return { label: 'Pendiente llevar', color: '#eab308', bg: '#2a2000' };
  if (!r.fechaSalida)  return { label: 'En taller',        color: '#f87171', bg: '#2a0808' };
  return                      { label: 'Completado',        color: '#4ade80', bg: '#071a10' };
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color = '#4da6ff', warn = false, big = false }) {
  return (
    <div style={{
      background: warn ? '#1a0e00' : '#161616',
      border:     `1px solid ${warn ? color + '55' : '#242424'}`,
      borderRadius: 12, padding: '18px 22px',
      flex: big ? '1 1 180px' : '1 1 130px',
    }}>
      <div style={{ fontSize: big ? 38 : 32, fontWeight: 800, color, lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 14, color: '#ddd', fontWeight: 700, marginTop: 7, lineHeight: 1.3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Celda de días (con semáforo de color) ─────────────────────────────────────
function CeldaDias({ dias, tipo, esActivo }) {
  if (dias == null) return <td style={tdStyle}><span style={{ color: '#444' }}>—</span></td>;
  let color = tipo === 'espera' ? '#fb923c' : '#60a5fa';
  if (esActivo) color = tipo === 'espera' ? '#fb923c' : '#f87171';
  const bg = esActivo ? (tipo === 'espera' ? '#1e1000' : '#1e0808') : '#0d1520';
  return (
    <td style={tdStyle}>
      <span style={{
        background: bg, border: `1px solid ${color}44`,
        borderRadius: 6, padding: '4px 11px',
        color, fontWeight: 700, fontSize: 15,
        display: 'inline-block',
      }}>
        {diasLabel(dias)}
        {esActivo && <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.75 }}>↑hoy</span>}
      </span>
    </td>
  );
}

// ── Estilos de tabla ──────────────────────────────────────────────────────────
const thStyle = {
  padding: '10px 14px', textAlign: 'left',
  fontSize: 12, color: '#555', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.07em',
  borderBottom: '1px solid #242424', whiteSpace: 'nowrap',
};
const tdStyle = {
  padding: '11px 14px', fontSize: 14, color: '#ccc',
  borderBottom: '1px solid #1e1e1e', verticalAlign: 'middle',
};

// ── Fila de registro ──────────────────────────────────────────────────────────
function FilaRegistro({ r }) {
  const estado    = getEstado(r);
  const esActivo  = !r.fechaSalida;
  const esPendiente = !r.fechaEntrada;

  return (
    <tr style={{ transition: 'background 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

      {/* Matrícula */}
      <td style={tdStyle}>
        <span style={{
          fontFamily: 'monospace', fontWeight: 800, fontSize: 15,
          background: '#1e1e1e', border: '1px solid #2e2e2e',
          borderRadius: 5, padding: '4px 10px', color: '#e2e8f0',
          display: 'inline-block',
        }}>
          {r.matricula}
        </span>
      </td>

      {/* Estado */}
      <td style={tdStyle}>
        <span style={{
          background: estado.bg, border: `1px solid ${estado.color}44`,
          color: estado.color, borderRadius: 20, fontSize: 12, fontWeight: 600,
          padding: '4px 11px', whiteSpace: 'nowrap', display: 'inline-block',
        }}>
          {estado.label}
        </span>
      </td>

      {/* Fecha solicitud */}
      <td style={{ ...tdStyle, color: '#a78bfa' }}>{fmtFecha(r.fechaSolicitud)}</td>

      {/* Días sin sustitución */}
      <CeldaDias dias={r.diasEspera} tipo="espera" esActivo={esPendiente} />

      {/* Fecha entrada */}
      <td style={{ ...tdStyle, color: r.fechaEntrada ? '#fb923c' : '#333' }}>
        {fmtFecha(r.fechaEntrada)}
      </td>

      {/* Días en taller */}
      <CeldaDias dias={r.diasTaller} tipo="taller" esActivo={esActivo && !!r.fechaEntrada} />

      {/* Fecha salida */}
      <td style={{ ...tdStyle, color: r.fechaSalida ? '#4ade80' : '#333' }}>
        {fmtFecha(r.fechaSalida)}
      </td>

      {/* Taller */}
      <td style={{ ...tdStyle, color: '#888', maxWidth: 180 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.taller || '—'}
        </span>
      </td>

      {/* Motivo (abreviado) */}
      <td style={{ ...tdStyle, color: '#555', maxWidth: 200 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={r.motivo}>
          {r.motivo || '—'}
        </span>
      </td>
    </tr>
  );
}

// ── Flota registrada ──────────────────────────────────────────────────────────
function TablaFlota({ camiones }) {
  if (!camiones?.length) return null;
  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontSize: 13, color: '#555', fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.08em', marginBottom: 12 }}>
        Flota registrada
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {camiones.map(c => (
          <div key={c.matricula} style={{
            background: '#161616', border: '1px solid #2a2a2a', borderRadius: 8,
            padding: '14px 18px',
          }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 17, color: '#e2e8f0' }}>
              {c.matricula}
            </div>
            <div style={{ fontSize: 13, color: '#bbb', fontWeight: 600, marginTop: 5 }}>{c.tipo}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{c.proveedor}</div>
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
  const [periodo, setPeriodo] = useState('todo');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getTaller(centro)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [centro]);

  useEffect(() => { cargar(); }, [cargar]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (refreshKey > 0) cargar(); }, [refreshKey]);

  if (loading && !data) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#555' }}>Cargando...</div>
  );
  if (error) return (
    <div style={{ padding: 40, color: '#f87171', textAlign: 'center' }}>{error}</div>
  );
  if (!data) return null;

  const { registros, camiones, kpis } = data;

  // ── Filtro por período (intersección, no solo fechaSolicitud) ─────────────
  const { desde, hasta } = getPeriodRange(periodo);
  const enPeriodo = registros.filter(r => recordInPeriod(r, desde, hasta));

  // ── Totales del período (solo días que caen dentro del período) ────────────
  const totalDiasEspera = enPeriodo.reduce((s, r) =>
    s + overlapDays(r.fechaSolicitud, r.fechaEntrada, desde, hasta), 0);
  const totalDiasTaller = enPeriodo.reduce((s, r) =>
    s + (r.fechaEntrada ? overlapDays(r.fechaEntrada, r.fechaSalida, desde, hasta) : 0), 0);

  const conDiasTaller = enPeriodo.filter(r => r.diasTaller != null && r.fechaEntrada && r.fechaSalida);
  const mediaTaller   = conDiasTaller.length
    ? Math.round(conDiasTaller.reduce((s, r) => s + r.diasTaller, 0) / conDiasTaller.length * 10) / 10
    : null;

  // ── Filtro por estado ──────────────────────────────────────────────────────
  const registrosFiltrados = enPeriodo.filter(r => {
    if (filtroEstado === 'activos')     return r.fechaEntrada && !r.fechaSalida;
    if (filtroEstado === 'pendiente')   return !r.fechaEntrada;
    if (filtroEstado === 'completados') return r.fase === 'completada';
    return true;
  });

  const PERIODOS = [
    { id: 'semana',      label: 'Esta semana' },
    { id: 'quincena',    label: 'Esta quincena' },
    { id: 'mes',         label: 'Este mes' },
    { id: 'mesAnterior', label: 'Mes anterior' },
    { id: 'todo',        label: 'Todo' },
  ];

  const ESTADOS = [
    { id: 'todos',       label: `Todos (${enPeriodo.length})` },
    { id: 'activos',     label: `En taller (${kpis.enTaller})`,              color: '#f87171' },
    { id: 'pendiente',   label: `Pendiente llevar (${kpis.pendienteLlevar})`, color: '#eab308' },
    { id: 'completados', label: `Completados (${kpis.completados})`,          color: '#4ade80' },
  ];

  return (
    <div style={{ padding: '24px 20px' }}>

      {/* ── KPIs ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
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
          sub="Solicitud abierta sin entrada"
        />
        {mediaTaller != null && (
          <KPI
            label="Media dias en taller"
            value={`${mediaTaller}d`}
            color="#60a5fa"
            sub="Por visita completada en periodo"
          />
        )}
        <KPI
          label="Total dias en taller"
          value={`${totalDiasTaller}d`}
          color="#f87171"
          warn={totalDiasTaller > 0}
          big
          sub={`Suma de todos los registros · ${labelPeriodo(periodo)}`}
        />
        <KPI
          label="Total dias sin sustitución"
          value={`${totalDiasEspera}d`}
          color="#fb923c"
          warn={totalDiasEspera > 0}
          big
          sub={`Días esperando para llevar al taller · ${labelPeriodo(periodo)}`}
        />
      </div>

      {/* ── Filtro por período ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#555', marginRight: 4 }}>Período:</span>
        {PERIODOS.map(p => (
          <button key={p.id} onClick={() => setPeriodo(p.id)} style={{
            background:  periodo === p.id ? '#1e2030' : 'transparent',
            border:      `1px solid ${periodo === p.id ? '#4da6ff88' : '#2e2e2e'}`,
            borderRadius: 16, color: periodo === p.id ? '#4da6ff' : '#666',
            fontSize: 13, fontWeight: 600, padding: '5px 14px', cursor: 'pointer',
          }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Filtro por estado ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#555', marginRight: 4 }}>Estado:</span>
        {ESTADOS.map(e => (
          <button key={e.id} onClick={() => setFiltroEstado(e.id)} style={{
            background:  filtroEstado === e.id ? '#1e1e2e' : 'transparent',
            border:      `1px solid ${filtroEstado === e.id ? (e.color || '#4da6ff') + '88' : '#2e2e2e'}`,
            borderRadius: 16, color: filtroEstado === e.id ? (e.color || '#4da6ff') : '#666',
            fontSize: 13, fontWeight: 600, padding: '5px 14px', cursor: 'pointer',
          }}>
            {e.label}
          </button>
        ))}
      </div>

      {/* ── Tabla de registros ── */}
      {registrosFiltrados.length === 0 ? (
        <div style={{ color: '#444', fontSize: 13, padding: '20px 0' }}>
          No hay registros para este filtro.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#111' }}>
                <th style={thStyle}>Matrícula</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Solicitud</th>
                <th style={{ ...thStyle, color: '#fb923c' }}>Sin sustitución</th>
                <th style={thStyle}>Entrada taller</th>
                <th style={{ ...thStyle, color: '#f87171' }}>Días en taller</th>
                <th style={thStyle}>Salida taller</th>
                <th style={thStyle}>Taller / Proveedor</th>
                <th style={thStyle}>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {registrosFiltrados.map((r, i) => (
                <FilaRegistro key={`${r.matricula}-${r.fechaSolicitud}-${i}`} r={r} />
              ))}
            </tbody>
            {/* Pie con totales del período */}
            {registrosFiltrados.length > 1 && (
              <tfoot>
                <tr style={{ background: '#111', borderTop: '1px solid #2a2a2a' }}>
                  <td colSpan={3} style={{ ...tdStyle, color: '#555', fontStyle: 'italic' }}>
                    {registrosFiltrados.length} registros
                  </td>
                  <td style={{ ...tdStyle, color: '#fb923c', fontWeight: 700 }}>
                    {totalDiasEspera}d total
                  </td>
                  <td style={tdStyle} />
                  <td style={{ ...tdStyle, color: '#f87171', fontWeight: 700 }}>
                    {totalDiasTaller}d total
                  </td>
                  <td colSpan={3} style={tdStyle} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── Flota ── */}
      <TablaFlota camiones={camiones} />
    </div>
  );
}
