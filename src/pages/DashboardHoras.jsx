import React, { useState, useEffect, useCallback } from 'react';
import { jsPDF } from 'jspdf';
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
  return { dow, dia: `${parseInt(d,10)} ${meses[parseInt(m,10)]}` };
}
function fmtHoras(h) {
  if (!h) return null;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h${mm > 0 ? ` ${mm.toString().padStart(2,'0')}m` : ''}`;
}

// ── Config visual por tipo de celda ───────────────────────────────────────────
const TIPOS = {
  ok:        { bg: '#0d2e1a', fg: '#34d399', brd: '#1a4a2a' },
  casi:      { bg: '#1a2e0d', fg: '#86efac', brd: '#2a4a1a' },
  corto:     { bg: '#2e1a0d', fg: '#fb923c', brd: '#4a2a1a' },
  muycorto:  { bg: '#2e0d0d', fg: '#f87171', brd: '#4a1a1a' },
  incompleto:{ bg: '#2e1e00', fg: '#fbbf24', brd: '#4a3000' },
  extra:     { bg: '#0d1e2e', fg: '#60a5fa', brd: '#1a3048' },
  baja:      { bg: '#1a0d2e', fg: '#c084fc', brd: '#3a1a5a' },
  vacaciones:{ bg: '#0d1e2a', fg: '#38bdf8', brd: '#1a3a4a' },
  permiso:   { bg: '#0d2020', fg: '#2dd4bf', brd: '#1a3a3a' },
  festivo:   { bg: '#181818', fg: '#444',    brd: '#222'    },
  libranza:  { bg: '#141414', fg: '#3a3a3a', brd: '#1e1e1e' },
  ausente:   { bg: '#2e0d0d', fg: '#f87171', brd: '#4a1a1a' },
  futuro:    { bg: '#111',    fg: '#252525', brd: '#181818' },
  vacio:     { bg: '#111',    fg: '#222',    brd: '#181818' },
};

function getTipo(celda) {
  if (!celda) return 'vacio';
  const e = celda.estadoEspecial;
  if (e === 'baja' || e === 'vacaciones' || e === 'permiso' || e === 'festivo' || e === 'libranza' || e === 'ausente' || e === 'futuro') return e;
  if (celda.flags?.length > 0) return 'incompleto';
  if (celda.esExtra) return 'extra';
  const h = celda.horas;
  if (h >= 8) return 'ok';
  if (h >= 6) return 'casi';
  if (h >= 4) return 'corto';
  return 'muycorto';
}

// ── Popup detalle ─────────────────────────────────────────────────────────────
function DetallePopup({ celda, empleado, fecha, onClose }) {
  if (!celda || !empleado) return null;
  const tipo = getTipo(celda);
  const t    = TIPOS[tipo] || TIPOS.vacio;
  const { dow, dia } = fmtFecha(fecha);

  const LABELS = {
    baja: '🏥 Baja', vacaciones: '🌴 Vacaciones', permiso: '📋 Permiso',
    festivo: '🎉 Festivo', libranza: '🛌 Libranza', ausente: '❌ Ausente', futuro: '',
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#1c1c1c', border: `1px solid ${t.brd}`, borderRadius: 16,
        padding: '24px 28px', zIndex: 1000, minWidth: 320, maxWidth: 460,
        boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
      }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{empleado}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{dow} {dia}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Estado especial */}
        {celda.estadoEspecial && celda.estadoEspecial !== 'futuro' && (
          <div style={{ background: t.bg, border: `1px solid ${t.brd}`, borderRadius: 10, padding: '14px 18px', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.fg, letterSpacing: '-0.01em' }}>
              {LABELS[celda.estadoEspecial] || celda.estadoEspecial.toUpperCase()}
            </div>
            {celda.incidenciaObs && (
              <div style={{ fontSize: 12, color: '#777', marginTop: 6 }}>{celda.incidenciaObs}</div>
            )}
          </div>
        )}

        {/* Total horas (solo si hay fichajes) */}
        {!celda.estadoEspecial && celda.pares?.length > 0 && (
          <div style={{ background: t.bg, border: `1px solid ${t.brd}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {celda.esExtra && <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 700, marginBottom: 2 }}>DÍA EXTRA — fuera de turno</div>}
              <span style={{ fontSize: 26, fontWeight: 800, color: t.fg, letterSpacing: '-0.02em' }}>{fmtHoras(celda.horas) || '—'}</span>
            </div>
            <div style={{ fontSize: 11, color: '#555', textAlign: 'right' }}>
              {celda.horas >= 8 ? '✓ Jornada completa' : celda.horas > 0 ? `${(8 - celda.horas).toFixed(1)}h pendientes` : ''}
            </div>
          </div>
        )}

        {/* Fichajes */}
        {celda.pares?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Fichajes</div>
            {celda.pares.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#151515', borderRadius: 7, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#34d399', fontFamily: 'monospace', fontWeight: 600 }}>↓ {p.entrada}</span>
                <span style={{ color: '#333', flex: 1, borderBottom: '1px dashed #2a2a2a' }} />
                <span style={{ fontSize: 11, color: '#fb7185', fontFamily: 'monospace', fontWeight: 600 }}>{p.salida} ↑</span>
                <span style={{ fontSize: 11, color: '#888', marginLeft: 8, minWidth: 50, textAlign: 'right' }}>{fmtHoras(p.horas)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Fichajes incompletos */}
        {celda.flags?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>⚠ Fichajes incompletos</div>
            {celda.flags.map((f, i) => (
              <div key={i} style={{ padding: '7px 10px', background: '#1e1400', borderRadius: 7, marginBottom: 4, borderLeft: '3px solid #fbbf24' }}>
                {f.tipo === 'sin_salida'
                  ? <span style={{ fontSize: 12, color: '#fbbf24', fontFamily: 'monospace' }}>↓ Entrada {f.hora} — <strong>falta la salida</strong></span>
                  : <span style={{ fontSize: 12, color: '#fbbf24', fontFamily: 'monospace' }}><strong>Falta la entrada</strong> — Salida {f.hora} ↑</span>
                }
              </div>
            ))}
          </div>
        )}

        {/* Descanso de comida */}
        {celda.descanso && celda.descanso.flag !== 'no_requerido' && (() => {
          const { flag, duracion, inicio, fin } = celda.descanso;
          const CFG_D = {
            ok:                   { color: '#34d399', bg: '#0d2e1a', brd: '#1a4a2a', icon: '✓', texto: 'Descanso correcto' },
            sin_descanso:         { color: '#f87171', bg: '#2e0d0d', brd: '#4a1a1a', icon: '✕', texto: 'Sin descanso de comida' },
            descanso_corto:       { color: '#fb923c', bg: '#2e1a0d', brd: '#4a2a1a', icon: '⚠', texto: 'Descanso insuficiente (< 15 min)' },
            descanso_incompleto:  { color: '#fbbf24', bg: '#2e1e00', brd: '#4a3000', icon: '⚠', texto: 'Descanso sin fichaje de vuelta' },
            descanso_tardio:      { color: '#fb923c', bg: '#2e1a0d', brd: '#4a2a1a', icon: '⚠', texto: 'Descanso tardío (> 6h sin pausa)' },
          };
          const c = CFG_D[flag] || CFG_D.ok;
          return (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: c.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                {c.icon} Descanso obligatorio (Art. 34.4 ET)
              </div>
              <div style={{ padding: '10px 14px', background: c.bg, borderRadius: 8, border: `1px solid ${c.brd}`, borderLeft: `3px solid ${c.color}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: c.color, marginBottom: flag !== 'sin_descanso' && (inicio || fin) ? 6 : 0 }}>{c.texto}</div>
                {(inicio || fin) && (
                  <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
                    {inicio && <span>Salida comida: {inicio}</span>}
                    {inicio && fin && <span style={{ color: '#555' }}> → </span>}
                    {fin && <span>Vuelta: {fin}</span>}
                    {duracion != null && <span style={{ color: '#666', marginLeft: 10 }}>({duracion} min)</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Incidencias de fichador */}
        {celda.incidencias?.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Incidencias</div>
            {celda.incidencias.map((inc, i) => (
              <div key={i} style={{ fontSize: 12, color: '#c4b5fd', padding: '4px 0' }}>{inc}</div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Celda del grid ─────────────────────────────────────────────────────────────
function Celda({ celda, onClick }) {
  const tipo = getTipo(celda);
  const t    = TIPOS[tipo];

  const esFuturo  = tipo === 'futuro';
  const esVacio   = tipo === 'vacio';
  const esLibranza = tipo === 'libranza';
  const clickable = !esFuturo && !esVacio && !esLibranza;

  let contenido;
  if (esVacio || esFuturo) {
    contenido = <span style={{ color: '#252525', fontSize: 20 }}>·</span>;
  } else if (tipo === 'festivo') {
    contenido = (
      <div>
        <div style={{ fontSize: 22 }}>🎉</div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 3, fontWeight: 600 }}>Festivo</div>
      </div>
    );
  } else if (tipo === 'baja') {
    contenido = (
      <div>
        <div style={{ fontSize: 22 }}>🏥</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.fg, marginTop: 3 }}>BAJA</div>
      </div>
    );
  } else if (tipo === 'vacaciones') {
    contenido = (
      <div>
        <div style={{ fontSize: 22 }}>🌴</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.fg, marginTop: 3 }}>VAC.</div>
      </div>
    );
  } else if (tipo === 'permiso') {
    contenido = (
      <div>
        <div style={{ fontSize: 22 }}>📋</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.fg, marginTop: 3 }}>PERMISO</div>
      </div>
    );
  } else if (tipo === 'libranza') {
    contenido = (
      <div>
        <div style={{ fontSize: 18, lineHeight: 1 }}>🛌</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#3a3a3a', marginTop: 3 }}>Libranza</div>
      </div>
    );
  } else if (tipo === 'ausente') {
    contenido = (
      <div>
        <div style={{ fontSize: 24, color: '#f87171', lineHeight: 1 }}>✕</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.fg, marginTop: 2 }}>AUSENTE</div>
      </div>
    );
  } else if (tipo === 'incompleto') {
    const sinSalida  = celda.flags?.some(f => f.tipo === 'sin_salida');
    const sinEntrada = celda.flags?.some(f => f.tipo === 'sin_entrada');
    const horasStr   = celda.horas > 0 ? fmtHoras(celda.horas) : null;
    contenido = (
      <div style={{ lineHeight: 1.4 }}>
        {horasStr && <div style={{ fontSize: 17, fontWeight: 800, color: '#fbbf24' }}>{horasStr}</div>}
        <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700, marginTop: horasStr ? 3 : 0 }}>
          ⚠ {sinSalida ? 'sin salida' : sinEntrada ? 'sin entrada' : 'incompleto'}
        </div>
      </div>
    );
  } else {
    const labelExtra = celda?.esFestivo ? '🎉 festivo' : 'EXTRA';
    const badDescanso = celda?.descanso && ['sin_descanso','descanso_corto','descanso_tardio','descanso_incompleto'].includes(celda.descanso.flag);
    contenido = (
      <div style={{ lineHeight: 1.4, position: 'relative' }}>
        {tipo === 'extra' && <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 800, letterSpacing: '0.04em', marginBottom: 3 }}>{labelExtra}</div>}
        <div style={{ fontSize: 18, fontWeight: 800, color: t.fg }}>{fmtHoras(celda.horas) || '—'}</div>
        {badDescanso && (
          <div style={{ fontSize: 9, color: '#fb923c', fontWeight: 700, marginTop: 2, letterSpacing: '0.04em' }}>☕ sin pausa</div>
        )}
      </div>
    );
  }

  return (
    <td
      onClick={clickable ? onClick : undefined}
      title={clickable ? 'Ver detalle' : undefined}
      style={{
        background: t.bg, color: t.fg, border: `1px solid ${t.brd}`,
        padding: '16px 8px', textAlign: 'center',
        cursor: clickable ? 'pointer' : 'default',
        width: 120, height: 72,
        verticalAlign: 'middle',
        transition: 'filter 0.15s',
      }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.filter = 'brightness(1.25)'; }}
      onMouseLeave={e => { e.currentTarget.style.filter = ''; }}
    >
      {contenido}
    </td>
  );
}

// ── Panel historial de incidencias ────────────────────────────────────────────
function PanelIncidencias({ statsIncidencias }) {
  if (!statsIncidencias || Object.keys(statsIncidencias).length === 0) return null;

  const filas = [];
  Object.entries(statsIncidencias).forEach(([emp, tipos]) => {
    Object.entries(tipos).forEach(([tipo, stat]) => {
      filas.push({ emp, tipo, ...stat });
    });
  });
  filas.sort((a, b) => b.dias - a.dias);

  const CFG = {
    baja:       { color: '#c084fc', bg: '#1a0d2e', icon: '🏥' },
    vacaciones: { color: '#38bdf8', bg: '#0d1e2a', icon: '🌴' },
    permiso:    { color: '#2dd4bf', bg: '#0d2020', icon: '📋' },
    accidente:  { color: '#f87171', bg: '#2e0d0d', icon: '⚠️' },
  };

  return (
    <div style={{ background: '#181818', borderRadius: 12, padding: '20px 22px', border: '1px solid #222' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16, borderLeft: '3px solid #333', paddingLeft: 8 }}>
        Historial de incidencias
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filas.map((f, i) => {
          const c = CFG[f.tipo] || CFG.baja;
          const pct = Math.min(100, (f.dias / 30) * 100); // barra relativa a 30 días
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', background: c.bg, borderRadius: 9, border: `1px solid ${TIPOS[f.tipo]?.brd || '#3a1a5a'}` }}>
              <span style={{ fontSize: 16 }}>{c.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#ccc', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.emp}</div>
                <div style={{ background: '#0a0a0a', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: c.color, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: c.color }}>{f.dias}<span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>días</span></div>
                <div style={{ fontSize: 10, color: '#555' }}>{f.episodios} {f.episodios === 1 ? 'episodio' : 'episodios'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Generador de informe PDF ──────────────────────────────────────────────────
function generarPDF(empleado, desde, hasta, dias, data) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, margin = 14;
  let y = margin;

  // Cabecera
  doc.setFillColor(17, 17, 17);
  doc.rect(0, 0, W, 28, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('INFORME DE FICHAJES', margin, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text(`Areatrans · DIA % · Generado ${new Date().toLocaleDateString('es-ES')}`, margin, 20);
  y = 36;

  // Datos del empleado
  doc.setFillColor(26, 26, 26);
  doc.rect(margin, y, W - margin * 2, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(232, 232, 232);
  doc.text(empleado, margin + 4, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Periodo: ${desde} - ${hasta}`, margin + 4, y + 16);
  y += 28;

  // Recopilar incidencias
  const errores = [];
  const ausencias = [];
  const incumplimientosDescanso = [];

  dias.forEach(dia => {
    const c = data[empleado]?.[dia];
    if (!c) return;
    const tipo = getTipo(c);
    const { dow, dia: diaStr } = fmtFecha(dia);
    const etiquetaDia = `${dow} ${diaStr}`;

    if (tipo === 'incompleto') {
      c.flags?.forEach(f => {
        errores.push({
          dia: etiquetaDia,
          tipo: f.tipo === 'sin_salida' ? 'Falta salida' : 'Falta entrada',
          hora: f.hora,
        });
      });
    }
    if (tipo === 'ausente') {
      ausencias.push({ dia: etiquetaDia });
    }
    const d = c.descanso;
    if (d && ['sin_descanso','descanso_corto','descanso_tardio','descanso_incompleto'].includes(d.flag)) {
      const DESC_LABEL = {
        sin_descanso:        'Sin descanso de comida',
        descanso_corto:      `Descanso insuficiente (${d.duracion != null ? d.duracion + ' min' : '?'})`,
        descanso_tardio:     'Descanso tardío (> 6h sin pausa)',
        descanso_incompleto: 'Descanso sin fichaje de vuelta',
      };
      incumplimientosDescanso.push({
        dia: etiquetaDia,
        desc: DESC_LABEL[d.flag] || d.flag,
        horario: d.inicio ? `${d.inicio}${d.fin ? ' - ' + d.fin : ''}` : '-',
      });
    }
  });

  // Sección: fichajes incompletos
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(251, 191, 36);
  doc.text(`FICHAJES INCOMPLETOS (${errores.length})`, margin, y + 6);
  y += 10;

  if (errores.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('Sin errores de fichaje en el periodo.', margin, y + 5);
    y += 12;
  } else {
    // Cabecera tabla
    doc.setFillColor(40, 30, 0);
    doc.rect(margin, y, W - margin * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(251, 191, 36);
    doc.text('DÍA', margin + 2, y + 5);
    doc.text('INCIDENCIA', margin + 55, y + 5);
    doc.text('HORA', margin + 130, y + 5);
    y += 8;

    errores.forEach((e, i) => {
      if (y > 270) { doc.addPage(); y = margin; }
      doc.setFillColor(i % 2 === 0 ? 22 : 26, i % 2 === 0 ? 18 : 22, 0);
      doc.rect(margin, y, W - margin * 2, 7, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(220, 200, 140);
      doc.text(e.dia, margin + 2, y + 5);
      doc.setTextColor(e.tipo.includes('salida') ? 248 : 96, e.tipo.includes('salida') ? 113 : 165, e.tipo.includes('salida') ? 133 : 250);
      doc.text(e.tipo, margin + 55, y + 5);
      doc.setTextColor(180, 180, 180);
      doc.text(e.hora || '-', margin + 130, y + 5);
      y += 7;
    });
    y += 6;
  }

  // Sección: ausencias
  if (y > 250) { doc.addPage(); y = margin; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(248, 113, 113);
  doc.text(`AUSENCIAS INJUSTIFICADAS (${ausencias.length})`, margin, y + 6);
  y += 10;

  if (ausencias.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('Sin ausencias en el periodo.', margin, y + 5);
    y += 12;
  } else {
    ausencias.forEach((a, i) => {
      if (y > 270) { doc.addPage(); y = margin; }
      doc.setFillColor(46, 13, 13);
      doc.rect(margin, y, W - margin * 2, 7, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(248, 113, 113);
      doc.text(a.dia, margin + 2, y + 5);
      doc.setTextColor(150, 80, 80);
      doc.text('No ficho - tocaba trabajar', margin + 40, y + 5);
      y += 7;
    });
  }

  // Sección: incumplimientos de descanso
  if (y > 250) { doc.addPage(); y = margin; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(251, 146, 60);
  doc.text(`INCUMPLIMIENTOS DE DESCANSO (Art. 34.4 ET) (${incumplimientosDescanso.length})`, margin, y + 6);
  y += 10;

  if (incumplimientosDescanso.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('Sin incumplimientos de descanso en el periodo.', margin, y + 5);
    y += 12;
  } else {
    doc.setFillColor(40, 20, 0);
    doc.rect(margin, y, W - margin * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(251, 146, 60);
    doc.text('DÍA', margin + 2, y + 5);
    doc.text('INCIDENCIA', margin + 55, y + 5);
    doc.text('HORARIO', margin + 130, y + 5);
    y += 8;

    incumplimientosDescanso.forEach((e, i) => {
      if (y > 270) { doc.addPage(); y = margin; }
      doc.setFillColor(i % 2 === 0 ? 26 : 30, i % 2 === 0 ? 14 : 18, 0);
      doc.rect(margin, y, W - margin * 2, 7, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(220, 190, 140);
      doc.text(e.dia, margin + 2, y + 5);
      doc.setTextColor(251, 146, 60);
      doc.text(e.desc, margin + 55, y + 5);
      doc.setTextColor(180, 180, 180);
      doc.text(e.horario, margin + 130, y + 5);
      y += 7;
    });
    y += 6;
  }

  // Pie
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  doc.text('Documento generado automáticamente por el Dashboard Operativo · Areatrans', W / 2, 292, { align: 'center' });

  const nombreArchivo = `informe_${empleado.replace(/\s+/g, '_')}_${desde}_${hasta}.pdf`;
  doc.save(nombreArchivo);
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DashboardHoras({ centro, refreshKey = 0 }) {
  const [desde, setDesde]         = useState(primerDiaMes());
  const [hasta, setHasta]         = useState(hoy());
  const [datos, setDatos]         = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [popup, setPopup]         = useState(null);
  const [empFiltro, setEmpFiltro] = useState('');   // '' = todos

  const cargarDatos = useCallback(async () => {
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    try { setDatos(await getHoras(centro, desde, hasta)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [centro, desde, hasta]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (refreshKey > 0) cargarDatos(); }, [refreshKey]);

  // Reset filtro si los empleados cambian
  useEffect(() => {
    if (datos && empFiltro && !datos.empleados.includes(empFiltro)) setEmpFiltro('');
  }, [datos, empFiltro]);

  const presets      = getPresets();
  const activePreset = presets.find(p => p.desde === desde && p.hasta === hasta)?.label;

  // Empleados a mostrar en el grid
  const empleadosMostrados = datos
    ? (empFiltro ? datos.empleados.filter(e => e === empFiltro) : datos.empleados)
    : [];

  // KPIs — siempre sobre todos los empleados
  let jornadasOk = 0, jornadasIncompletas = 0, jornadasExtra = 0, jornadasAusente = 0;
  let sumHoras = 0, countHoras = 0;
  let sinDescanso = 0;
  const BAD_DESCANSO = new Set(['sin_descanso', 'descanso_corto', 'descanso_tardio', 'descanso_incompleto']);
  if (datos) {
    datos.empleados.forEach(emp => {
      datos.dias.forEach(dia => {
        const c = datos.data[emp]?.[dia];
        if (!c) return;
        const tipo = getTipo(c);
        if (tipo === 'futuro' || tipo === 'festivo' || tipo === 'libranza' || tipo === 'baja' || tipo === 'vacaciones' || tipo === 'permiso' || tipo === 'vacio') return;
        if (tipo === 'ausente') { jornadasAusente++; return; }
        if (tipo === 'incompleto') { jornadasIncompletas++; return; }
        if (tipo === 'extra') jornadasExtra++;
        if (c.horas >= 8) jornadasOk++;
        sumHoras += c.horas;
        countHoras++;
        if (c.descanso && BAD_DESCANSO.has(c.descanso.flag)) sinDescanso++;
      });
    });
  }

  const popupCelda = popup ? datos?.data?.[popup.empleado]?.[popup.fecha] : null;

  const S = {
    dateInput:      { background: '#2a2a2a', border: '1px solid #444', borderRadius: 7, color: '#fff', fontSize: 14, padding: '7px 12px', outline: 'none', cursor: 'pointer', colorScheme: 'dark' },
    btnPreset:      { background: '#2a2a2a', border: '1px solid #444', borderRadius: 7, color: '#bbb', fontSize: 12, padding: '7px 12px', cursor: 'pointer' },
    btnPresetActive:{ background: '#1e3a5f', border: '1px solid #4da6ff', color: '#4da6ff' },
    select:         { background: '#2a2a2a', border: '1px solid #444', borderRadius: 7, color: '#ddd', fontSize: 13, padding: '7px 12px', outline: 'none', cursor: 'pointer', colorScheme: 'dark', minWidth: 220 },
    btnPDF:         { background: '#1a1a2e', border: '1px solid #4a3a7a', borderRadius: 7, color: '#a78bfa', fontSize: 12, fontWeight: 700, padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  };

  return (
    <div style={{ padding: '18px 16px' }}>

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

      {/* ── Selector de empleado + botón PDF ── */}
      {datos && datos.empleados.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#666' }}>Empleado:</span>
          <select
            style={S.select}
            value={empFiltro}
            onChange={e => setEmpFiltro(e.target.value)}
          >
            <option value="">— Todos —</option>
            {datos.empleados.map(emp => (
              <option key={emp} value={emp}>{emp}</option>
            ))}
          </select>

          {empFiltro && (
            <button
              style={S.btnPDF}
              onClick={() => generarPDF(empFiltro, desde, hasta, datos.dias, datos.data)}
            >
              ↓ Informe PDF
            </button>
          )}

          {!empFiltro && (
            <span style={{ fontSize: 11, color: '#444' }}>Selecciona un empleado para generar informe PDF</span>
          )}
        </div>
      )}

      {error   && <div style={{ background: '#3a1a1a', border: '1px solid #ff4444', borderRadius: 8, padding: '12px 16px', color: '#ff8888', marginBottom: 18, fontSize: 13 }}>Error: {error}</div>}
      {loading && <div style={{ color: '#555', fontSize: 14, padding: '48px 0', textAlign: 'center' }}>Cargando…</div>}

      {!loading && datos && (
        <>
          {/* ── KPIs ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, borderLeft: '3px solid #333', paddingLeft: 8 }}>
              {empFiltro ? `Resumen de ${empFiltro.split(' ')[0]}` : 'Resumen del equipo'}
            </div>
            <div className="kpi-row">
              <KPICard label="Jornadas ≥ 8h"       value={jornadasOk}          sub="Objetivo cumplido"         theme="blue" borderAccent="#34d399" />
              <KPICard label="Fichajes incompletos"  value={jornadasIncompletas} sub="Falta entrada o salida"    forceRed={jornadasIncompletas > 0} forceGreen={jornadasIncompletas === 0} />
              <KPICard label="Sin descanso comida"   value={sinDescanso}         sub="Incumplimiento Art. 34.4 ET" forceRed={sinDescanso > 0} forceGreen={sinDescanso === 0} />
              <KPICard label="Ausencias injustif."   value={jornadasAusente}     sub="Tocaba trabajar, no vino"  forceRed={jornadasAusente > 0} forceGreen={jornadasAusente === 0} />
              <KPICard label="Días extra"            value={jornadasExtra}       sub="Fuera del turno asignado"  theme="white" />
              <KPICard label="Media h/jornada"       value={countHoras > 0 ? `${Math.round(sumHoras/countHoras*10)/10}h` : '—'} sub="Jornadas con datos" theme="gray" />
            </div>
          </div>

          {/* ── Leyenda ── */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', fontSize: 11, padding: '10px 14px', background: '#181818', borderRadius: 8, border: '1px solid #222' }}>
            {[
              { color: '#34d399', label: '≥ 8h OK' },
              { color: '#86efac', label: '6–8h' },
              { color: '#fb923c', label: '4–6h' },
              { color: '#f87171', label: '< 4h' },
              { color: '#fbbf24', label: '⚠ Inc. fichaje' },
              { color: '#60a5fa', label: 'EXTRA' },
              { color: '#f87171', label: 'AUSENTE' },
              { color: '#c084fc', label: '🏥 BAJA' },
              { color: '#38bdf8', label: '🌴 VAC.' },
              { color: '#444',    label: '🎉 Festivo' },
              { color: '#333',    label: '🛌 Libranza' },
            ].map(({ color, label }) => (
              <span key={label} style={{ color, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 7, lineHeight: 1 }}>●</span> {label}
              </span>
            ))}
            <span style={{ color: '#444', marginLeft: 'auto' }}>Pulsa una celda para ver detalle</span>
          </div>

          {/* ── Grid ── */}
          {empleadosMostrados.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 24, borderRadius: 12, border: '1px solid #252525' }}>
              <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: '#0d0d0d' }}>
                    <th style={{
                      color: '#666', padding: '16px 24px', textAlign: 'left',
                      fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                      border: '1px solid #1e1e1e', position: 'sticky', left: 0,
                      background: '#0d0d0d', zIndex: 2, width: 280,
                    }}>
                      Empleado
                    </th>
                    {datos.dias.map(dia => {
                      const { dow, dia: diaStr } = fmtFecha(dia);
                      const esFinSemana = ['Sáb','Dom'].includes(dow);
                      return (
                        <th key={dia} style={{
                          padding: '12px 8px', textAlign: 'center',
                          border: '1px solid #1e1e1e', width: 120,
                          background: esFinSemana ? '#0a0a0a' : '#0d0d0d',
                        }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: esFinSemana ? '#444' : '#888' }}>{dow}</div>
                          <div style={{ fontSize: 12, color: esFinSemana ? '#333' : '#555', marginTop: 3 }}>{diaStr}</div>
                        </th>
                      );
                    })}
                    <th style={{
                      color: '#777', padding: '12px 16px', textAlign: 'center',
                      fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                      border: '1px solid #1e1e1e', width: 110, background: '#0d0d0d',
                    }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {empleadosMostrados.map((emp, ei) => {
                    const horasEmp  = datos.dias.reduce((s, dia) => s + (datos.data[emp]?.[dia]?.horas || 0), 0);
                    const flagsEmp  = datos.dias.reduce((s, dia) => s + (datos.data[emp]?.[dia]?.flags?.length || 0), 0);
                    const bajasEmp  = datos.statsIncidencias?.[emp]?.baja;
                    const enBajaHoy = datos.dias.some(dia => datos.data[emp]?.[dia]?.estadoEspecial === 'baja');
                    const rowBg     = ei % 2 === 0 ? '#111' : '#131313';
                    return (
                      <tr key={emp} style={{ background: rowBg }}>
                        <td style={{
                          padding: '18px 24px', border: '1px solid #1e1e1e',
                          position: 'sticky', left: 0, background: rowBg, zIndex: 1,
                          width: 280,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                              background: enBajaHoy ? '#c084fc' : flagsEmp > 0 ? '#fbbf24' : '#34d399',
                              boxShadow: enBajaHoy ? '0 0 6px #c084fc88' : flagsEmp > 0 ? '0 0 6px #fbbf2488' : '0 0 6px #34d39988',
                            }} />
                            <div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e8e8', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{emp}</div>
                              {enBajaHoy && (
                                <div style={{ fontSize: 12, color: '#c084fc', marginTop: 3, fontWeight: 700 }}>🏥 De baja</div>
                              )}
                              {!enBajaHoy && bajasEmp && (
                                <div style={{ fontSize: 12, color: '#9d6dff', marginTop: 3 }}>{bajasEmp.dias}d de baja</div>
                              )}
                            </div>
                          </div>
                        </td>
                        {datos.dias.map(dia => (
                          <Celda key={dia}
                            celda={datos.data[emp]?.[dia] || null}
                            onClick={() => setPopup({ empleado: emp, fecha: dia })}
                          />
                        ))}
                        <td style={{
                          padding: '16px 14px', textAlign: 'center',
                          border: '1px solid #1e1e1e', background: '#0f0f0f',
                          width: 110, height: 72, verticalAlign: 'middle',
                        }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: flagsEmp > 0 ? '#fbbf24' : '#bbb' }}>
                            {fmtHoras(horasEmp) || '—'}
                          </div>
                          {flagsEmp > 0 && (
                            <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 3, fontWeight: 600 }}>⚠ {flagsEmp} inc.</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Historial incidencias ── */}
          <PanelIncidencias statsIncidencias={datos.statsIncidencias} />
        </>
      )}

      <DetallePopup
        celda={popupCelda}
        empleado={popup?.empleado}
        fecha={popup?.fecha}
        onClose={() => setPopup(null)}
      />
    </div>
  );
}
