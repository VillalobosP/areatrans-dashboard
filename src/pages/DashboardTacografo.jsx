import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || '';

// ── Constantes legales (Reglamento CE 561/2006) ────────────────────────────────
const MAX_CONDUCCION_DIARIA   = 9  * 3600; // 9 h normales
const MAX_CONDUCCION_CONTINUA = 4.5 * 3600; // 4 h 30 min sin pausa
const WARN_CONTINUA           = 4  * 3600;  // aviso a los 4 h

// ── Estados del tacógrafo ─────────────────────────────────────────────────────
const ESTADOS = {
  0: { label: 'Conduciendo', color: '#22c55e', bg: '#052e16' },
  1: { label: 'Trabajo',     color: '#f59e0b', bg: '#2d1f00' },
  2: { label: 'Disponible',  color: '#60a5fa', bg: '#0c1a33' },
  3: { label: 'Descanso',    color: '#a78bfa', bg: '#1a0f2e' },
};

// ── Formateo de tiempo (segundos → h:mm) ─────────────────────────────────────
function fmtSeg(s) {
  if (s == null || isNaN(s)) return '—';
  const abs = Math.abs(s);
  const h   = Math.floor(abs / 3600);
  const m   = Math.floor((abs % 3600) / 60);
  const neg = s < 0 ? '-' : '';
  return `${neg}${h}:${String(m).padStart(2, '0')}`;
}

// ── Color del tiempo disponible restante ──────────────────────────────────────
function colorDisponible(secs, infraction) {
  if (infraction > 0 || secs <= 0)       return { text: '#ef4444', bg: '#2d0000' }; // rojo
  if (secs < 3600)                        return { text: '#f97316', bg: '#2d1200' }; // naranja
  if (secs < 2 * 3600)                   return { text: '#eab308', bg: '#2a2000' }; // amarillo
  return { text: '#22c55e', bg: '#052e16' };                                          // verde
}

// ── Barra de progreso ─────────────────────────────────────────────────────────
function Barra({ valor, maximo, color = '#22c55e', height = 6 }) {
  const pct = Math.min(100, Math.max(0, (valor / maximo) * 100));
  return (
    <div style={{ background: '#2a2a2a', borderRadius: 3, height, width: '100%', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  );
}

// ── Tarjeta de conductor ──────────────────────────────────────────────────────
function FilaConductor({ d }) {
  const estado = ESTADOS[d.actualState] || ESTADOS[2];
  const disp   = colorDisponible(d.availableTime, d.infraction);
  const nombre = d.alias || d.name || `Conductor ${d.driverId}`;
  const pctCond = Math.min(100, (d.drivingTime / MAX_CONDUCCION_DIARIA) * 100);
  const pctCont = Math.min(100, (d.continousDriving / MAX_CONDUCCION_CONTINUA) * 100);
  const alerta  = d.infraction > 0 || d.availableTime <= 0;
  const aviso   = d.continousDriving >= WARN_CONTINUA;

  return (
    <tr style={{ borderBottom: '1px solid #1e1e1e', background: alerta ? '#1a0000' : 'transparent' }}>

      {/* Conductor */}
      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#e5e5e5' }}>{nombre}</div>
        {d.vehicle && (
          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{d.vehicle}</div>
        )}
      </td>

      {/* Estado actual */}
      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
        <span style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 700,
          color: estado.color,
          background: estado.bg,
          border: `1px solid ${estado.color}33`,
        }}>
          {estado.label}
        </span>
      </td>

      {/* Conducción hoy */}
      <td style={{ padding: '12px 14px', minWidth: 120 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e5e5' }}>{fmtSeg(d.drivingTime)}</span>
          <span style={{ fontSize: 11, color: '#555' }}>/ 9:00</span>
        </div>
        <Barra valor={d.drivingTime} maximo={MAX_CONDUCCION_DIARIA}
          color={pctCond > 90 ? '#ef4444' : pctCond > 70 ? '#f97316' : '#22c55e'} />
      </td>

      {/* Otros trabajos */}
      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
        <span style={{ fontSize: 13, color: '#a3a3a3' }}>{fmtSeg(d.workingTime)}</span>
      </td>

      {/* Conducción continua */}
      <td style={{ padding: '12px 14px', minWidth: 120 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: aviso ? 700 : 400, color: aviso ? '#f97316' : '#a3a3a3' }}>
            {fmtSeg(d.continousDriving)}
          </span>
          <span style={{ fontSize: 11, color: '#555' }}>/ 4:30</span>
        </div>
        <Barra valor={d.continousDriving} maximo={MAX_CONDUCCION_CONTINUA}
          color={pctCont > 90 ? '#ef4444' : pctCont > 80 ? '#f97316' : '#eab308'} />
      </td>

      {/* Descanso hoy */}
      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
        <span style={{ fontSize: 13, color: '#a3a3a3' }}>{fmtSeg(d.restingTime)}</span>
      </td>

      {/* Tiempo restante */}
      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
        <span style={{
          fontSize: 15,
          fontWeight: 700,
          color: disp.text,
          background: disp.bg,
          padding: '4px 12px',
          borderRadius: 6,
          display: 'inline-block',
        }}>
          {d.infraction > 0 ? '⛔ Infracción' : fmtSeg(d.availableTime)}
        </span>
      </td>

      {/* Descanso semanal restante */}
      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
        <span style={{ fontSize: 12, color: '#555' }}>{fmtSeg(d.weekDrivingRest)}</span>
      </td>
    </tr>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DashboardTacografo({ centro, refreshKey }) {
  const [drivers, setDrivers]   = useState(null);
  const [ts, setTs]             = useState(null);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);

  const token = localStorage.getItem('token');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`${API}/api/${centro}/tacografo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Ordenar: infracciones primero, luego por tiempo disponible ascendente
      const sorted = [...data.drivers].sort((a, b) => {
        if (b.infraction !== a.infraction) return b.infraction - a.infraction;
        return a.availableTime - b.availableTime;
      });
      setDrivers(sorted);
      setTs(data.ts);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Error al conectar con WeMob');
    } finally {
      setLoading(false);
    }
  }, [centro, token]);

  useEffect(() => { cargar(); }, [cargar, refreshKey]);

  // ── Refresco automático cada 5 minutos
  useEffect(() => {
    const id = setInterval(cargar, 5 * 60 * 1_000);
    return () => clearInterval(id);
  }, [cargar]);

  // ── Estadísticas rápidas
  const stats = drivers ? {
    total:       drivers.length,
    conduciendo: drivers.filter(d => d.actualState === 0).length,
    infracciones: drivers.filter(d => d.infraction > 0).length,
    criticos:    drivers.filter(d => d.availableTime > 0 && d.availableTime < 3600).length,
  } : null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
            Tiempos de Conducción · Tacógrafo
          </h2>
          <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
            Reg. CE 561/2006 · Límites diarios: conducción 9 h · continua 4 h 30 min · descanso mín. 11 h
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {ts && (
            <span style={{ fontSize: 11, color: '#555' }}>
              Actualizado: {new Date(ts).toLocaleTimeString('es-ES')}
            </span>
          )}
          <button onClick={cargar} disabled={loading} style={{
            background: 'transparent', border: '1px solid #2a3a2a',
            borderRadius: 7, color: '#34d399', fontSize: 12,
            padding: '6px 12px', cursor: 'pointer',
          }}>
            {loading ? '...' : '↻ Actualizar'}
          </button>
        </div>
      </div>

      {/* Estadísticas rápidas */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Conductores',  value: stats.total,        color: '#60a5fa' },
            { label: 'Conduciendo',  value: stats.conduciendo,  color: '#22c55e' },
            { label: 'Tiempo crítico', value: stats.criticos,   color: '#f97316' },
            { label: 'Infracciones', value: stats.infracciones, color: '#ef4444' },
          ].map(s => (
            <div key={s.label} style={{
              background: '#111', border: '1px solid #222', borderRadius: 10,
              padding: '12px 20px', textAlign: 'center', minWidth: 120,
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: '#1a0000', border: '1px solid #5a1a1a',
          borderRadius: 10, padding: '20px 24px', color: '#ff6b6b',
          marginBottom: 20,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error al conectar con WeMob</div>
          <div style={{ fontSize: 13, color: '#cc4444' }}>{error}</div>
          {error.includes('no existe') || error.includes('credenciales') ? (
            <div style={{ marginTop: 12, fontSize: 12, color: '#884444' }}>
              Las credenciales WeMob están pendientes de activación para acceso API.
              Contacta con WeMob para habilitar el usuario <strong>areatransit</strong> (idApp=4).
            </div>
          ) : null}
        </div>
      )}

      {/* Loading */}
      {loading && !drivers && (
        <div style={{ textAlign: 'center', color: '#555', padding: 60, fontSize: 14 }}>
          Cargando datos del tacógrafo...
        </div>
      )}

      {/* Tabla */}
      {drivers && drivers.length > 0 && (
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0d0d0d', borderBottom: '1px solid #333' }}>
                {[
                  'Conductor',
                  'Estado',
                  'Conducción hoy',
                  'Otros trabajos',
                  'Cond. continua',
                  'Descanso hoy',
                  'Tiempo restante',
                  'Rest. semanal',
                ].map(h => (
                  <th key={h} style={{
                    padding: '12px 14px', textAlign: 'left',
                    fontSize: 11, fontWeight: 700, color: '#555',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drivers.map(d => (
                <FilaConductor key={d.driverId} d={d} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sin conductores */}
      {drivers && drivers.length === 0 && (
        <div style={{ textAlign: 'center', color: '#555', padding: 60, fontSize: 14 }}>
          No hay conductores activos en este momento.
        </div>
      )}

      {/* Leyenda */}
      <div style={{ marginTop: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: '#444' }}>
          <strong style={{ color: '#555' }}>Tiempo restante:</strong>&nbsp;
          <span style={{ color: '#22c55e' }}>■ &gt;2 h</span>&nbsp;&nbsp;
          <span style={{ color: '#eab308' }}>■ 1–2 h</span>&nbsp;&nbsp;
          <span style={{ color: '#f97316' }}>■ &lt;1 h</span>&nbsp;&nbsp;
          <span style={{ color: '#ef4444' }}>■ Infracción/agotado</span>
        </div>
        <div style={{ fontSize: 11, color: '#444' }}>
          Actualización automática cada 5 min · Fuente: WeMob
        </div>
      </div>
    </div>
  );
}
