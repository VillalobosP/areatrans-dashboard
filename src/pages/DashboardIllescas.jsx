import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend, Sector,
} from 'recharts';
import KPICard from '../components/KPICard';
import { getFacturacion, getGasoilResumen } from '../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
function hoy() { return new Date().toISOString().slice(0, 10); }
function primerDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function fmtEur(n) {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function fmtEur2(n) {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
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
function fmtDia(fecha) {
  if (!fecha) return '';
  const [, m, d] = fecha.split('-');
  const meses = ['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d, 10)} ${meses[parseInt(m, 10)]}`;
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

const PALETTE = [
  '#4da6ff','#f59e0b','#34d399','#a78bfa','#fb7185',
  '#38bdf8','#fbbf24','#4ade80','#c084fc','#f87171',
];

const S = {
  root: { padding: '22px 28px' },
  sectionHeader: {
    fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.1em',
    textTransform: 'uppercase', marginBottom: 10,
    borderLeft: '3px solid #333', paddingLeft: 8, marginTop: 0,
  },
  block: { marginBottom: 20 },
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

// ── Tooltip diario ─────────────────────────────────────────────────────────────
const TooltipDia = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div style={{ background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 8, padding: '10px 14px', fontSize: 12, minWidth: 160 }}>
      <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#ccc' }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ margin: '2px 0', color: p.fill }}>
          Lote {p.name.replace('lote_', '')}: <strong style={{ color: '#fff' }}>{fmtEur(p.value)}</strong>
        </p>
      ))}
      <p style={{ margin: '6px 0 0', borderTop: '1px solid #2a2a2a', paddingTop: 5, color: '#aaa', fontWeight: 700 }}>
        Total: {fmtEur(total)}
      </p>
    </div>
  );
};

// ── Tooltip donut ──────────────────────────────────────────────────────────────
const TooltipDonut = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{ background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ margin: 0, color: p.payload.fill, fontWeight: 700 }}>Lote {p.name}</p>
      <p style={{ margin: '4px 0 0', color: '#fff' }}>{fmtEur(p.value)} · {p.payload.pct}%</p>
      <p style={{ margin: '2px 0 0', color: '#777' }}>{p.payload.viajes} viajes</p>
    </div>
  );
};

export default function DashboardIllescas({ centro }) {
  const [desde, setDesde]       = useState(primerDiaMes());
  const [hasta, setHasta]       = useState(hoy());
  const [charts, setCharts]     = useState(null);
  const [gasoil, setGasoil]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [activePie, setActivePie] = useState(null);

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

  const presets      = getPresets();
  const activePreset = presets.find(p => p.desde === desde && p.hasta === hasta)?.label;

  const lotes      = charts?.porLote    || [];
  const porDia     = charts?.porDia     || [];
  const porDiaLote = charts?.porDiaLote || [];
  const totalFac   = lotes.reduce((s, l) => s + l.total, 0);
  const totalVia   = lotes.reduce((s, l) => s + l.viajes, 0);

  // Datos para el donut
  const donutData = lotes.map((l, i) => ({
    name:   l.lote,
    value:  Math.round(l.total),
    viajes: l.viajes,
    pct:    totalFac > 0 ? (l.total / totalFac * 100).toFixed(1) : '0',
    fill:   PALETTE[i % PALETTE.length],
  }));

  // Datos para el gráfico diario apilado por lote
  const lotesKeys = lotes.map(l => `lote_${l.lote}`);
  const dataDia = porDiaLote.map(d => ({
    label: fmtDia(d.fecha),
    ...Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'fecha')),
  }));

  const muchos = dataDia.length > 18;

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

      {!loading && charts && lotes.length === 0 && (
        <div style={{ color: '#555', fontSize: 14, padding: '48px 0', textAlign: 'center' }}>
          No hay datos en el rango seleccionado
        </div>
      )}

      {!loading && charts && lotes.length > 0 && (
        <>
          {/* ── KPIs globales ── */}
          <div style={S.block}>
            <div style={S.sectionHeader}>Acumulado — {fmtRango(desde, hasta)}</div>
            <div className="kpi-row">
              <KPICard label="Facturación total"  value={fmtEur(totalFac)}  sub={`${totalVia} viajes en total`}            theme="blue" big borderAccent="#4da6ff" />
              <KPICard label="Lotes activos"       value={lotes.length}       sub="Con actividad en el rango"                 theme="white" />
              <KPICard label="Media por viaje"     value={fmtEur2(totalVia > 0 ? totalFac / totalVia : null)} sub="Precio medio del rango" theme="gray" />
              <KPICard label="Días con actividad"  value={porDia.filter(d => (d.total || 0) > 0).length} sub="Días operativos en el rango" theme="gray" />
            </div>
          </div>

          {/* ── Gráficos: donut + barras por lote ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>

            {/* Donut distribución por lote */}
            <div style={S.chartBox}>
              <div style={S.chartTitle}>Distribución por lote</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={95}
                    paddingAngle={2}
                    activeIndex={activePie}
                    activeShape={props => {
                      const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                      return (
                        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8}
                          startAngle={startAngle} endAngle={endAngle} fill={fill} />
                      );
                    }}
                    onMouseEnter={(_, i) => setActivePie(i)}
                    onMouseLeave={() => setActivePie(null)}
                  >
                    {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<TooltipDonut />} />
                  <Legend
                    formatter={(val) => `Lote ${val}`}
                    wrapperStyle={{ fontSize: 11, color: '#888' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Barras horizontales por lote */}
            <div style={S.chartBox}>
              <div style={S.chartTitle}>Facturación por lote</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={lotes.map((l, i) => ({ name: `Lote ${l.lote}`, total: Math.round(l.total), viajes: l.viajes, fill: PALETTE[i % PALETTE.length] }))}
                  layout="vertical"
                  margin={{ top: 0, right: 70, left: 60, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#777', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#aaa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v, name, props) => [`${fmtEur(v)}  (${props.payload.viajes} viajes)`, 'Facturación']}
                    contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8 }}
                    labelStyle={{ color: '#ccc' }} itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={26}>
                    {lotes.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Gráfico diario apilado por lote ── */}
          {dataDia.length > 0 && (
            <div style={S.chartBox}>
              <div style={S.chartTitle}>Facturación diaria por lote — {fmtRango(desde, hasta)}</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dataDia} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#777', fontSize: 11 }} axisLine={{ stroke: '#2e2e2e' }} tickLine={false}
                    interval={0} angle={muchos ? -45 : 0} textAnchor={muchos ? 'end' : 'middle'} height={muchos ? 50 : 28} />
                  <YAxis tick={{ fill: '#777', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${Math.round(v / 1000)}k`} width={40} />
                  <Tooltip content={<TooltipDia />} />
                  <Legend formatter={val => `Lote ${val.replace('lote_', '')}`} wrapperStyle={{ fontSize: 11, color: '#777', paddingTop: 8 }} />
                  {lotesKeys.map((key, i) => (
                    <Bar key={key} dataKey={key} stackId="lotes" fill={PALETTE[i % PALETTE.length]}
                      radius={i === lotesKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={40} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Gasoil ── */}
          {gasoil && (
            <div style={S.block}>
              <div style={S.sectionHeader}>Gasoil — {fmtRango(desde, hasta)}</div>
              <div className="kpi-row">
                <KPICard label="Litros gasoil"  value={fmtNum(gasoil.total_litros_gasoil)} sub="Gasoil"        theme="white" />
                <KPICard label="Litros frío"     value={fmtNum(gasoil.total_litros_frio)}   sub="Frío"          theme="white" />
                <KPICard label="Importe total"   value={fmtEur(gasoil.total_importe)}        sub="Gasoil + frío" theme="blue" borderAccent="#4da6ff" />
                <KPICard label="€/litro medio"   value={gasoil.euros_por_litro_medio != null ? `${gasoil.euros_por_litro_medio.toFixed(3)} €` : '—'} sub="Precio medio" theme="gray" />
                <KPICard label="Repostajes"      value={gasoil.num_repostajes}               sub="En el rango"   theme="gray" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
