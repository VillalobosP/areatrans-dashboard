import React, { useState, useEffect, useCallback } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import KPICard from '../components/KPICard';
import { getFacturacion, getFacturacionResumen } from '../services/api';

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
  if (n === undefined || n === null || n === '—') return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function fmtEur2(n) {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDesv(n) {
  if (n === undefined || n === null) return '—';
  const s = fmtEur(Math.abs(n));
  return n >= 0 ? `+${s}` : `-${s}`;
}
function proyeccionStatus(proy, obj225, obj250) {
  if (proy === undefined || proy === null) return null;
  if (proy >= obj250) return { text: '✓ Por encima del objetivo', color: '#4dcc7a' };
  if (proy >= obj225) return { text: '▲ Por encima del mínimo', color: '#4dcc7a' };
  return { text: '▼ Por debajo del mínimo', color: '#ff6b6b' };
}
function getPresets() {
  const h = hoy(); const p = primerDiaMes();
  const semAtr = new Date(); semAtr.setDate(semAtr.getDate() - 6);
  const quince = new Date(); quince.setDate(quince.getDate() - 14);
  return [
    { label: 'Esta semana', desde: semAtr.toISOString().slice(0, 10), hasta: h },
    { label: 'Quincena', desde: quince.toISOString().slice(0, 10), hasta: h },
    { label: 'Mes actual', desde: p, hasta: h },
  ];
}

const CustomTooltipDia = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fff', minWidth: 180 }}>
      <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#ccc', fontSize: 12 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ margin: '3px 0', color: p.color }}>
          {p.name}: <strong style={{ color: '#fff' }}>{fmtEur(p.value)}</strong>
        </p>
      ))}
    </div>
  );
};

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
  chartLegend: { fontSize: 11, color: '#555', marginTop: 6 },
  error: { background: '#3a1a1a', border: '1px solid #ff4444', borderRadius: 8, padding: '12px 16px', color: '#ff8888', marginBottom: 18, fontSize: 13 },
  loading: { color: '#555', fontSize: 14, padding: '48px 0', textAlign: 'center' },
};

const COLORS_BAR = ['#4da6ff', '#7ec8ff', '#a8daff', '#1e7fd4', '#0d5fa8', '#4da6ff'];

export default function DashboardFacturacion() {
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoy());
  const [resumen, setResumen] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cargarDatos = useCallback(async () => {
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    try {
      const [res, ch] = await Promise.all([
        getFacturacionResumen(desde, hasta),
        getFacturacion(desde, hasta),
      ]);
      setResumen(res); setCharts(ch);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const presets = getPresets();
  const activePreset = presets.find(p => p.desde === desde && p.hasta === hasta)?.label;
  const r = resumen || {};

  const pStatus = proyeccionStatus(r.proyeccion_cierre_euros, r.obj_min_225, r.obj_media_225);

  // Datos gráfico diario con ritmos de referencia
  const dataDia = (charts?.porDia || []).map(d => {
    const [, m, day] = (d.fecha || '').split('-');
    const meses = ['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return {
      label: `${parseInt(day, 10)} ${meses[parseInt(m, 10)]}`,
      Planificada: Math.round(d.planificada),
      Extra: Math.round(d.extra),
    };
  });

  return (
    <div className="page-root" style={S.root}>
      {/* Selector de rango */}
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
      {loading && <div style={S.loading}>Cargando datos de facturación…</div>}

      {!loading && resumen && (
        <>
          {/* ── BLOQUE A: Acumulado en el rango ── */}
          <div style={S.sectionBlock}>
            <div style={S.sectionHeader}>Acumulado en el rango — {fmtRango(desde, hasta)}</div>
            <div className="kpi-row">
              <KPICard label="Facturación total" value={fmtEur(r.fact_total)} sub="Planificada + Extra" theme="blue" big borderAccent="#4da6ff" />
              <KPICard label="Fact. planificada" value={fmtEur(r.fact_planificada)} sub={`${r.num_viajes_planificados ?? '—'} viajes planificados`} theme="white" />
              <KPICard label="Fact. extra" value={fmtEur(r.fact_extra)} sub={`${r.porcentaje_extra ?? '—'}% del total`} theme="white" />
              <KPICard label="Precio mínimo/viaje" value={fmtEur2(r.precio_minimo)} sub="Viaje más barato del rango" theme="gray" />
              <KPICard label="Precio medio/viaje" value={fmtEur2(r.precio_medio)} sub="Media por viaje planificado" theme="gray" />
            </div>
            <div className="kpi-row" style={{ marginTop: 12 }}>
              <KPICard label="Fact. media diaria" value={fmtEur(r.fact_media_diaria)} sub="Euros/día en el rango" theme="white" />
              <KPICard label="% Facturación extra" value={`${r.porcentaje_extra ?? '—'}%`} sub="Sobre facturación total" theme="white" />
              <div style={{ flex: 3 }} />
            </div>
          </div>

          {/* ── BLOQUE B: Proyección cierre de mes ── */}
          <div style={S.sectionBlock}>
            <div style={S.sectionHeader}>Proyección cierre de mes</div>
            <div className="kpi-row">
              <KPICard
                label="Proyección fin de mes (€)"
                value={r.proyeccion_cierre_euros !== undefined ? fmtEur(Math.round(r.proyeccion_cierre_euros)) : '—'}
                sub={`A ritmo actual · ${r.dias_operativos_restantes ?? '—'} días op. restantes`}
                theme="blueSoft" big borderAccent="#4fc3f7"
                statusText={pStatus?.text} statusColor={pStatus?.color}
              />
              <KPICard label="Objetivo mensual conservador" value={fmtEur(r.obj_min_225)} sub={`225 viajes × ${fmtEur2(r.precio_minimo)}`} theme="gray" />
              <KPICard label="Objetivo mensual realista" value={fmtEur(r.obj_media_225)} sub={`225 viajes × ${fmtEur2(r.precio_medio)}`} theme="gray" />
              <KPICard label="Objetivo máximo conservador" value={fmtEur(r.obj_min_250)} sub={`250 viajes × ${fmtEur2(r.precio_minimo)}`} theme="gray" />
              <KPICard label="Objetivo máximo realista" value={fmtEur(r.obj_media_250)} sub={`250 viajes × ${fmtEur2(r.precio_medio)}`} theme="gray" />
            </div>
          </div>

          {/* ── ESCENARIO MENSUAL CONSERVADOR ── */}
          <div style={S.sectionBlock}>
            <div style={S.sectionHeader}>Escenario mensual conservador · precio mínimo por viaje ({fmtEur2(r.precio_minimo)})</div>
            <div className="kpi-row">
              <KPICard label="Objetivo 225 viajes" value={fmtEur(r.obj_min_225)} sub={`${fmtEur2(r.precio_minimo)} × 225`} theme="gray" />
              <KPICard label="Objetivo 250 viajes" value={fmtEur(r.obj_min_250)} sub={`${fmtEur2(r.precio_minimo)} × 250`} theme="gray" />
              <KPICard label="Gap vs escenario mensual 225" value={fmtDesv(r.desv_min_225)}
                sub="Fact. planificada vs objetivo conservador 225"
                forceGreen={r.desv_min_225 >= 0} forceRed={r.desv_min_225 < 0} />
              <KPICard label="Gap vs escenario mensual 250" value={fmtDesv(r.desv_min_250)}
                sub="Fact. planificada vs objetivo conservador 250"
                forceGreen={r.desv_min_250 >= 0} forceRed={r.desv_min_250 < 0} />
            </div>
          </div>

          {/* ── ESCENARIO MENSUAL REALISTA ── */}
          <div style={S.sectionBlock}>
            <div style={S.sectionHeader}>Escenario mensual realista · precio medio por viaje ({fmtEur2(r.precio_medio)})</div>
            <div className="kpi-row">
              <KPICard label="Objetivo 225 viajes" value={fmtEur(r.obj_media_225)} sub={`${fmtEur2(r.precio_medio)} × 225`} theme="gray" />
              <KPICard label="Objetivo 250 viajes" value={fmtEur(r.obj_media_250)} sub={`${fmtEur2(r.precio_medio)} × 250`} theme="gray" />
              <KPICard label="Gap vs escenario mensual 225" value={fmtDesv(r.desv_media_225)}
                sub="Fact. planificada vs objetivo realista 225"
                forceGreen={r.desv_media_225 >= 0} forceRed={r.desv_media_225 < 0} />
              <KPICard label="Gap vs escenario mensual 250" value={fmtDesv(r.desv_media_250)}
                sub="Fact. planificada vs objetivo realista 250"
                forceGreen={r.desv_media_250 >= 0} forceRed={r.desv_media_250 < 0} />
            </div>
          </div>

          {/* ── GRÁFICO DIARIO ── */}
          <div className="chart-box" style={S.chartBox}>
            <div style={S.chartTitle}>Facturación diaria — {fmtRango(desde, hasta)}</div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={dataDia} margin={{ top: 16, right: 16, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#777', fontSize: 11 }} axisLine={{ stroke: '#2e2e2e' }} tickLine={false}
                  interval={0} angle={dataDia.length > 15 ? -45 : 0} textAnchor={dataDia.length > 15 ? 'end' : 'middle'}
                  height={dataDia.length > 15 ? 48 : 28} />
                <YAxis tick={{ fill: '#777', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${Math.round(v / 1000)}k`} width={40} />
                <Tooltip content={<CustomTooltipDia />} />
                <Legend wrapperStyle={{ color: '#777', fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="Planificada" stackId="a" fill="#4da6ff" radius={[0, 0, 0, 0]} maxBarSize={44} />
                <Bar dataKey="Extra" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={44} />
                {r.ritmo_diario_225 > 0 && (
                  <ReferenceLine y={r.ritmo_diario_225} stroke="#ff9d4d" strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: 'Ritmo 225', position: 'insideTopRight', fill: '#ff9d4d', fontSize: 10 }} />
                )}
                {r.ritmo_diario_250 > 0 && (
                  <ReferenceLine y={r.ritmo_diario_250} stroke="#b97dff" strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: 'Ritmo 250', position: 'insideTopRight', fill: '#b97dff', fontSize: 10, dy: 14 }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            <div style={S.chartLegend}>
              Barras azules: fact. planificada · Naranja: fact. extra · Línea naranja: ritmo diario necesario para 225 · Línea morada: ritmo para 250
            </div>
          </div>

          {/* ── GRÁFICOS POR FACTURADOR Y MATRÍCULA ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 14 }}>
            {/* Por facturador */}
            <div className="chart-box" style={{ ...S.chartBox, marginBottom: 0 }}>
              <div style={S.chartTitle}>Facturación planificada por facturador</div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart
                  data={(charts?.porFacturador || []).map(d => ({ name: d.facturador, total: Math.round(d.total) }))}
                  layout="vertical" margin={{ top: 0, right: 16, left: 80, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#777', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#aaa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => fmtEur(v)} contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8 }} labelStyle={{ color: '#ccc' }} itemStyle={{ color: '#fff' }} />
                  <Bar dataKey="total" name="Facturación" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {(charts?.porFacturador || []).map((_, i) => (
                      <Cell key={i} fill={COLORS_BAR[i % COLORS_BAR.length]} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Por matrícula — top 10 descendente */}
            <div className="chart-box" style={{ ...S.chartBox, marginBottom: 0 }}>
              <div style={S.chartTitle}>Facturación planificada por matrícula · top 10</div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart
                  data={(charts?.porMatricula || []).map(d => ({ name: d.matricula, total: Math.round(d.total) }))}
                  layout="vertical" margin={{ top: 0, right: 16, left: 70, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#777', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#aaa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => fmtEur(v)} contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8 }} labelStyle={{ color: '#ccc' }} itemStyle={{ color: '#fff' }} />
                  <Bar dataKey="total" name="Facturación" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {(charts?.porMatricula || []).map((_, i) => (
                      <Cell key={i} fill={COLORS_BAR[i % COLORS_BAR.length]} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
