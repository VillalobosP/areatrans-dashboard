import React from 'react';

export default function Logo({ height = 60 }) {
  const scale = height / 60;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height, borderRadius: 10, overflow: 'hidden', border: '1px solid #444', flexShrink: 0 }}>

      {/* ── Lado izquierdo: DIA % ── */}
      <div style={{
        background: '#111',
        padding: `0 ${14 * scale}px`,
        display: 'flex',
        alignItems: 'center',
        gap: 6 * scale,
        borderRight: '1px solid #444',
      }}>
        {/* "Dia" en rojo */}
        <span style={{
          fontFamily: 'Arial Black, Arial',
          fontWeight: 900,
          fontSize: 26 * scale,
          color: '#e8000d',
          letterSpacing: -1,
          lineHeight: 1,
        }}>Dia</span>

        {/* Cuadrado rojo con % */}
        <div style={{
          background: '#e8000d',
          borderRadius: 5 * scale,
          width: 30 * scale,
          height: 30 * scale,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: 'Arial Black, Arial',
            fontWeight: 900,
            fontSize: 18 * scale,
            color: '#fff',
            lineHeight: 1,
          }}>%</span>
        </div>

        {/* GETAFE vertical */}
        <span style={{
          fontFamily: 'Arial, sans-serif',
          fontWeight: 700,
          fontSize: 9 * scale,
          color: '#aaa',
          letterSpacing: 2.5,
          writingMode: 'vertical-lr',
          transform: 'rotate(180deg)',
        }}>GETAFE</span>
      </div>

      {/* ── Lado derecho: AT areatrans ── */}
      <div style={{
        background: '#f0f0f0',
        padding: `0 ${12 * scale}px`,
        display: 'flex',
        alignItems: 'center',
        gap: 8 * scale,
      }}>
        {/* Rombo con AT */}
        <div style={{
          width: 36 * scale,
          height: 36 * scale,
          background: '#1e3a8a',
          transform: 'rotate(45deg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          borderRadius: 3 * scale,
        }}>
          <span style={{
            transform: 'rotate(-45deg)',
            fontFamily: 'Arial Black, Arial',
            fontWeight: 900,
            fontSize: 11 * scale,
            color: '#f59e0b',
            lineHeight: 1,
          }}>AT</span>
        </div>

        {/* area + trans + subtítulo */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ lineHeight: 1.1 }}>
            <span style={{ fontFamily: 'Arial, sans-serif', fontWeight: 800, fontSize: 18 * scale, color: '#f59e0b' }}>area</span>
            <span style={{ fontFamily: 'Arial, sans-serif', fontWeight: 800, fontSize: 18 * scale, color: '#1e3a8a' }}>trans</span>
          </div>
          <span style={{
            fontFamily: 'Arial, sans-serif',
            fontWeight: 600,
            fontSize: 7 * scale,
            color: '#1e3a8a',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}>Servicios de Transporte</span>
        </div>
      </div>

    </div>
  );
}
