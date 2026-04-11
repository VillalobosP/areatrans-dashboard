import React from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer,
} from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const detalles = d?.detallesExtra || [];
  return (
    <div style={{
      background: '#1e1e1e', border: '1px solid #3a3a3a',
      borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13,
      minWidth: 180, maxWidth: 320,
    }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#ccc', fontSize: 12 }}>
        {fmtFechaCompleta(d?.fecha)}
      </p>
      {payload.map(p => (
        <p key={p.name} style={{ margin: '3px 0', color: p.color }}>
          {p.name}: <strong style={{ color: '#fff' }}>{p.value != null ? p.value : '—'}</strong>
        </p>
      ))}
      {detalles.length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid #2a2a2a', paddingTop: 8 }}>
          {detalles.map((nota, i) => (
            <div key={i} style={{
              fontSize: 11, color: '#f59e0b', lineHeight: 1.5,
              paddingLeft: 6, borderLeft: '2px solid #f59e0b', marginTop: i > 0 ? 4 : 0,
            }}>
              {nota}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function fmtFechaCompleta(fecha) {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-');
  const meses = ['','enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d, 10)} de ${meses[parseInt(m, 10)]} de ${y}`;
}

function round1(n) { return Math.round(n * 10) / 10; }

export default function GraficoViajes({ calendario }) {
  if (!calendario || calendario.length === 0) {
    return (
      <div style={{ color: '#555', textAlign: 'center', padding: 48, fontSize: 14 }}>
        No hay días operativos en el rango seleccionado
      </div>
    );
  }

  const data = calendario.map(row => {
    const fecha = row.FECHA || '';
    const [, m, d] = fecha.split('-');
    const meses = ['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return {
      label:            `${parseInt(d, 10)} ${meses[parseInt(m, 10)]}`,
      fecha,
      detallesExtra:    row.DETALLES_EXTRA || [],
      'Planificados':   row.VIAJES_PLANIFICADOS || 0,
      'Extra':          row.VIAJES_EXTRA        || 0,
      'Cuota mínima':   row.CUOTA_MIN_225_INCL > 0 ? round1(row.CUOTA_MIN_225_INCL) : null,
      'Cuota objetivo': row.CUOTA_OBJ_250_INCL > 0 ? round1(row.CUOTA_OBJ_250_INCL) : null,
    };
  });

  const muchos = data.length > 20;

  return (
    <ResponsiveContainer width="100%" height={330}>
      <ComposedChart data={data} margin={{ top: 26, right: 20, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: '#777', fontSize: 11 }}
          axisLine={{ stroke: '#2e2e2e' }}
          tickLine={false}
          interval={0}
          angle={muchos ? -45 : 0}
          textAnchor={muchos ? 'end' : 'middle'}
          height={muchos ? 50 : 28}
        />
        <YAxis tick={{ fill: '#777', fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ color: '#777', fontSize: 13, paddingTop: 10 }} />

        {/* Barra planificados (base) */}
        <Bar dataKey="Planificados" stackId="viajes" fill="#4da6ff" radius={[0, 0, 0, 0]} maxBarSize={36}>
          <LabelList
            dataKey="Planificados"
            position="top"
            content={({ x, y, width, value, index }) => {
              // Muestra total (planificados + extra) encima de la barra completa
              const row = data[index];
              const total = (row?.['Planificados'] || 0) + (row?.['Extra'] || 0);
              if (total === 0) return null;
              return (
                <text x={x + width / 2} y={y - 4} fill="#ffffff" fontSize={11} fontWeight={700} textAnchor="middle">
                  {total}
                </text>
              );
            }}
          />
        </Bar>

        {/* Barra extra (apilada encima, naranja) */}
        <Bar dataKey="Extra" stackId="viajes" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={36} />

        <Line
          type="monotone"
          dataKey="Cuota mínima"
          stroke="#ff8c42"
          strokeWidth={2}
          strokeOpacity={0.8}
          dot={false}
          strokeDasharray="6 3"
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="Cuota objetivo"
          stroke="#b266ff"
          strokeWidth={2}
          strokeOpacity={0.8}
          dot={false}
          strokeDasharray="6 3"
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
