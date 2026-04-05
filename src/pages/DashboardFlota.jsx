import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import KPICard from '../components/KPICard';
import { getGasoilResumen, getKmDesviacion } from '../services/api';

function hoy() { return new Date().toISOString().slice(0, 10); }
function primerDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function fmtRango(desde, hasta) {
  const fmt = s => {
    if (!s) return '';
    const [y, m, d] = s.split('-');
    const meses = ['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${parseInt(d, 10)} ${meses[parseInt(m, 10)]} ${y}`;
  };
  return `${fmt(desde)} — ${fmt(hasta)}`;
}
function fmtEur(n) {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function fmtEur2(n) {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtNum(n, suffix = '') {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n) + suffix;
}
function fmtNum1(n, suffix = '') {
  if (n === undefined || n === null) return '—';
  const v = (Math.round(n * 10) / 10).toFixed(1);
  return new Intl.NumberFormat('es-ES').format(Number(v)) + suffix;
}
function fmtDesv(n, suffix = '') {
  if (n === undefined || n === null) return '—';
  const abs = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Math.abs(n));
  return (n >= 0 ? '+' : '-') + abs + suffix;
}
function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const meses = ['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d, 10)} ${meses[parseInt(m, 10)]} ${y}`;
}
function getPresets() {
  const h = hoy(); const p = primerDiaMes();
  const semAtr = new Date(); semAtr.setDate(semAtr.getDate() - 6);
  const quince = new Date(); quince.setDate(quince.getDate() - 14);
  return [
    { label: 'Esta semana', desde: semAtr.toISOString().slice(0, 10), hasta: h },
    { label: 'Quincena',    desde: quince.toISOString().slice(0, 10), hasta: h },
    { label: 'Mes actual',  desde: p, hasta: h },
  ];
}

const S = {
  root: { padding: '22px 28px' },
  sectionBlock: { marginBottom: 18 },
  sectionHeader: {
    fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.1em',
    textTransform: 'uppercase', marginBottom: 10, borderLeft: '3px solid #333', paddingLeft: 8,
  },
  rangoLabel: { fontSize: 13, color: '#888' },
  dateInput: {
    background: '#2a2a2a', border: '1px solid #444', borderRadius: 7, color: '#fff',
    fontSize: 14, padding: '7px 12px', outline: 'none', cursor: 'pointer', colorScheme: 'dark',
  },
  btnPreset: {
    background: '#2a2a2a', border: '1px solid #444', borderRadius: 7,
    color: '#bbb', fontSize: 12, padding: '7px 12px', cursor: 'pointer',
  },
  btnPresetActive: { background: '#1e3a5f', border: '1px solid #4da6ff', color: '#4da6ff' },
  chartBox: { background: '#202020', borderRadius: 12, padding: '20px 20px 12px', marginBottom: 14 },
  chartTitle: {
    fontSize: 12, fontWeight: 600, color: '#666', letterSpacing: '0.08em',
    textTransform: 'uppercase', marginBottom: 16,
  },
  error: { background: '#3a1a1a', border: '1px solid #ff4444', borderRadius: 8, padding: '12px 16px', color: '#ff8888', marginBottom: 18, fontSize: 13 },
  loading: { color: '#555', fontSize: 14, padding: '48px 0', textAlign: 'center' },
  // tabla
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 12px', color: '#555', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #2a2a2a' },
  thR: { textAlign: 'right', padding: '8px 12px', color: '#555', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #2a2a2a' },
  td: { padding: '8px 12px', borderBottom: '1px solid #222', color: '#ccc' },
  tdR: { padding: '8px 12px', borderBottom: '1px solid #222', color: '#ccc', textAlign: 'right' },
};

// Colores celda €/litro
function colorEurL(epl, sinTicket) {
  if (sinTicket) return '#f59e0b';
  if (epl === null || epl === undefined) return '#f59e0b';
  if (epl > 1.6) return '#ff6b6b';
  return '#ccc';
}

// Colores fila km desviación
function rowStyleKm(pct) {
  const abs = Math.abs(pct);
  if (abs > 10) return { background: 'rgba(255,80,80,0.08)' };
  if (abs > 5)  return { background: 'rgba(245,158,11,0.08)' };
  return {};
}
function colorPct(pct) {
  const abs = Math.abs(pct);
  if (abs > 10) return '#ff6b6b';
  if (abs > 5)  return '#f59e0b';
  return '#4dcc7a';
}

export default function DashboardFlota() {
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta]  = useState(hoy());
  const [gasoil, setGasoil] = useState(null);
  const [kmDev,  setKmDev]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const cargarDatos = useCallback(async () => {
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    try {
      const [g, k] = await Promise.all([
        getGasoilResumen(desde, hasta),
        getKmDesviacion(desde, hasta),
      ]);
      setGasoil(g); setKmDev(k);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const presets = getPresets();
  const activePreset = presets.find(p => p.desde === desde && p.hasta === hasta)?.label;

  const g  = gasoil?.global  || {};
  const k  = kmDev?.global   || {};
  const pc = gasoil?.porConductor || [];
  const km = kmDev?.porChoferMatricula || [];

  // Datos gráfico barras por conductor
  const chartData = pc.slice(0, 12).map(c => ({
    name: c.conductor.split(' ')[0], // solo primer apellido para que quepa
    Litros: c.total_litros,
    Euros:  c.total_importe,
  }));

  return (
    <div className="page-root" style={S.root}>
      {/* ── SELECTOR DE RANGO ── */}
      <div className="rango-bar">
        <span style={S.rangoLabel}>Desde</span>
        <input type="date" style={S.dateInput} value={desde} max={hasta} onChange={e => setDesde(e.target.value)} />
        <span style={S.rangoLabel}>hasta</span>
        <input type="date" style={S.dateInput} value={hasta} min={desde} max={hoy()} onChange={e => setHasta(e.target.value)} />
        <span style={{ width: 8 }} />
        {presets.map(p => (
          <button key={p.label}
            style={{ ...S.btnPreset, ...(activePreset === p.label ? S.btnPresetActive : {}) }}
            onClick={() => { setDesde(p.desde); setHasta(p.hasta); }}>
            {p.label}
          </button>
        ))}
      </div>

      {error   && <div style={S.error}>Error: {error}</div>}
      {loading && <div style={S.loading}>Cargando datos de flota…</div>}

      {!loading && gasoil && kmDev && (
        <>
          {/* ── SECCIÓN 1: KPIs resumen ── */}
          <div style={S.sectionBlock}>
            <div style={S.sectionHeader}>Gasoil — {fmtRango(desde, hasta)}</div>
            <div className="kpi-row">
              <KPICard label="Total litros" value={fmtNum(g.total_litros, ' L')} sub="Gasoil + frío" theme="blue" />
              <KPICard label="Total euros" value={fmtEur(g.total_importe)} sub="Con ticket" theme="white" />
              <KPICard label="Precio medio €/L" value={fmtEur2(g.euros_por_litro_medio)} sub="Sobre repostajes con ticket" theme="white" />
              <KPICard label="Nº repostajes" value={g.num_repostajes ?? '—'} sub="En el rango" theme="gray" />
            </div>
            <div className="kpi-row" style={{ marginTop: 12 }}>
              <KPICard label="Desviación km total" value={fmtDesv(k.desviacion_km_total, ' km')} sub="Tacógrafo − Google Maps"
                forceGreen={k.desviacion_km_total < 0} forceRed={k.desviacion_km_total > 0} />
              <KPICard label="Desviación km media" value={fmtDesv(k.desviacion_km_media, ' km')} sub="Por ruta — tacógrafo vs enrutamiento"
                forceGreen={k.desviacion_km_media < 0} forceRed={k.desviacion_km_media > 0} />
              <KPICard label="Rutas analizadas" value={k.num_rutas ?? '—'} sub="Con km Google y tacógrafo" theme="gray" />
              <div style={{ flex: 1 }} />
            </div>
          </div>

          {/* ── SECCIÓN 2: Ranking conductores (gasoil) ── */}
          <div style={S.sectionBlock}>
            <div style={S.sectionHeader}>Ranking por conductor · gasoil</div>
            <div style={{ background: '#202020', borderRadius: 12, padding: '4px 0', overflowX: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Conductor</th>
                    <th style={S.thR}>Repostajes</th>
                    <th style={S.thR}>Litros</th>
                    <th style={S.thR}>Euros</th>
                    <th style={S.thR}>€/litro</th>
                    <th style={S.thR}>Último repostaje</th>
                  </tr>
                </thead>
                <tbody>
                  {pc.map((c, i) => {
                    const sinTicket = c.num_sin_ticket > 0 && c.total_importe === 0;
                    const epl = c.euros_por_litro_medio;
                    const eplColor = colorEurL(epl, sinTicket);
                    return (
                      <tr key={i}>
                        <td style={S.td}>{c.conductor}</td>
                        <td style={S.tdR}>{c.num_repostajes}</td>
                        <td style={S.tdR}>{fmtNum(c.total_litros, ' L')}</td>
                        <td style={S.tdR}>{c.total_importe > 0 ? fmtEur(c.total_importe) : <span style={{ color: '#f59e0b' }}>sin ticket</span>}</td>
                        <td style={{ ...S.tdR, color: eplColor, fontWeight: epl > 1.6 ? 700 : 400 }}>
                          {sinTicket || epl === null
                            ? <span style={{ color: '#f59e0b', fontSize: 11 }}>sin ticket</span>
                            : fmtEur2(epl)
                          }
                          {epl > 1.6 && <span style={{ marginLeft: 6, fontSize: 10 }}>⚠</span>}
                        </td>
                        <td style={S.tdR}>{fmtFecha(c.fecha_ultimo_repostaje)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── SECCIÓN 3: Desviación km por conductor/matrícula ── */}
          <div style={S.sectionBlock}>
            <div style={S.sectionHeader}>Desviación km por conductor y matrícula</div>
            <div style={{ background: '#202020', borderRadius: 12, padding: '4px 0', overflowX: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Conductor</th>
                    <th style={S.th}>Matrícula</th>
                    <th style={S.thR}>Rutas</th>
                    <th style={S.thR}>Km Google</th>
                    <th style={S.thR}>Km Tacógrafo</th>
                    <th style={S.thR}>Desv. km</th>
                    <th style={S.thR}>Desv. %</th>
                  </tr>
                </thead>
                <tbody>
                  {km.map((r, i) => (
                    <tr key={i} style={rowStyleKm(r.desviacion_pct)}>
                      <td style={S.td}>{r.chofer}</td>
                      <td style={S.td}>{r.matricula}</td>
                      <td style={S.tdR}>{r.num_rutas}</td>
                      <td style={S.tdR}>{fmtNum1(r.km_google_total, ' km')}</td>
                      <td style={S.tdR}>{fmtNum1(r.km_tacografo_total, ' km')}</td>
                      <td style={{ ...S.tdR, color: colorPct(r.desviacion_pct) }}>{fmtDesv(r.desviacion_total, ' km')}</td>
                      <td style={{ ...S.tdR, color: colorPct(r.desviacion_pct), fontWeight: Math.abs(r.desviacion_pct) > 10 ? 700 : 400 }}>
                        {fmtDesv(r.desviacion_pct, '%')}
                        {Math.abs(r.desviacion_pct) > 10 && <span style={{ marginLeft: 5, fontSize: 10 }}>⚠</span>}
                      </td>
                    </tr>
                  ))}
                  {km.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#555', padding: '24px' }}>
                        Sin datos de km en el rango seleccionado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: '#444', marginTop: 6, paddingLeft: 4 }}>
              Rojo: desv. &gt; 10% · Naranja: 5–10% · Verde: &lt; 5%
            </div>
          </div>

          {/* ── SECCIÓN 4: Gráfico barras por conductor ── */}
          {chartData.length > 0 && (
            <div className="chart-box" style={S.chartBox}>
              <div style={S.chartTitle}>Litros y euros por conductor — {fmtRango(desde, hasta)}</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 10, right: 60, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#777', fontSize: 11 }} axisLine={{ stroke: '#2e2e2e' }} tickLine={false} />
                  <YAxis yAxisId="left" orientation="left"
                    tick={{ fill: '#4da6ff', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${Math.round(v)}L`} width={48} />
                  <YAxis yAxisId="right" orientation="right"
                    tick={{ fill: '#f59e0b', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${Math.round(v / 1000)}k€`} width={48} />
                  <Tooltip
                    contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8 }}
                    labelStyle={{ color: '#ccc' }}
                    formatter={(v, name) => name === 'Litros' ? [`${fmtNum(v)} L`, 'Litros'] : [fmtEur(v), 'Euros']}
                  />
                  <Legend wrapperStyle={{ color: '#777', fontSize: 12, paddingTop: 8 }} />
                  <Bar yAxisId="left"  dataKey="Litros" fill="#4da6ff" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar yAxisId="right" dataKey="Euros"  fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>
                Eje izq. (azul): litros · Eje dcha. (naranja): euros · Muestra hasta 12 conductores
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
