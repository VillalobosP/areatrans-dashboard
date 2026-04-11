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
  const dias  = ['','Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const meses = ['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const dow   = new Date(fecha).getDay(); // 0=Dom
  const dowLabel = dias[dow === 0 ? 7 : dow];
  return `${dowLabel} ${parseInt(d,10)} ${meses[parseInt(m,10)]}`;
}
function fmtHoras(h) {
  if (h === undefined || h === null) return null;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm.toString().padStart(2,'0')}m`;
}
function r1(n) { return Math.round(n * 10) / 10; }

// ── Colores por horas trabajadas ───────────────────────────────────────────────
function colorCelda(celda) {
  if (!celda) return { bg: '#1a1a1a', color: '#444', border: '#222' }; // Sin dato
  if (!celda.completo || celda.flags.length > 0) {
    // Fichaje incompleto → naranja
    return { bg: '#2a1a00', color: '#f59e0b', border: '#4a3000' };
  }
  const h = celda.horas;
  if (h >= 8)   return { bg: '#0a2a1a', color: '#34d399', border: '#0d4a2a' }; // Verde: cumple
  if (h >= 6)   return { bg: '#1a2a0a', color: '#a3e635', border: '#2a4a0a' }; // Amarillo-verde: casi
  if (h >= 4)   return { bg: '#2a1a00', color: '#fb923c', border: '#4a2a00' }; // Naranja: corto
  return         { bg: '#2a0a0a', color: '#f87171', border: '#4a1a1a' };        // Rojo: muy corto
}

// ── Popup detalle de fichajes de un día ────────────────────────────────────────
function DetallePopup({ celda, empleado, fecha, onClose }) {
  if (!celda || !empleado) return null;
  const c = colorCelda(celda);
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 14,
        padding: '22px 26px', zIndex: 1000, minWidth: 300, maxWidth: 420,
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{empleado}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{fmtFecha(fecha)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {/* Total */}
        <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, textAlign: 'center' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: c.color }}>
            {fmtHoras(celda.horas) || '—'}
          </span>
          <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>trabajadas</span>
        </div>

        {/* Pares de fichajes */}
        {celda.pares.length > 0 && (
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

        {/* Flags de fichajes incompletos */}
        {celda.flags.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
              ⚠ Fichajes incompletos
            </div>
            {celda.flags.map((f, i) => (
              <div key={i} style={{ fontSize: 12, color: '#f59e0b', padding: '3px 0', fontFamily: 'monospace' }}>
                {f.tipo === 'sin_salida' ? `E ${f.hora} — sin salida` : `Sin entrada — S ${f.hora}`}
              </div>
            ))}
          </div>
        )}

        {/* Incidencias */}
        {celda.incidencias?.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Incidencias</div>
            {celda.incidencias.map((inc, i) => (
              <div key={i} style={{ fontSize: 12, color: '#c4b5fd', padding: '3px 0' }}>{inc}</div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Celda del grid ─────────────────────────────────────────────────────────────
function Celda({ celda, onClick }) {
  const c = colorCelda(celda);
  const tieneFlag = celda?.flags?.length > 0;
  return (
    <td
      onClick={celda ? onClick : undefined}
      style={{
        background: c.bg, color: c.color,
        border: `1px solid ${c.border}`,
        padding: '5px 8px', textAlign: 'center',
        fontSize: 12, fontWeight: 600,
        cursor: celda ? 'pointer' : 'default',
        minWidth: 72, whiteSpace: 'nowrap',
        position: 'relative',
        transition: 'filter 0.1s',
      }}
      title={celda ? `${fmtHoras(celda.horas) || '—'}${tieneFlag ? ' ⚠ fichaje incompleto' : ''}` : '—'}
    >
      {celda ? (
        <>
          {fmtHoras(celda.horas) || '?'}
          {tieneFlag && <span style={{ position: 'absolute', top: 2, right: 3, fontSize: 9 }}>⚠</span>}
        </>
      ) : (
        <span style={{ color: '#333' }}>—</span>
      )}
    </td>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DashboardHoras({ centro }) {
  const [desde, setDesde]       = useState(primerDiaMes());
  const [hasta, setHasta]       = useState(hoy());
  const [datos, setDatos]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [popup, setPopup]       = useState(null); // { empleado, fecha }

  const cargarDatos = useCallback(async () => {
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    try {
      const d = await getHoras(centro, desde, hasta);
      setDatos(d);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [centro, desde, hasta]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const presets      = getPresets();
  const activePreset = presets.find(p => p.desde === desde && p.hasta === hasta)?.label;

  // ── KPIs globales ────────────────────────────────────────────────────────────
  let jornadasIncompletas = 0, jornadasOk = 0;
  let sumHoras = 0, countHoras = 0;

  if (datos) {
    datos.empleados.forEach(emp => {
      datos.dias.forEach(dia => {
        const c = datos.data[emp]?.[dia];
        if (!c) return;
        if (c.flags.length > 0) jornadasIncompletas++;
        else if (c.horas >= 8) jornadasOk++;
        sumHoras += c.horas;
        countHoras++;
      });
    });
  }

  const popupCelda = popup ? datos?.data?.[popup.empleado]?.[popup.fecha] : null;

  const S = {
    dateInput: {
      background: '#2a2a2a', border: '1px solid #444', borderRadius: 7, color: '#fff',
      fontSize: 14, padding: '7px 12px', outline: 'none', cursor: 'pointer', colorScheme: 'dark',
    },
    btnPreset: {
      background: '#2a2a2a', border: '1px solid #444', borderRadius: 7,
      color: '#bbb', fontSize: 12, padding: '7px 12px', cursor: 'pointer',
    },
    btnPresetActive: { background: '#1e3a5f', border: '1px solid #4da6ff', color: '#4da6ff' },
  };

  return (
    <div style={{ padding: '22px 28px' }}>

      {/* ── Selector de rango ── */}
      <div className="rango-bar">
        <span style={{ fontSize: 13, color: '#888' }}>Desde</span>
        <input type="date" style={S.dateInput} value={desde} max={hasta} onChange={e => setDesde(e.target.value)} />
        <span style={{ fontSize: 13, color: '#888' }}>hasta</span>
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

      {error && <div style={{ background: '#3a1a1a', border: '1px solid #ff4444', borderRadius: 8, padding: '12px 16px', color: '#ff8888', marginBottom: 18, fontSize: 13 }}>Error: {error}</div>}
      {loading && <div style={{ color: '#555', fontSize: 14, padding: '48px 0', textAlign: 'center' }}>Cargando horas de trabajo…</div>}

      {!loading && datos && (
        <>
          {/* ── KPIs ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, borderLeft: '3px solid #333', paddingLeft: 8 }}>
              Resumen del rango
            </div>
            <div className="kpi-row">
              <KPICard label="Empleados"          value={datos.empleados.length} sub="Con actividad en el rango" theme="white" />
              <KPICard label="Jornadas ≥ 8h"      value={jornadasOk}             sub="Objetivo cumplido"         theme="blue" borderAccent="#34d399" />
              <KPICard label="Fichajes incompletos" value={jornadasIncompletas}   sub="Sin entrada o sin salida"  forceRed={jornadasIncompletas > 0} forceGreen={jornadasIncompletas === 0} />
              <KPICard label="Media horas/jornada" value={countHoras > 0 ? `${r1(sumHoras/countHoras)}h` : '—'} sub="Sobre jornadas con datos" theme="gray" />
            </div>
          </div>

          {/* ── Leyenda ── */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap', fontSize: 11, color: '#666' }}>
            <span style={{ color: '#34d399' }}>● ≥ 8h — OK</span>
            <span style={{ color: '#a3e635' }}>● 6–8h</span>
            <span style={{ color: '#fb923c' }}>● 4–6h</span>
            <span style={{ color: '#f87171' }}>● &lt; 4h</span>
            <span style={{ color: '#f59e0b' }}>⚠ Fichaje incompleto</span>
            <span style={{ color: '#444' }}>— Sin datos</span>
            <span style={{ color: '#777', marginLeft: 8 }}>Pulsa cualquier celda para ver el detalle</span>
          </div>

          {/* ── Grid empleados × días ── */}
          {datos.empleados.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ background: '#111', color: '#666', padding: '8px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #222', position: 'sticky', left: 0, zIndex: 2, minWidth: 180 }}>
                      Empleado
                    </th>
                    {datos.dias.map(dia => (
                      <th key={dia} style={{ background: '#111', color: '#666', padding: '6px 4px', textAlign: 'center', fontWeight: 500, fontSize: 10, border: '1px solid #222', whiteSpace: 'pre-line', minWidth: 72 }}>
                        {fmtFecha(dia).replace(' ', '\n')}
                      </th>
                    ))}
                    <th style={{ background: '#111', color: '#888', padding: '6px 10px', textAlign: 'center', fontSize: 11, border: '1px solid #222', minWidth: 72 }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {datos.empleados.map(emp => {
                    const horasEmp = datos.dias.reduce((s, dia) => s + (datos.data[emp]?.[dia]?.horas || 0), 0);
                    const flagsEmp = datos.dias.reduce((s, dia) => s + (datos.data[emp]?.[dia]?.flags?.length || 0), 0);
                    return (
                      <tr key={emp}>
                        <td style={{ background: '#151515', color: '#ccc', padding: '6px 14px', border: '1px solid #222', fontWeight: 500, position: 'sticky', left: 0, zIndex: 1 }}>
                          {emp}
                        </td>
                        {datos.dias.map(dia => (
                          <Celda
                            key={dia}
                            celda={datos.data[emp]?.[dia] || null}
                            onClick={() => setPopup({ empleado: emp, fecha: dia })}
                          />
                        ))}
                        <td style={{ background: '#111', color: flagsEmp > 0 ? '#f59e0b' : '#aaa', padding: '6px 10px', textAlign: 'center', border: '1px solid #222', fontWeight: 700, fontSize: 12 }}>
                          {fmtHoras(horasEmp)}
                          {flagsEmp > 0 && <span style={{ fontSize: 9, display: 'block', color: '#f59e0b' }}>⚠ {flagsEmp} inc.</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: '#555', fontSize: 14, padding: '48px 0', textAlign: 'center' }}>
              No hay fichajes en el rango seleccionado
            </div>
          )}
        </>
      )}

      {/* ── Popup detalle ── */}
      <DetallePopup
        celda={popupCelda}
        empleado={popup?.empleado}
        fecha={popup?.fecha}
        onClose={() => setPopup(null)}
      />
    </div>
  );
}
