import React from 'react';

const THEMES = {
  blue:     { background: '#1e3a5f', accent: '#4da6ff' },
  blueSoft: { background: '#1a3550', accent: '#7ec8ff' },
  white:    { background: '#2a2a2a', accent: '#cccccc' },
  gray:     { background: '#252525', accent: '#888888' },
  red:      { background: '#5f1e1e', accent: '#ff6b6b' },
  green:    { background: '#1a3d2a', accent: '#4dcc7a' },
};

export default function KPICard({
  label,
  value,
  sub,
  theme = 'white',
  forceRed = false,
  forceGreen = false,
  // Tarjeta destacada
  big = false,
  borderAccent = null,
  statusText = null,
  statusColor = null,
  // Indicador de tendencia
  trend = null,   // { arrow: '↑'|'↓', text: string, color: string }
}) {
  const key = forceRed ? 'red' : forceGreen ? 'green' : (THEMES[theme] ? theme : 'white');
  const t = THEMES[key];

  return (
    <div style={{
      background: t.background,
      borderRadius: 10,
      padding: big ? '20px 24px' : '18px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minWidth: big ? 180 : 140,
      flex: big ? 1.6 : 1,
      color: '#ffffff',
      borderLeft: borderAccent ? `3px solid ${borderAccent}` : undefined,
      boxSizing: 'border-box',
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: t.accent,
        opacity: 0.85,
      }}>
        {label}
      </span>

      <span style={{ fontSize: big ? 48 : 32, fontWeight: 700, lineHeight: 1 }}>
        {value ?? '—'}
      </span>

      {statusText && (
        <span style={{ fontSize: 12, fontWeight: 600, color: statusColor || '#aaa', marginTop: 2 }}>
          {statusText}
        </span>
      )}

      {trend && (
        <span style={{ fontSize: 12, fontWeight: 600, color: trend.color, marginTop: 2 }}>
          {trend.arrow} {trend.text}
        </span>
      )}

      {sub && (
        <span style={{ fontSize: 12, color: '#888', marginTop: trend || statusText ? 0 : 2 }}>
          {sub}
        </span>
      )}
    </div>
  );
}
