import React from 'react';

export default function Logo({ height = 60 }) {
  return (
    <svg
      height={height}
      viewBox="0 0 360 90"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
      aria-label="DIA Getafe · AT Areatrans"
    >
      <defs>
        <clipPath id="pill-clip">
          <rect x="0" y="0" width="360" height="90" rx="14" ry="14" />
        </clipPath>
      </defs>

      {/* Mitad izquierda — negra (DIA) */}
      <rect x="0" y="0" width="165" height="90" fill="#111111" clipPath="url(#pill-clip)" />
      {/* Mitad derecha — blanca/gris (Areatrans) */}
      <rect x="165" y="0" width="195" height="90" fill="#f0f0f0" clipPath="url(#pill-clip)" />

      {/* Separador vertical */}
      <line x1="165" y1="0" x2="165" y2="90" stroke="#444" strokeWidth="1.5" />

      {/* Borde exterior */}
      <rect x="1" y="1" width="358" height="88" rx="13" ry="13"
        fill="none" stroke="#444" strokeWidth="1.5" />

      {/* ── Lado izquierdo: DIA ──────────────────────────────── */}
      {/* "Dia" en rojo */}
      <text x="14" y="44" fontFamily="Arial Black, Arial" fontWeight="900"
        fontSize="32" fill="#e8000d" letterSpacing="-1">Dia</text>

      {/* Cuadrado rojo con % */}
      <rect x="70" y="10" width="40" height="40" rx="6" fill="#e8000d" />
      <text x="90" y="37" fontFamily="Arial Black, Arial" fontWeight="900"
        fontSize="25" fill="white" textAnchor="middle">%</text>
      {/* Punto debajo del % */}
      <circle cx="90" cy="56" r="4" fill="#e8000d" />

      {/* "GETAFE" */}
      <text x="14" y="76" fontFamily="Arial, sans-serif" fontWeight="700"
        fontSize="13" fill="#cccccc" letterSpacing="3">GETAFE</text>

      {/* ── Lado derecho: AT areatrans ───────────────────────── */}
      {/* Rombo azul con "AT" */}
      <polygon points="188,45 208,22 228,45 208,68" fill="#1e3a8a" />
      <text x="208" y="51" fontFamily="Arial Black, Arial" fontWeight="900"
        fontSize="16" fill="#f59e0b" textAnchor="middle">AT</text>

      {/* "area" naranja */}
      <text x="236" y="42" fontFamily="Arial, sans-serif" fontWeight="800"
        fontSize="22" fill="#f59e0b">area</text>
      {/* "trans" azul */}
      <text x="285" y="42" fontFamily="Arial, sans-serif" fontWeight="800"
        fontSize="22" fill="#1e3a8a">trans</text>

      {/* Subtítulo */}
      <text x="236" y="62" fontFamily="Arial, sans-serif" fontWeight="600"
        fontSize="9" fill="#1e3a8a" letterSpacing="1.2">SERVICIOS DE TRANSPORTE</text>
    </svg>
  );
}
