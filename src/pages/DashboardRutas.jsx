import React, { useState, useEffect, useCallback } from 'react';
import KPICard from '../components/KPICard';
import GraficoViajes from '../components/GraficoViajes';
import { getCalendario, getResumen } from '../services/api';

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
function fmt1(n) {
  if (n === undefined || n === null) return '—';
  return (Math.round(n * 10) / 10).toFixed(1);
}
function fmtDesv1(n) {
  if (n === undefined || n === null) return '—';
  const v = (Math.round(n * 10) / 10).toFixed(1);
  return n >= 0 ? `+${v}` : v;
}
function proyeccionStatus(proy) {
  if (proy === undefined || proy === null) return null;
  if (proy >= 250) return { text: '✓ Objetivo alcanzado', color: '#4dcc7a' };
  if (proy >= 225) return { text: '▲ Por encima del mínimo', color: '#4dcc7a' };
  return { text: '▼ Por debajo del mínimo', color: '#ff6b6b' };
}
function mediaTrend(media, ritmo225) {
  if (media === undefined || ritmo225 === undefined || ritmo225 === null) return null;
  if (media >= ritmo225) return { arrow: '↑', text: 'Por encima del ritmo', color: '#4dcc7a' };
  return { arrow: '↓', text: 'Por debajo del ritmo', color: '#ff6b6b' };
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

const S = {
  root: { padding: '22px 28px' },
  sectionBlock: { marginBottom: 16 },
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
  chartBox: { background: '#202020', borderRadius: 12, padding: '20px 20px 12px', marginTop: 6 },
  chartTitle: {
    fontSize: 12, fontWeight: 600, color: '#666', letterSpacing: '0.08em',
    textTransform: 'uppercase', marginBottom: 16,
  },
  chartLegend: { fontSize: 11, color: '#555', marginTop: 6 },
  error: {
    background: '#3a1a1a', border: '1px solid #ff4444', borderRadius: 8,
    padding: '12px 16px', color: '#ff8888', marginBottom: 18, fontSize: 13,
  },
  loading: { color: '#555', fontSize: 14, padding: '48px 0', textAlign: 'center' },
};

export default function DashboardRutas() {
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoy());
  const [resumen, setResumen] = useState(null);
  const [calendario, setCalendario] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cargarDatos = useCallback(async () => {
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    try {
      const [res, cal] = await Promise.all([getResumen(desde, hasta), getCalendario(desde, hasta)]);
      setResumen(res); setCalendario(cal);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const presets = getPresets();
  const activePreset = presets.find(p => p.desde === desde && p.hasta === hasta)?.label;
  const r = resumen || {};
  const proyRedondeada = r.proyeccion_cierre !== undefined ? Math.round(r.proyeccion_cierre) : undefined;
  const pStatus = proyeccionStatus(proyRedondeada);
  const mTrend = mediaTrend(r.media_diaria_real, r.ritmo_necesario_225);

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
      {loading && <div style={S.loading}>Cargando datos…</div>}

      {!loading && resumen && (
        <>
          <div style={S.sectionBlock}>
            <div style={S.sectionHeader}>Acumulado en el rango seleccionado</div>
            <div className="kpi-row">
              <KPICard label="Viajes reales" value={r.viajes_reales ?? '—'} sub={fmtRango(desde, hasta)} theme="blue" />
              <KPICard label="Objetivo a fecha mín." value={fmt1(r.objetivo_fecha_min)} sub="Cuota 225 acumulada" theme="white" />
              <KPICard label="Objetivo a fecha" value={fmt1(r.objetivo_fecha_obj)} sub="Cuota 250 acumulada" theme="white" />
              <KPICard label="Desv. vs mínimo" value={fmtDesv1(r.desv_fecha_min)} sub="vs cuota 225 del rango"
                forceRed={r.desv_fecha_min < 0} forceGreen={r.desv_fecha_min >= 0} />
              <KPICard label="Desv. vs objetivo" value={fmtDesv1(r.desv_fecha_obj)} sub="vs cuota 250 del rango"
                forceRed={r.desv_fecha_obj < 0} forceGreen={r.desv_fecha_obj >= 0} />
            </div>
          </div>

          <div style={S.sectionBlock}>
            <div style={S.sectionHeader}>Proyección cierre de mes</div>
            <div className="kpi-row">
              <KPICard label="Objetivo mensual 225" value="225" sub="Meta mínima del mes" theme="gray" />
              <KPICard label="Objetivo mensual 250" value="250" sub="Meta objetivo del mes" theme="gray" />
              <KPICard label="Restantes para 225" value={r.faltan_225 !== undefined ? Math.ceil(r.faltan_225) : '—'}
                sub={`${r.dias_operativos_restantes ?? '—'} días op. restantes`}
                forceRed={r.faltan_225 > 0} forceGreen={r.faltan_225 === 0} />
              <KPICard label="Restantes para 250" value={r.faltan_250 !== undefined ? Math.ceil(r.faltan_250) : '—'}
                sub={`${r.dias_operativos_restantes ?? '—'} días op. restantes`}
                forceRed={r.faltan_250 > 0} forceGreen={r.faltan_250 === 0} />
              <KPICard label="Proyección cierre" value={proyRedondeada ?? '—'} sub="A ritmo actual"
                theme="blueSoft" big borderAccent="#4fc3f7"
                statusText={pStatus?.text} statusColor={pStatus?.color} />
            </div>
          </div>

          <div style={S.sectionBlock}>
            <div style={S.sectionHeader}>Ritmo</div>
            <div className="kpi-row">
              <KPICard label="Media diaria real" value={fmt1(r.media_diaria_real)} sub="Viajes/día en el rango" theme="white" trend={mTrend} />
              <KPICard label="Ritmo necesario (225)" value={r.ritmo_necesario_225 !== null ? fmt1(r.ritmo_necesario_225) : '✓'}
                sub="Viajes/día para cubrir mínimo" theme="white" forceRed={r.ritmo_necesario_225 > r.media_diaria_real} />
              <KPICard label="Ritmo necesario (250)" value={r.ritmo_necesario_250 !== null ? fmt1(r.ritmo_necesario_250) : '✓'}
                sub="Viajes/día para cubrir objetivo" theme="white" forceRed={r.ritmo_necesario_250 > r.media_diaria_real} />
              <div style={{ flex: 2 }} />
            </div>
          </div>

          <div className="chart-box" style={S.chartBox}>
            <div style={S.chartTitle}>Viajes por día operativo — {fmtRango(desde, hasta)}</div>
            <GraficoViajes calendario={calendario} />
            <div style={S.chartLegend}>
              Barras azules: viajes reales · Naranja: cuota mínima diaria · Morada: cuota objetivo diaria
            </div>
          </div>
        </>
      )}
    </div>
  );
}
