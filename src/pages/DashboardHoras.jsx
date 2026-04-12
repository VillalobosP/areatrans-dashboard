import React, { useState, useEffect, useCallback } from 'react';
import KPICard from '../components/KPICard';
import { getHoras } from '../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
function hoy() { return new Date().toISOString().slice(0, 10); }
function primerDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
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
function fmtFecha(fecha) {
  if (!fecha) return '';
  const [, m, d] = fecha.split('-');
  const meses = ['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const DOW   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const dow   = DOW[new Date(fecha + 'T12:00:00').getDay()];
  return `${dow}\n${parseInt(d,10)} ${meses[parseInt(m,10)]}`;
}
function fmtHoras(h) {
  if (h === undefined || h === null || h === 0) return null;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm.toString().padStart(2,'0')}m`;
}

// ── Tipos de estado especial ───────────────────────────────────────────────────
const ESTADO_CONFIG = {
  baja:       { bg: '#1e0a2a', color: '#a78bfa', border: '#3a1a5a', label: 'BAJA',       emoji: '🏥' },
  vacaciones: { bg: '#0a1e2a', color: '#38bdf8', border: '#1a3a5a', label: 'VAC.',        emoji: '🌴' },
  permiso:    { bg: '#0a1a1a', color: '#34d399', border: '#1a3a3a', label: 'PERMISO',     emoji: '📋' },
  festivo:    { bg: '#1a1a1a', color: '#555',    border: '#2a2a2a', label: 'FESTIVO',     emoji: '🎉' },
  ausente:    { bg: '#2a0a0a', color: '#f87171', border: '#4a1a1a', label: 'AUSENTE',     emoji: '❌' },
  futuro:     { bg: '#111',    color: '#333',    border: '#1a1a1a', label: '',            emoji: ''   },
};

function colorCelda(celda) {
  if (!celda) return { bg: '#111', color: '#222', border: '#1a1a1a' };
  if (celda.estadoEspecial) return ESTADO_CONFIG[celda.estadoEspecial] || ESTADO_CONFIG.ausente;
  if (celda.esExtra)        return { bg: '#0a1a2a', color: '#4da6ff', border: '#1a3a5a' }; // azul: extra
  if (!celda.completo || celda.flags.length > 0) return { bg: '#2a1a00', color: '#f59e0b', border: '#4a3000' }; // naranja: incompleto
  const h = celda.horas;
  if (h >= 8) return { bg: '#0a2a1a', color: '#34d399', border: '#0d4a2a' };
  if (h >= 6) return { bg: '#1a2a0a', color: '#a3e635', border: '#2a4a0a' };
  if (h >= 4) return { bg: '#2a1a00', color: '#fb923c', border: '#4a2a00' };
  return         { bg: '#2a0a0a', color: '#f87171', border: '#4a1a1a' };
}

// ── Popup detalle ─────────────────────────────────────────────────────────────
function DetallePopup({ celda, empleado, fecha, onClose }) {
  if (!celda || !empleado) return null;
  const c = colorCelda(celda);
  const cfg = celda.estadoEspecial ? ESTADO_CONFIG[celda.estadoEspecial] : null;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 14,
        padding: '22px 26px', zIndex: 1000, minWidth: 300, maxWidth: 440,
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{empleado}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{fmtFecha(fecha).replace('\n', ' ')}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {/* Estado especial */}
        {cfg && cfg.label && (
          <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '12px 16px', marginBottom: 14, textAlign: 'center' }}>
            <span style={{ fontSize: 18, marginRight: 8 }}>{cfg.emoji}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
            {celda.incidenciaObs && <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{celda.incidenciaObs}</div>}
          </div>
        )}

        {/* Total horas */}
        {!celda.estadoEspecial && (
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, textAlign: 'center' }}>
            {celda.esExtra && <div style={{ fontSize: 10, color: '#4da6ff', fontWeight: 700, marginBottom: 4 }}>DÍA EXTRA</div>}
            <span style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{fmtHoras(celda.horas) || '—'}</span>
            <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>trabajadas</span>
          </div>
        )}

        {/* Pares de fichajes */}
        {celda.pares?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#555', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Fichajes</div>
            {celda.pares.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid #222' }}>
                <span style={{ fontSize: 12, color: '#34d399', fontFamily: 'monospace' }}>E {p.entrada}</span>
                <span style={{ color: '#444', fontSize: 10 }}>→</span>
                <span style={{ fontSize: 12, color: '#fb7185', fontFamily: 'monospace' }}>S {p.salida}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#aaa' }}>{fmtHoras(p.horas)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Fichajes incompletos */}
        {celda.flags?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>⚠ Fichajes incompletos</div>
            {celda.flags.map((f, i) => (
              <div key={i} style={{ fontSize: 12, color: '#f59e0b', padding: '3px 0', fontFamily: 'monospace' }}>
                {f.tipo === 'sin_salida' ? `E ${f.hora} — sin salida` : `Sin entrada — S ${f.hora}`}
              </div>
            ))}
          </div>
        )}

        {celda.incidencias?.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Incidencias</div>
            {celda.incidencias.map((inc, i) => <div key={i} style={{ fontSize: 12, color: '#c4b5fd' }}>{inc}</div>)}
          </div>
        )}
      </div>
    </>
  );
}

// ── Celda del grid ─────────────────────────────────────────────────────────────
function Celda({ celda, onClick }) {
  const c   = colorCelda(celda);
  const cfg = celda?.estadoEspecial ? ESTADO_CONFIG[celda.estadoEspecial] : null;

  let contenido;
  if (!celda) {
    contenido = <span style={{ color: '#222' }}>—</span>;
  } else if (cfg) {
    contenido = cfg.label
      ? <><span style={{ fontSize: 10 }}>{cfg.emoji}</span><span style={{ fontSize: 10, marginLeft: 2 }}>{cfg.label}</span></>
      : <span style={{ color: '#222' }}>·</span>;
  } else {
    const tieneFlag = celda.flags?.length > 0;
    contenido = (
      <>
        {celda.esExtra && <span style={{ fontSize: 8, display: 'block', color: '#4da6ff', fontWeight: 700 }}>EXTRA</span>}
        {fmtHoras(celda.horas) || (tieneFlag ? '?' : '—')}
        {tieneFlag && <span style={{ position: 'absolute', top: 2, right: 3, fontSize: 9 }}>⚠</span>}
      </>
    );
  }

  return (
    <td onClick={celda && celda.estadoEspecial !== 'futuro' ? onClick : undefined}
      style={{
        background: c.bg, color: c.color, border: `1px solid ${c.border}`,
        padding: '5px 6px', textAlign: 'center', fontSize: 11, fontWeight: 600,
        cursor: (celda && celda.estadoEspecial !== 'futuro') ? 'pointer' : 'default',
        minWidth: 68, whiteSpace: 'nowrap', position: 'relative',
      }}>
      {contenido}
    </td>
  );
}

// ── Panel de bajas (ranking) ───────────────────────────────────────────────────
function PanelIncidencias({ statsIncidencias }) {
  if (!statsIncidencias || Object.keys(statsIncidencias).length === 0) return null;

  const filas = [];
  Object.entries(statsIncidencias).forEach(([emp, tipos]) => {
    Object.entries(tipos).forEach(([tipo, stat]) => {
      filas.push({ emp, tipo, ...stat });
    });
  });
  filas.sort((a, b) => b.dias - a.dias);

  const cfg = ESTADO_CONFIG;

  return (
    <div style={{ background: '#202020', borderRadius: 12, padding: '18px 20px', marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, borderLeft: '3px solid #333', paddingLeft: 8 }}>
        Historial de incidencias
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['Empleado','Tipo','Episodios','Días totales'].map(h => (
              <th key={h} style={{ textAlign: 'left', color: '#555', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderBottom: '1px solid #2a2a2a' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const c = cfg[f.tipo] || cfg.baja;
            return (
              <tr key={i} style={{ borderBottom: '1px solid #1a1a1a' }}>
                <td style={{ padding: '7px 10px', color: '#ccc' }}>{f.emp}</td>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                    {c.emoji} {f.tipo.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '7px 10px', color: '#888', textAlign: 'center' }}>{f.episodios}</td>
                <td style={{ padding: '7px 10px', color: c.color, fontWeight: 700, textAlign: 'center' }}>{f.dias} días</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DashboardHoras({ centro }) {
  const [desde, setDesde]     = useState(primerDiaMes());
  const [hasta, setHasta]     = useState(hoy());
  const [datos, setDatos]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [popup, setPopup]     = useState(null);

  const cargarDatos = useCallback(async () => {
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    try { setDatos(await getHoras(centro, desde, hasta)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [centro, desde, hasta]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const presets      = getPresets();
  const activePreset = presets.find(p => p.desde === desde && p.hasta === hasta)?.label;

  // KPIs
  let jornadasOk = 0, jornadasIncompletas = 0, jornadasExtra = 0, jornadasAusente = 0;
  let sumHoras = 0, countHoras = 0;
  if (datos) {
    datos.empleados.forEach(emp => {
      datos.dias.forEach(dia => {
        const c = datos.data[emp]?.[dia];
        if (!c || c.estadoEspecial === 'futuro' || c.estadoEspecial === 'festivo') return;
        if (c.estadoEspecial === 'ausente') { jornadasAusente++; return; }
        if (c.estadoEspecial) return; // baja, vacaciones, permiso — no cuentan
        if (c.flags?.length > 0) { jornadasIncompletas++; return; }
        if (c.esExtra) { jornadasExtra++; }
        if (c.horas >= 8) jornadasOk++;
        sumHoras += c.horas;
        countHoras++;
      });
    });
  }

  const popupCelda = popup ? datos?.data?.[popup.empleado]?.[popup.fecha] : null;

  const S = {
    dateInput: { background: '#2a2a2a', border: '1px solid #444', borderRadius: 7, color: '#fff', fontSize: 14, padding: '7px 12px', outline: 'none', cursor: 'pointer', colorScheme: 'dark' },
    btnPreset: { background: '#2a2a2a', border: '1px solid #444', borderRadius: 7, color: '#bbb', fontSize: 12, padding: '7px 12px', cursor: 'pointer' },
    btnPresetActive: { background: '#1e3a5f', border: '1px solid #4da6ff', color: '#4da6ff' },
  };

  return (
    <div style={{ padding: '22px 28px' }}>

      {/* ── Rango ── */}
      <div className="rango-bar">
        <span style={{ fontSize: 13, color: '#888' }}>Desde</span>
        <input type="date" style={S.dateInput} value={desde} max={hasta} onChange={e => setDesde(e.target.value)} />
        <span style={{ fontSize: 13, color: '#888' }}>hasta</span>
        <input type="date" style={S.dateInput} value={hasta} min={desde} max={hoy()} onChange={e => setHasta(e.target.value)} />
        <span style={{ width: 8 }} />
        {presets.map(p => (
          <button key={p.label} style={{ ...S.btnPreset, ...(activePreset === p.label ? S.btnPresetActive : {}) }}
            onClick={() => { setDesde(p.desde); setHasta(p.hasta); }}>{p.label}</button>
        ))}
      </div>

      {error   && <div style={{ background: '#3a1a1a', border: '1px solid #ff4444', borderRadius: 8, padding: '12px 16px', color: '#ff8888', marginBottom: 18, fontSize: 13 }}>Error: {error}</div>}
      {loading && <div style={{ color: '#555', fontSize: 14, padding: '48px 0', textAlign: 'center' }}>Cargando…</div>}

      {!loading && datos && (
        <>
          {/* ── KPIs ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, borderLeft: '3px solid #333', paddingLeft: 8 }}>Resumen del rango</div>
            <div className="kpi-row">
              <KPICard label="Jornadas ≥ 8h"       value={jornadasOk}          sub="Objetivo cumplido"        theme="blue" borderAccent="#34d399" />
              <KPICard label="Fichajes incompletos"  value={jornadasIncompletas} sub="Sin entrada o sin salida" forceRed={jornadasIncompletas > 0} forceGreen={jornadasIncompletas === 0} />
              <KPICard label="Ausencias sin justif." value={jornadasAusente}     sub="Tocaba trabajar y no vino" forceRed={jornadasAusente > 0} forceGreen={jornadasAusente === 0} />
              <KPICard label="Días extra"            value={jornadasExtra}       sub="Fuera de turno asignado"  theme="white" />
              <KPICard label="Media h/jornada"       value={countHoras > 0 ? `${Math.round(sumHoras/countHoras*10)/10}h` : '—'} sub="Jornadas completas" theme="gray" />
            </div>
          </div>

          {/* ── Leyenda ── */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap', fontSize: 11, color: '#666' }}>
            <span style={{ color: '#34d399' }}>● ≥8h OK</span>
            <span style={{ color: '#a3e635' }}>● 6-8h</span>
            <span style={{ color: '#fb923c' }}>● 4-6h</span>
            <span style={{ color: '#f87171' }}>● &lt;4h</span>
            <span style={{ color: '#f59e0b' }}>⚠ Inc. fichaje</span>
            <span style={{ color: '#4da6ff' }}>● EXTRA</span>
            <span style={{ color: '#f87171' }}>❌ AUSENTE</span>
            <span style={{ color: '#a78bfa' }}>🏥 BAJA</span>
            <span style={{ color: '#38bdf8' }}>🌴 VAC.</span>
            <span style={{ color: '#555' }}>🎉 FESTIVO</span>
            <span style={{ color: '#666', marginLeft: 8 }}>Pulsa una celda para ver detalle</span>
          </div>

          {/* ── Grid ── */}
          {datos.empleados.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ background: '#111', color: '#666', padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', border: '1px solid #222', position: 'sticky', left: 0, zIndex: 2, minWidth: 190 }}>
                      Empleado
                    </th>
                    {datos.dias.map(dia => (
                      <th key={dia} style={{ background: '#111', color: '#555', padding: '5px 4px', textAlign: 'center', fontSize: 10, fontWeight: 500, border: '1px solid #222', whiteSpace: 'pre-line', minWidth: 68 }}>
                        {fmtFecha(dia)}
                      </th>
                    ))}
                    <th style={{ background: '#111', color: '#888', padding: '6px 10px', textAlign: 'center', fontSize: 11, border: '1px solid #222', minWidth: 80 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.empleados.map(emp => {
                    const horasEmp = datos.dias.reduce((s, dia) => s + (datos.data[emp]?.[dia]?.horas || 0), 0);
                    const flagsEmp = datos.dias.reduce((s, dia) => s + (datos.data[emp]?.[dia]?.flags?.length || 0), 0);
                    const bajasEmp = datos.statsIncidencias?.[emp]?.baja;
                    return (
                      <tr key={emp}>
                        <td style={{ background: '#151515', color: '#ccc', padding: '6px 14px', border: '1px solid #222', fontWeight: 500, position: 'sticky', left: 0, zIndex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {emp}
                            {bajasEmp && (
                              <span style={{ fontSize: 9, background: '#1e0a2a', color: '#a78bfa', border: '1px solid #3a1a5a', borderRadius: 4, padding: '1px 5px' }}>
                                🏥 {bajasEmp.dias}d
                              </span>
                            )}
                          </div>
                        </td>
                        {datos.dias.map(dia => (
                          <Celda key={dia} celda={datos.data[emp]?.[dia] || null}
                            onClick={() => setPopup({ empleado: emp, fecha: dia })} />
                        ))}
                        <td style={{ background: '#111', color: flagsEmp > 0 ? '#f59e0b' : '#aaa', padding: '6px 10px', textAlign: 'center', border: '1px solid #222', fontWeight: 700, fontSize: 11 }}>
                          {fmtHoras(horasEmp) || '—'}
                          {flagsEmp > 0 && <span style={{ fontSize: 9, display: 'block', color: '#f59e0b' }}>⚠ {flagsEmp}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Historial de incidencias ── */}
          <PanelIncidencias statsIncidencias={datos.statsIncidencias} />
        </>
      )}

      <DetallePopup celda={popupCelda} empleado={popup?.empleado} fecha={popup?.fecha} onClose={() => setPopup(null)} />
    </div>
  );
}
