import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { getToken } from '../context/AuthContext';

const API = process.env.REACT_APP_API_URL || '';

// ── Constantes legales (Reglamento CE 561/2006) ───────────────────────────────
const MAX_COND_DIARIA    = 9    * 3600;  // 9 h (extendible a 10h máx 2×/sem)
const MAX_COND_CONTINUA  = 4.5  * 3600;  // 4 h 30 min sin pausa
const WARN_CONTINUA_1    = 3.5  * 3600;  // aviso a las 3 h 30 min
const WARN_CONTINUA_2    = 4    * 3600;  // aviso urgente a las 4 h
const MIN_DESCANSO_DIA   = 11   * 3600;  // descanso diario mínimo
const MAX_DESCANSO_SEM   = 45   * 3600;  // descanso semanal normal
const WARN_DESCANSO_SEM  = 24   * 3600;  // reducido (solo 2×/2 semanas)
const WARN_DISPONIBLE    = 2    * 3600;  // queda menos de 2 h de conducción

const ESTADOS_LABEL = {
  0: 'Conduciendo',
  1: 'Otros trabajos',
  2: 'Disponible',
  3: 'Descansando',
};

// ── Calcular situación del conductor ─────────────────────────────────────────
// NOTA: `availableTime` de WeMob = tiempo acumulado en estado tacógrafo "disponible"
// (estado 2, cuando el conductor espera carga/descarga). NO es tiempo restante de conducción.
// Si es 0 significa que el conductor no ha estado en ese estado hoy — completamente normal.
// El tiempo restante de conducción = MAX_COND_DIARIA - drivingTime.
const LABEL_ESTADO_PLANTILLA = { BAJA: 'De baja médica', VACACIONES: 'De vacaciones', LIBRE: 'Día libre' };

function calcSituacion(d, esHoy) {
  // ── INACTIVO (de baja, vacaciones, libre — marcado en plantilla) ──────────
  if (d.estadoPlantilla && d.estadoPlantilla !== 'ACTIVO') {
    return {
      nivel: 'inactivo',
      titulo: LABEL_ESTADO_PLANTILLA[d.estadoPlantilla] || d.estadoPlantilla,
      detalle: 'Sin actividad esperada según plantilla.',
      color: '#555', bg: '#1a1a1a', emoji: '⬜',
    };
  }

  const haConducidoHoy   = d.drivingTime  > 0;
  const conduccionMaxima = d.drivingTime  >= MAX_COND_DIARIA; // ≥ 9h
  const excessoReal      = d.overdriving  > 300 && conduccionMaxima; // >5min Y han conducido 9h+
  const velAlert         = (d.pendingSpeedAlm || 0) > 0;

  // ── ROJO ─────────────────────────────────────────────────────────────────
  if (d.tarjetaOlvidada) return {
    nivel: 'rojo',
    titulo: 'Tarjeta olvidada',
    detalle: `El tacógrafo lleva más de 16 h registrando "${d.tarjetaOlvidada.tipo}" sin parar. La tarjeta no se ha retirado.`,
    color: '#f97316', bg: '#2d1200', emoji: '📛',
  };
  if (d.infraction > 0) return {
    nivel: 'rojo',
    titulo: `Infracción${d.infraction > 1 ? 'es' : ''} en tacógrafo`,
    detalle: `Hay ${d.infraction} infracción${d.infraction > 1 ? 'es' : ''} registrada${d.infraction > 1 ? 's' : ''} (puede incluir velocidad, conducción o descanso). Revisar el tacógrafo.`,
    color: '#ef4444', bg: '#2d0000', emoji: '🚫',
  };
  if (conduccionMaxima || excessoReal) return {
    nivel: 'rojo',
    titulo: 'Exceso de conducción diaria',
    detalle: `Ha conducido ${fmtSeg(d.drivingTime)} hoy. El límite son 9 h/día (excepcionalmente 10 h máx 2 veces/semana). No puede conducir más hoy.`,
    color: '#ef4444', bg: '#2d0000', emoji: '⛔',
  };
  if (esHoy && d.continousDriving >= MAX_COND_CONTINUA) return {
    nivel: 'rojo',
    titulo: 'Pausa obligatoria superada',
    detalle: `Lleva ${fmtSeg(d.continousDriving)} conduciendo sin pausa. El límite son 4 h 30 min. Debe detener el vehículo ya y descansar al menos 45 min.`,
    color: '#ef4444', bg: '#2d0000', emoji: '⛔',
  };
  if (esHoy && d.weekDrivingRest != null && d.weekDrivingRest <= 0) return {
    nivel: 'rojo',
    titulo: 'Descanso semanal agotado',
    detalle: 'El descanso semanal está agotado. No puede trabajar más esta semana sin el descanso reglamentario (mín. 45 h).',
    color: '#ef4444', bg: '#2d0000', emoji: '🚫',
  };
  if (velAlert) return {
    nivel: 'rojo',
    titulo: `${d.pendingSpeedAlm} alerta${d.pendingSpeedAlm > 1 ? 's' : ''} de velocidad`,
    detalle: `Hay ${d.pendingSpeedAlm} exceso${d.pendingSpeedAlm > 1 ? 's' : ''} de velocidad pendiente${d.pendingSpeedAlm > 1 ? 's' : ''} de revisar en el vehículo ${d.vehicle || ''}.`,
    color: '#ef4444', bg: '#2d0000', emoji: '🚗',
  };

  // Tiempo restante de conducción hoy (basado en 9h máximo)
  const restanteCond = Math.max(0, MAX_COND_DIARIA - d.drivingTime);

  // ── URGENTE (actuar en < 30 min) ─────────────────────────────────────────
  if (esHoy && d.continousDriving >= WARN_CONTINUA_2) return {
    nivel: 'urgente',
    titulo: 'Pausa obligatoria en breve',
    detalle: `Lleva ${fmtSeg(d.continousDriving)} conduciendo sin pausa. Le quedan ${fmtSeg(MAX_COND_CONTINUA - d.continousDriving)} antes de que sea obligatorio parar 45 min.`,
    color: '#f97316', bg: '#2d1200', emoji: '⚠️',
  };
  if (esHoy && haConducidoHoy && restanteCond < 3600) return {
    nivel: 'urgente',
    titulo: 'Tiempo de conducción crítico',
    detalle: `Solo le quedan ${fmtSeg(restanteCond)} de las 9 h diarias. Planifica el regreso urgente.`,
    color: '#f97316', bg: '#2d1200', emoji: '⚠️',
  };
  if (esHoy && d.weekDrivingRest != null && d.weekDrivingRest < WARN_DESCANSO_SEM) return {
    nivel: 'urgente',
    titulo: 'Descanso semanal bajo',
    detalle: `Le quedan ${fmtSeg(d.weekDrivingRest)} de descanso semanal. El mínimo reglamentario es 45 h (reducido a 24 h máx 2 veces en 2 semanas).`,
    color: '#f97316', bg: '#2d1200', emoji: '⚠️',
  };

  // ── AVISO (vigilar hoy) ───────────────────────────────────────────────────
  if (esHoy && d.continousDriving >= WARN_CONTINUA_1) return {
    nivel: 'aviso',
    titulo: 'Pausa próxima',
    detalle: `Lleva ${fmtSeg(d.continousDriving)} conduciendo. Tiene ${fmtSeg(MAX_COND_CONTINUA - d.continousDriving)} antes de pausa obligatoria.`,
    color: '#eab308', bg: '#2a2000', emoji: '🟡',
  };
  if (esHoy && haConducidoHoy && restanteCond < WARN_DISPONIBLE) return {
    nivel: 'aviso',
    titulo: 'Tiempo de conducción limitado',
    detalle: `Le quedan ${fmtSeg(restanteCond)} de las 9 h diarias. Ten en cuenta el trayecto de vuelta.`,
    color: '#eab308', bg: '#2a2000', emoji: '🟡',
  };
  if (esHoy && d.weekDrivingRest != null && d.weekDrivingRest < MAX_DESCANSO_SEM) return {
    nivel: 'aviso',
    titulo: 'Descanso semanal inferior al normal',
    detalle: `Le quedan ${fmtSeg(d.weekDrivingRest)} de descanso semanal (mínimo ideal: 45 h).`,
    color: '#eab308', bg: '#2a2000', emoji: '🟡',
  };

  // ── OK ────────────────────────────────────────────────────────────────────
  const restante = esHoy ? Math.max(0, MAX_COND_DIARIA - d.drivingTime) : 0;
  const puedeConducir = esHoy && haConducidoHoy && restante > 0
    ? `Puede conducir ${fmtSeg(restante)} más hoy.`
    : '';
  return {
    nivel: 'ok',
    titulo: 'En regla',
    detalle: puedeConducir || (haConducidoHoy ? `Conducción hoy: ${fmtSeg(d.drivingTime)}. Sin incidencias.` : 'Sin actividad registrada hoy.'),
    color: '#22c55e', bg: '#052e16', emoji: '✅',
  };
}

function fmtSeg(s) {
  if (s == null || isNaN(s)) return '—';
  if (s === 0) return '0:00';
  const abs = Math.abs(s);
  const h   = Math.floor(abs / 3600);
  const m   = Math.floor((abs % 3600) / 60);
  return `${s < 0 ? '-' : ''}${h}h ${String(m).padStart(2, '0')}min`;
}

function fmtH(s) {
  if (s == null || isNaN(s) || s === 0) return '0:00';
  const abs = Math.abs(s);
  const h   = Math.floor(abs / 3600);
  const m   = Math.floor((abs % 3600) / 60);
  return `${s < 0 ? '-' : ''}${h}:${String(m).padStart(2, '0')}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Barra de progreso ─────────────────────────────────────────────────────────
function Barra({ valor, maximo, color, height = 5 }) {
  const pct = Math.min(100, Math.max(0, valor / maximo * 100));
  const c   = color || (pct >= 95 ? '#ef4444' : pct >= 80 ? '#f97316' : pct >= 60 ? '#eab308' : '#22c55e');
  return (
    <div style={{ background: '#1e1e1e', borderRadius: 3, height, width: '100%', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  );
}

// ── Timeline de actividad (cargado lazy al expandir) ─────────────────────────
const TL_STATE_COLOR = { 4: '#3b82f6', 3: '#22c55e', 1: '#f97316', 2: '#6b7280' };
const TL_STATE_LABEL = { 4: 'Conduciendo', 3: 'Descansando', 1: 'Otros trabajos', 2: 'Disponible' };

function TimelineSection({ driverId, centro, esHoy }) {
  const [timeline, setTimeline] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const fetched = useRef(false);
  const token = getToken();

  useEffect(() => {
    if (!esHoy || !driverId || fetched.current) return;
    fetched.current = true;
    setLoading(true);
    axios.get(`${API}/api/${centro}/tacografo-timeline/${driverId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .then(({ data }) => setTimeline(data.timeline || []))
    .catch(() => setTimeline([]))
    .finally(() => setLoading(false));
  }, [driverId, centro, esHoy, token]);

  if (!esHoy) return null;
  if (loading) return (
    <BloqueDetalle titulo="Actividad del día">
      <div style={{ fontSize: 11, color: '#555' }}>Cargando...</div>
    </BloqueDetalle>
  );
  if (!timeline || timeline.length === 0) return null;

  const totalMs = timeline.reduce((s, e) => s + Math.max(0, e.endMs - e.startMs), 0);
  const firstStart = timeline[0]?.startMs || 0;
  const lastEnd    = timeline[timeline.length - 1]?.endMs || 0;
  const fmt = ms => ms ? new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <BloqueDetalle titulo="Actividad del día (timeline)">
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#555', marginBottom: 4 }}>
        <span>{fmt(firstStart)}</span>
        <span>{fmt(lastEnd)}</span>
      </div>
      <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', background: '#1a1a1a' }}>
        {totalMs > 0 && timeline.map((e, i) => {
          const dur = Math.max(0, e.endMs - e.startMs);
          return (
            <div key={i}
              title={`${TL_STATE_LABEL[e.state] || 'Desconocido'}: ${e.durationMin} min`}
              style={{ width: `${dur / totalMs * 100}%`, background: TL_STATE_COLOR[e.state] || '#333', minWidth: 1 }} />
          );
        })}
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {Object.entries(
          timeline.reduce((acc, e) => {
            const k = e.state;
            acc[k] = (acc[k] || 0) + e.durationMin;
            return acc;
          }, {})
        ).map(([state, mins]) => (
          <span key={state} style={{ fontSize: 10, color: TL_STATE_COLOR[state] || '#666' }}>
            {TL_STATE_LABEL[state] || `Estado ${state}`}: {mins}min
          </span>
        ))}
      </div>
    </BloqueDetalle>
  );
}

// ── Tarjeta de conductor (vista compacta) ─────────────────────────────────────
function TarjetaConductor({ d, expanded, onToggle, esHoy, centro }) {
  const sit    = calcSituacion(d, esHoy);
  const nombre = d.name || d.alias || `#${d.driverId}`;
  const estado = ESTADOS_LABEL[d.actualState] ?? '—';

  const condColor  = d.drivingTime >= MAX_COND_DIARIA ? '#ef4444' : d.drivingTime >= 7*3600 ? '#f97316' : '#e5e5e5';
  const restanteConductor = esHoy ? Math.max(0, MAX_COND_DIARIA - d.drivingTime) : 0;
  const dispColor  = restanteConductor <= 0 ? '#ef4444' : restanteConductor < 3600 ? '#f97316' : restanteConductor < WARN_DISPONIBLE ? '#eab308' : '#22c55e';
  const pausaTomada = d.drivingTime > 0 && d.restingTime >= 2700; // ≥45min descanso acumulado

  return (
    <div
      onClick={onToggle}
      style={{
        background: '#111',
        border: `1px solid ${sit.nivel === 'ok' || sit.nivel === 'inactivo' ? '#1e1e1e' : sit.color + '55'}`,
        borderLeft: `4px solid ${sit.color}`,
        borderRadius: 10,
        padding: '12px 16px',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
        marginBottom: 4,
        opacity: sit.nivel === 'inactivo' ? 0.6 : 1,
      }}
    >
      {/* Fila 1: semáforo + nombre + badges de situación */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: sit.bg, border: `1px solid ${sit.color}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>
          {sit.emoji}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#e5e5e5' }}>{nombre}</span>
            {d.vehicle && d.vehicle !== '--' && (
              <span style={{ fontSize: 11, color: '#555', background: '#1a1a1a',
                border: '1px solid #2a2a2a', borderRadius: 4, padding: '1px 6px' }}>
                {d.vehicle}
              </span>
            )}
            {!d.enPlantilla && (
              <span style={{ fontSize: 10, color: '#555', border: '1px solid #222', borderRadius: 4, padding: '1px 5px' }}>
                externo
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: sit.color, background: sit.bg, padding: '1px 8px', borderRadius: 5 }}>
              {sit.titulo}
            </span>
            {esHoy && d.actualState != null && sit.nivel !== 'inactivo' && (
              <span style={{ fontSize: 11, color: '#666' }}>{estado}</span>
            )}
          </div>
          {sit.nivel !== 'inactivo' && (
            <div style={{ fontSize: 11, color: '#555', marginTop: 2, lineHeight: 1.4 }}>{sit.detalle}</div>
          )}
        </div>

        <span style={{ fontSize: 12, color: expanded ? '#60a5fa' : '#444', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Fila 2: los 4 tiempos + km + vel.max + pausa */}
      {sit.nivel !== 'inactivo' && (
        <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', paddingLeft: 50 }}>
          <ChipTiempo label="Cond." valor={fmtH(d.drivingTime)} color={condColor} />
          <ChipTiempo label="Desc." valor={fmtH(d.restingTime)} color={d.restingTime >= MIN_DESCANSO_DIA ? '#22c55e' : '#888'} />
          <ChipTiempo label="Otros" valor={d.workingTime > 0 ? fmtH(d.workingTime) : '—'} color="#60a5fa" />
          {esHoy && (
            <ChipTiempo label="Restante" valor={restanteConductor <= 0 ? 'Agotado' : fmtH(restanteConductor)} color={dispColor} />
          )}
          {esHoy && d.availableTime > 0 && (
            <ChipTiempo label="Espera" valor={fmtH(d.availableTime)} color="#555" />
          )}
          {esHoy && d.continousDriving != null && d.continousDriving > 0 && (
            <ChipTiempo label="Continua" valor={fmtH(d.continousDriving)}
              color={d.continousDriving >= MAX_COND_CONTINUA ? '#ef4444' : d.continousDriving >= WARN_CONTINUA_2 ? '#f97316' : '#888'} />
          )}
          {d.kmHoy > 0 && (
            <ChipTiempo label="Km hoy" valor={`${d.kmHoy} km`} color="#888" />
          )}
          {d.maxSpeedHoy > 0 && (
            <ChipTiempo label="V.máx" valor={`${d.maxSpeedHoy} km/h`} color={d.maxSpeedHoy > 90 ? '#ef4444' : '#555'} />
          )}
          {esHoy && d.drivingTime > 3600 && (
            <span style={{ fontSize: 11, color: pausaTomada ? '#22c55e' : '#555' }}>
              Pausa {pausaTomada ? '✓' : '—'}
            </span>
          )}
          {d.horaInicio && (
            <ChipTiempo
              label="Inicio"
              valor={new Date(d.horaInicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              color="#555"
            />
          )}
          {d.horaFin && (
            <ChipTiempo
              label="Fin"
              valor={new Date(d.horaFin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              color="#22c55e"
            />
          )}
        </div>
      )}

      {/* Fila 3: barra conducción */}
      {sit.nivel !== 'inactivo' && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 50 }}>
          <span style={{ fontSize: 9, color: '#333', whiteSpace: 'nowrap', width: 70 }}>Cond / 9h</span>
          <Barra valor={d.drivingTime} maximo={MAX_COND_DIARIA} />
          {esHoy && d.continousDriving != null && d.continousDriving > 0 && (
            <>
              <span style={{ fontSize: 9, color: '#333', whiteSpace: 'nowrap', width: 80 }}>Continua / 4:30</span>
              <Barra valor={d.continousDriving} maximo={MAX_COND_CONTINUA}
                color={d.continousDriving >= MAX_COND_CONTINUA ? '#ef4444' : d.continousDriving >= WARN_CONTINUA_2 ? '#f97316' : '#eab308'} />
            </>
          )}
        </div>
      )}


      {/* Detalle expandido */}
      {expanded && (
        <div style={{
          marginTop: 14, paddingTop: 14,
          borderTop: '1px solid #1e1e1e',
          display: 'flex', gap: 28, flexWrap: 'wrap',
        }}>
          <TimelineSection driverId={d.driverId} centro={centro} esHoy={esHoy} />

          <BloqueDetalle titulo="Tiempos del día">
            <LineaDetalle label="Conducción acumulada"  valor={fmtSeg(d.drivingTime)} limite="9h/día" alerta={d.drivingTime >= MAX_COND_DIARIA} />
            <LineaDetalle label="Otros trabajos"        valor={fmtSeg(d.workingTime)} alerta={d.tarjetaOlvidada?.tipo === 'trabajo'} />
            <LineaDetalle label="Descanso acumulado"    valor={fmtSeg(d.restingTime)} ok={d.restingTime >= MIN_DESCANSO_DIA} />
            {esHoy && d.continousDriving != null && (
              <LineaDetalle label="Conducción continua" valor={fmtSeg(d.continousDriving)} limite="4h 30min" alerta={d.continousDriving >= MAX_COND_CONTINUA} />
            )}
            {d.overdriving > 0 && (
              <LineaDetalle label="Exceso conducción" valor={`+${fmtSeg(d.overdriving)}`} alerta />
            )}
          </BloqueDetalle>

          {esHoy && (
            <BloqueDetalle titulo="Tiempos restantes hoy">
              <LineaDetalle label="Puede conducir"
                valor={restanteConductor <= 0 ? 'Agotado' : fmtSeg(restanteConductor)}
                alerta={restanteConductor <= 0} ok={restanteConductor > WARN_DISPONIBLE} />
              {d.continousDriving != null && (
                <LineaDetalle label="Antes de pausa oblig."
                  valor={d.continousDriving >= MAX_COND_CONTINUA ? 'Debe parar ya' : fmtSeg(MAX_COND_CONTINUA - d.continousDriving)}
                  alerta={d.continousDriving >= MAX_COND_CONTINUA}
                  ok={d.continousDriving < WARN_CONTINUA_1} />
              )}
            </BloqueDetalle>
          )}

          {esHoy && (d.weekDrivingRest != null || d.twoWeekDrivingRest != null) && (
            <BloqueDetalle titulo="Descansos reglamentarios">
              {d.weekDrivingRest != null && (
                <LineaDetalle label="Descanso semanal restante" valor={fmtSeg(d.weekDrivingRest)}
                  alerta={d.weekDrivingRest < WARN_DESCANSO_SEM} ok={d.weekDrivingRest >= MAX_DESCANSO_SEM}
                  nota="Mín. reglamentario: 45 h (reducido: 24 h)" />
              )}
              {d.twoWeekDrivingRest != null && (
                <LineaDetalle label="Descanso bisemanal restante" valor={fmtSeg(d.twoWeekDrivingRest)} />
              )}
            </BloqueDetalle>
          )}

          <BloqueDetalle titulo="Estado normativo y alertas">
            <LineaDetalle
              label="Infracciones tacógrafo"
              valor={d.infraction > 0 ? `${d.infraction} pendiente${d.infraction > 1 ? 's' : ''}` : 'Ninguna'}
              alerta={d.infraction > 0} ok={d.infraction === 0} />
            {d.pendingSpeedAlm > 0 && (
              <>
                <LineaDetalle label="Excesos velocidad" valor={`${d.pendingSpeedAlm} alerta${d.pendingSpeedAlm > 1 ? 's' : ''}`} alerta />
                <div style={{ fontSize: 10, color: '#444', marginTop: -2, marginBottom: 2 }}>
                  Detalle (vía y límite aplicado) disponible en portal WeMob
                </div>
              </>
            )}
            {d.pendingSOSAlm > 0 && (
              <LineaDetalle label="Alertas SOS" valor={`${d.pendingSOSAlm}`} alerta />
            )}
            {d.kmHoy > 0 && (
              <LineaDetalle label="Km recorridos hoy" valor={`${d.kmHoy} km`} />
            )}
            {d.lastUpdate > 0 && (
              <LineaDetalle label="Últ. actualización tacógrafo"
                valor={new Date(d.lastUpdate).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} />
            )}
            <LineaDetalle label="En plantilla"
              valor={d.enPlantilla ? 'Sí' : 'Conductor externo'}
              ok={d.enPlantilla} />
            {d.estadoPlantilla && (
              <LineaDetalle label="Estado en plantilla"
                valor={LABEL_ESTADO_PLANTILLA[d.estadoPlantilla] || d.estadoPlantilla}
                alerta={false} />
            )}
            {d.tarjetaOlvidada && (
              <LineaDetalle label="Tarjeta olvidada"
                valor={`Probable — ${d.tarjetaOlvidada.tipo} = ${fmtSeg(d.tarjetaOlvidada.valor)}`}
                alerta />
            )}
          </BloqueDetalle>

          {(d.infraction > 0 || d.overdriving > 300 || d.tarjetaOlvidada || d.pendingSpeedAlm > 0) ? (
            <BloqueDetalle titulo="Qué hacer">
              <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.8, maxWidth: 300 }}>
                {d.infraction > 0 && <>🔴 Contactar con el conductor para revisar la infracción registrada en el tacógrafo.<br /></>}
                {(d.drivingTime >= MAX_COND_DIARIA || d.overdriving > 300) && <>⛔ No puede conducir más hoy. Organizar relevo o parada obligatoria.<br /></>}
                {d.tarjetaOlvidada && <>📛 Avisar al conductor para que retire la tarjeta del tacógrafo.<br /></>}
                {d.pendingSpeedAlm > 0 && <>🚗 Revisar {d.pendingSpeedAlm} exceso{d.pendingSpeedAlm > 1 ? 's' : ''} de velocidad en portal WeMob (incluye tipo de vía y velocidad medida).<br /></>}
              </div>
            </BloqueDetalle>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ChipTiempo({ label, valor, color }) {
  return (
    <span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap' }}>
      {label}{' '}
      <span style={{ fontWeight: 700, color: color || '#e5e5e5', fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
    </span>
  );
}

function BloqueDetalle({ titulo, children }) {
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#444', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #1a1a1a' }}>
        {titulo}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function LineaDetalle({ label, valor, limite, nota, alerta, ok }) {
  const color = alerta ? '#ef4444' : ok ? '#22c55e' : '#a3a3a3';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12 }}>
        <span style={{ color: '#555' }}>{label}</span>
        <span style={{ fontWeight: 600, color }}>
          {valor}
          {limite && <span style={{ fontWeight: 400, color: '#333', fontSize: 10 }}> / {limite}</span>}
        </span>
      </div>
      {nota && <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>{nota}</div>}
    </div>
  );
}

function FiltroToggle({ active, onClick, color, label }) {
  return (
    <button onClick={onClick} style={{
      background: active ? `${color}22` : 'transparent',
      border: `1px solid ${active ? color : '#2a2a2a'}`,
      borderRadius: 7, color: active ? color : '#555',
      fontSize: 11, padding: '5px 12px', cursor: 'pointer', transition: 'all 0.15s',
    }}>
      {active ? '✓ ' : ''}{label}
    </button>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DashboardTacografo({ centro, refreshKey }) {
  const [drivers,      setDrivers]      = useState(null);
  const [missing,      setMissing]      = useState([]);
  const [ts,           setTs]           = useState(null);
  const [esHoy,        setEsHoy]        = useState(true);
  const [error,        setError]        = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [expanded,     setExpanded]     = useState(null);

  const [fecha,         setFecha]         = useState(todayStr());
  const [busqueda,      setBusqueda]      = useState('');
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [soloPlantilla, setSoloPlantilla] = useState(true);

  const token = getToken();

  const cargar = useCallback(async (fechaParam) => {
    const f = fechaParam || fecha;
    setLoading(true);
    setError(null);
    setExpanded(null);
    try {
      const params = f !== todayStr() ? { fecha: f } : {};
      const { data } = await axios.get(`${API}/api/${centro}/tacografo`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setDrivers(data.drivers || []);
      setMissing(data.missing  || []);
      setEsHoy(data.esHoy !== false);
      setTs(data.ts);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [centro, token, fecha]);

  useEffect(() => { cargar(); }, [refreshKey]); // eslint-disable-line
  useEffect(() => {
    if (fecha !== todayStr()) return;
    const id = setInterval(() => cargar(), 5 * 60 * 1_000);
    return () => clearInterval(id);
  }, [fecha, cargar]);

  const handleFecha = (e) => { const f = e.target.value; setFecha(f); cargar(f); };

  // ── Calcular situaciones y filtrar
  const conSituacion = (drivers || []).map(d => ({
    ...d,
    _sit: calcSituacion(d, esHoy),
  }));

  const ORDEN_NIVEL = { rojo: 0, urgente: 1, aviso: 2, ok: 3 };

  const driversFiltrados = conSituacion
    .filter(d => {
      if (busqueda && !(d.alias || d.name || '').toLowerCase().includes(busqueda.toLowerCase())) return false;
      if (soloProblemas && d._sit.nivel === 'ok') return false;
      if (soloPlantilla && !d.enPlantilla) return false;
      return true;
    })
    .sort((a, b) => {
      const na = ORDEN_NIVEL[a._sit.nivel] ?? 9;
      const nb = ORDEN_NIVEL[b._sit.nivel] ?? 9;
      if (na !== nb) return na - nb;
      return (a.alias || a.name || '').localeCompare(b.alias || b.name || '');
    });

  // ── Resumen ejecutivo (excluye conductores inactivos de los semáforos)
  const nRojo     = conSituacion.filter(d => d.enPlantilla && d._sit.nivel !== 'inactivo' && (d._sit.nivel === 'rojo' || d._sit.nivel === 'urgente')).length;
  const nAviso    = conSituacion.filter(d => d.enPlantilla && d._sit.nivel !== 'inactivo' && d._sit.nivel === 'aviso').length;
  const nOk       = conSituacion.filter(d => d.enPlantilla && d._sit.nivel !== 'inactivo' && d._sit.nivel === 'ok').length;
  const nInactivo = conSituacion.filter(d => d.enPlantilla && d._sit.nivel === 'inactivo').length;
  const nTotal    = conSituacion.filter(d => d.enPlantilla && d._sit.nivel !== 'inactivo').length;
  const nVeloc    = conSituacion.filter(d => (d.pendingSpeedAlm || 0) > 0).length;

  const resumenColor  = nRojo > 0 ? '#ef4444' : nAviso > 0 ? '#eab308' : '#22c55e';
  const resumenBg     = nRojo > 0 ? '#1a0000' : nAviso > 0 ? '#1a1600' : '#001a09';
  const resumenEmoji  = nRojo > 0 ? '🔴' : nAviso > 0 ? '🟡' : '✅';
  const resumenTexto  = nRojo > 0
    ? `${nRojo} conductor${nRojo > 1 ? 'es' : ''} necesita${nRojo > 1 ? 'n' : ''} atención inmediata`
    : nAviso > 0
    ? `${nAviso} conductor${nAviso > 1 ? 'es' : ''} con aviso — sin urgencia inmediata`
    : `Todos los conductores están en regla`;

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* ── Cabecera ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
            Control de Tiempos · Tacógrafo
          </h2>
          <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
            Reglamento CE 561/2006 · Máx. 9 h conducción/día · 4 h 30 min continua · descanso mín. 11 h
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Selector de fecha */}
          <button onClick={() => { const d = new Date(fecha); d.setDate(d.getDate()-1); const f = d.toISOString().slice(0,10); setFecha(f); cargar(f); }}
            style={{ background: '#111', border: '1px solid #222', borderRadius: 5, color: '#888', fontSize: 14, padding: '4px 9px', cursor: 'pointer' }}>‹</button>
          <input type="date" value={fecha} max={todayStr()} onChange={handleFecha}
            style={{
              background: '#111', border: `1px solid ${esHoy ? '#2a3a2a' : '#2a2a5a'}`,
              borderRadius: 7, color: esHoy ? '#34d399' : '#60a5fa',
              fontSize: 12, padding: '5px 10px', outline: 'none', cursor: 'pointer',
            }} />
          <button disabled={fecha >= todayStr()}
            onClick={() => { const d = new Date(fecha); d.setDate(d.getDate()+1); const f = d.toISOString().slice(0,10); setFecha(f); cargar(f); }}
            style={{ background: '#111', border: '1px solid #222', borderRadius: 5, color: fecha >= todayStr() ? '#2a2a2a' : '#888', fontSize: 14, padding: '4px 9px', cursor: fecha >= todayStr() ? 'default' : 'pointer' }}>›</button>
          {!esHoy && (
            <button onClick={() => { const f = todayStr(); setFecha(f); cargar(f); }}
              style={{ background: '#001a09', border: '1px solid #2a3a2a', borderRadius: 6, color: '#34d399', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>
              Hoy
            </button>
          )}
          {ts && <span style={{ fontSize: 10, color: '#444' }}>{new Date(ts).toLocaleTimeString('es-ES')}</span>}
          <button onClick={() => cargar()} disabled={loading}
            style={{ background: 'transparent', border: '1px solid #2a3a2a', borderRadius: 7, color: '#34d399', fontSize: 12, padding: '5px 11px', cursor: 'pointer' }}>
            {loading ? '...' : '↻'}
          </button>
        </div>
      </div>

      {/* ── Banner fecha histórica ──────────────────────────────────────────── */}
      {!esHoy && (
        <div style={{ background: '#0c0c1a', border: '1px solid #2a2a5a', borderRadius: 8, padding: '8px 16px', marginBottom: 14, fontSize: 12, color: '#60a5fa' }}>
          📅 Datos del {new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · En histórico no hay estado en tiempo real ni conducción continua
        </div>
      )}

      {/* ── Resumen ejecutivo ───────────────────────────────────────────────── */}
      {drivers && !loading && (
        <div style={{
          background: resumenBg,
          border: `1px solid ${resumenColor}44`,
          borderRadius: 12, padding: '14px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 28 }}>{resumenEmoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: resumenColor }}>{resumenTexto}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
              {nTotal} conductor{nTotal !== 1 ? 'es' : ''} en plantilla
              {nOk > 0 && <> · <span style={{ color: '#22c55e' }}>✅ {nOk} en regla</span></>}
              {nAviso > 0 && <> · <span style={{ color: '#eab308' }}>🟡 {nAviso} con aviso</span></>}
              {nRojo > 0 && <> · <span style={{ color: '#ef4444' }}>🔴 {nRojo} urgente{nRojo > 1 ? 's' : ''}</span></>}
              {nVeloc > 0 && <> · <span style={{ color: '#ef4444' }}>🚗 {nVeloc} exceso vel.</span></>}
              {nInactivo > 0 && <> · <span style={{ color: '#444' }}>⬜ {nInactivo} inactivo{nInactivo > 1 ? 's' : ''}</span></>}
              {missing.length > 0 && <> · <span style={{ color: '#666' }}>⬛ {missing.length} sin señal</span></>}
            </div>
          </div>

          {/* Mini-contador visual */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { n: nRojo,  label: 'Urgente', color: '#ef4444', bg: '#2d0000' },
              { n: nAviso, label: 'Aviso',   color: '#eab308', bg: '#2a2000' },
              { n: nOk,    label: 'En regla',color: '#22c55e', bg: '#052e16' },
            ].map(s => (
              <div key={s.label} style={{
                background: s.bg, border: `1px solid ${s.color}44`,
                borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 70,
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.n}</div>
                <div style={{ fontSize: 10, color: '#555' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="🔍  Buscar conductor..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{
            background: '#111', border: '1px solid #2a2a2a', borderRadius: 7,
            color: '#e5e5e5', fontSize: 12, padding: '6px 12px', outline: 'none', width: 200,
          }}
        />
        <FiltroToggle active={soloProblemas} onClick={() => setSoloProblemas(!soloProblemas)}
          color="#ef4444" label="Solo con problemas" />
        <FiltroToggle active={soloPlantilla} onClick={() => setSoloPlantilla(!soloPlantilla)}
          color="#60a5fa" label="Solo mi plantilla" />
        {(busqueda || soloProblemas) && (
          <button onClick={() => { setBusqueda(''); setSoloProblemas(false); }}
            style={{ background: 'transparent', border: '1px solid #333', borderRadius: 7, color: '#666', fontSize: 11, padding: '5px 9px', cursor: 'pointer' }}>
            Limpiar
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#444' }}>
          {driversFiltrados.length} conductor{driversFiltrados.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: '#1a0000', border: '1px solid #5a1a1a', borderRadius: 10, padding: '16px 20px', color: '#ff6b6b', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Error al conectar con WeMob</div>
          <div style={{ fontSize: 12, color: '#cc4444' }}>{error}</div>
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {loading && !drivers && (
        <div style={{ textAlign: 'center', color: '#555', padding: 60, fontSize: 14 }}>
          {esHoy ? 'Cargando datos en tiempo real...' : `Consultando histórico del ${fecha}...`}
        </div>
      )}

      {/* ── Lista de conductores ─────────────────────────────────────────────── */}
      {!error && driversFiltrados.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {driversFiltrados.map(d => (
            <TarjetaConductor
              key={d.driverId}
              d={d}
              esHoy={esHoy}
              centro={centro}
              expanded={expanded === d.driverId}
              onToggle={() => setExpanded(expanded === d.driverId ? null : d.driverId)}
            />
          ))}
        </div>
      )}

      {!error && !loading && drivers && driversFiltrados.length === 0 && (
        <div style={{ textAlign: 'center', color: '#555', padding: 40, fontSize: 13 }}>
          No hay conductores con los filtros aplicados.
        </div>
      )}

      {/* ── Conductores sin señal en WeMob ──────────────────────────────────── */}
      {esHoy && missing.length > 0 && (
        <div style={{ marginTop: 16, background: '#0e0e0e', border: '1px solid #2a2a2a', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>
            ⬛ {missing.length} conductor{missing.length !== 1 ? 'es' : ''} de la plantilla sin señal en WeMob
            <span style={{ fontWeight: 400, color: '#444', marginLeft: 8 }}>— tacógrafo apagado o tarjeta no insertada</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {missing.map((n, i) => (
              <span key={i} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 5, background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#555' }}>{n}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Leyenda legal ────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 20, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 10, padding: '14px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Referencia normativa — Reg. CE 561/2006
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px 24px' }}>
          {[
            ['Conducción diaria máxima', '9 h (excepc. 10 h, máx 2×/semana)'],
            ['Conducción continua máxima', '4 h 30 min → pausa de 45 min'],
            ['Pausa mínima', '45 min (o 15 min + 30 min)'],
            ['Descanso diario mínimo', '11 h (reducible a 9 h, máx 3×/semana)'],
            ['Conducción semanal máxima', '56 h'],
            ['Descanso semanal mínimo', '45 h (reducible a 24 h, máx 2×/4 semanas)'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
              <span style={{ color: '#555' }}>{k}</span>
              <span style={{ color: '#777', fontWeight: 600, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: '#333' }}>
          Actualización automática cada 5 min · Datos en tiempo real: WeMob · Clic en cualquier conductor para ver el detalle
        </div>
      </div>
    </div>
  );
}
