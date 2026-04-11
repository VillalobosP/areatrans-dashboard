import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import KPICard from '../components/KPICard';
import { getFacturacion, getGasoilResumen } from '../services/api';

function hoy() { return new Date().toISOString().slice(0, 10); }
function primerDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function fmtEur(n) {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function fmtNum(n) {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n);
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

const COLORS = ['#4da6ff', '#7ec8ff', '#a8daff', '#1e7fd4', '#0d5fa8', '#4da6ff', '#b3d9ff', '#63b3f7'];

const S = {
  root: { padding: '22px 28px' },
  sectionHeader: {
    fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.1em',
    textTransform: 'uppercase', marginBottom: 10, borderLeft: '3px solid #333', paddingLeft: 8,
  },
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
  error:   { background: '#3a1a1a', border: '1px solid #ff4444', borderRadius: 8, padding: '12px 16px', color: '#ff8888', marginBottom: 18, fontSize: 13 },
  loading: { color: '#555', fontSize: 14, padding: '48px 0', textAlign: 'center' },
  rangoLabel: { fontSize: 13, color: '#888' },
};

// ── Tarjeta de lote ────────────────────────────────────────────────────────────
function LoteCard({ lote, total, viajes }) {
  return (
    <div style={{
      background: '#202020', border: '1px solid #2a2a2a', borderRadius: 12,
      padding: '18px 22px', minWidth: 200, flex: '1 1 200px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Lote {lote}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#4da6ff', letterSpacing: '-0.02em' }}>
        {fmtEur(total)}
      </div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
        {viajes} {viajes === 1 ? 'viaje' : 'viajes'}
      </div>
    </div>
  );
}

export default function DashboardIllescas({ centro }) {
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoy());
  const [charts, setCharts]     = useState(null);
  const [gasoil, setGasoil]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const cargarDatos = useCallback(async () => {
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    try {
      const [ch, gas] = await Promise.all([
        getFacturacion(centro, desde, hasta),
        getGasoilResumen(centro, desde, hasta),
      ]);
      setCharts(ch);
      setGasoil(gas);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [centro, desde, hasta]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const presets = getPresets();
  const activePreset = presets.find(p => p.desde === desde && p.hasta === hasta)?.label;

  const lotes    = charts?.porLote || [];
  const totalFac = lotes.reduce((s, l) => s + l.total, 0);
  const totalVia = lotes.reduce((s, l) => s + l.viajes, 0);

  return (
    <div style={S.root}>

      {/* ── Selector de rango ── */}
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

      {error && <div style={S.error}>Error: {error}</div>}
      {loading && <div style={S.loading}>Cargando datos de Illescas…</div>}

      {!loading && charts && (
        <>
          {/* ── KPIs globales ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={S.sectionHeader}>Acumulado en el rango — {fmtRango(desde, hasta)}</div>
            <div className="kpi-row">
              <KPICard label="Facturación total" value={fmtEur(totalFac)} sub={`${totalVia} viajes en total`} theme="blue" big borderAccent="#4da6ff" />
              <KPICard label="Lotes activos" value={lotes.length} sub="Con actividad en el rango" theme="white" />
              <KPICard label="Media por viaje" value={fmtEur(totalVia > 0 ? totalFac / totalVia : null)} sub="Precio medio del rango" theme="gray" />
              <div style={{ flex: 2 }} />
            </div>
          </div>

          {/* ── Tarjetas por lote ── */}
          {lotes.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={S.sectionHeader}>Facturación por lote</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {lotes.map(l => (
                  <LoteCard key={l.lote} lote={l.lote} total={l.total} viajes={l.viajes} />
                ))}
              </div>
            </div>
          )}

          {/* ── Gráfico de barras por lote ── */}
          {lotes.length > 0 && (
            <div style={S.chartBox}>
              <div style={S.chartTitle}>Facturación por lote — {fmtRango(desde, hasta)}</div>
              <ResponsiveContainer width="100%" height={Math.max(160, lotes.length * 42)}>
                <BarChart
                  data={lotes.map(l => ({ name: `Lote ${l.lote}`, total: Math.round(l.total), viajes: l.viajes }))}
                  layout="vertical"
                  margin={{ top: 0, right: 80, left: 70, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#777', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#aaa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v, name, props) => [`${fmtEur(v)}  (${props.payload.viajes} viajes)`, 'Facturación']}
                    contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8 }}
                    labelStyle={{ color: '#ccc' }} itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="total" name="Facturación" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {lotes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Gasoil ── */}
          {gasoil && (
            <div style={{ marginBottom: 18 }}>
              <div style={S.sectionHeader}>Gasoil — {fmtRango(desde, hasta)}</div>
              <div className="kpi-row">
                <KPICard label="Total litros"    value={fmtNum(gasoil.total_litros_gasoil)}   sub="Gasoil"           theme="white" />
                <KPICard label="Total litros"    value={fmtNum(gasoil.total_litros_frio)}      sub="Frío"             theme="white" />
                <KPICard label="Importe total"   value={fmtEur(gasoil.total_importe)}          sub="Gasoil + frío"    theme="blue" borderAccent="#4da6ff" />
                <KPICard label="€/litro medio"   value={gasoil.euros_por_litro_medio != null ? `${gasoil.euros_por_litro_medio.toFixed(3)} €` : '—'} sub="Precio medio" theme="gray" />
                <KPICard label="Repostajes"      value={gasoil.num_repostajes}                 sub="En el rango"      theme="gray" />
              </div>
            </div>
          )}
        </>
      )}

      {!loading && charts && lotes.length === 0 && (
        <div style={{ color: '#555', fontSize: 14, padding: '48px 0', textAlign: 'center' }}>
          No hay datos de facturación en el rango seleccionado
        </div>
      )}
    </div>
  );
}
