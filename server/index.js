require('dotenv').config({ path: '../.env' });
const express  = require('express');
const cors     = require('cors');
const { google } = require('googleapis');
const path     = require('path');

const CENTROS  = require('./centros');
const { requireCentroAccess, setupAuthRoutes } = require('./auth');

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ── Credenciales Google ────────────────────────────────────────────────────────
const CREDENTIALS_PATH = path.join(__dirname, '..', 'celtic-client-485117-p4-f4378a3f13f0.json');

async function getSheetsClient() {
  const authConfig = process.env.GOOGLE_CREDENTIALS
    ? { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS) }
    : { keyFile: CREDENTIALS_PATH };
  const auth = new google.auth.GoogleAuth({
    ...authConfig,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

async function fetchSheet(sheetId, range) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  return res.data.values || [];
}

// ── Cache keyed por centro ─────────────────────────────────────────────────────
// Estructura: _cache[centroId][tipo] = { ts, rows }
const _cache = {};
const TTL_MS = 60_000;

function getCached(centroId, tipo) {
  const entry = _cache[centroId]?.[tipo];
  if (entry && (Date.now() - entry.ts < TTL_MS)) return entry.rows;
  return null;
}
function setCached(centroId, tipo, rows) {
  if (!_cache[centroId]) _cache[centroId] = {};
  _cache[centroId][tipo] = { ts: Date.now(), rows };
}

// ── Helpers generales ──────────────────────────────────────────────────────────
function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (s.includes('/')) {
    const [d, m, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}
function parseNum(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = parseFloat(String(value).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
function round2(n) { return Math.round(n * 100) / 100; }
function round1(n) { return Math.round(n * 10)  / 10;  }

// ── Loaders ────────────────────────────────────────────────────────────────────

function buildCalendarRow(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h.trim()] = row[i] ?? ''; });
  return {
    FECHA:                   parseDate(obj['FECHA']),
    MES_CLAVE:               obj['MES_CLAVE']?.trim(),
    DIA_SEMANA_NUM:          parseNum(obj['DIA_SEMANA_NUM']),
    ES_DOMINGO:              String(obj['ES_DOMINGO']).trim(),
    ES_FESTIVO_FLAG:         String(obj['ES_FESTIVO_FLAG']).trim(),
    OPERATIVO_INCL_FESTIVO:  parseNum(obj['OPERATIVO_INCL_FESTIVO']),
    OPERATIVO_EXCL_FESTIVO:  parseNum(obj['OPERATIVO_EXCL_FESTIVO']),
    CUOTA_MIN_225_INCL:      parseNum(obj['CUOTA_MIN_225_INCL']),
    CUOTA_OBJ_250_INCL:      parseNum(obj['CUOTA_OBJ_250_INCL']),
    // VIAJES_REALES_DIA ya no se usa para conteo — se calcula desde ENRUTAMIENTO
  };
}

async function getCalendarioRows(centro) {
  const cached = getCached(centro.id, 'calendario');
  if (cached) return cached;
  const raw  = await fetchSheet(centro.sheetId, `${centro.sheets.calendario}!A:N`);
  if (!raw.length) return [];
  const rows = raw.slice(1)
    .map(r => buildCalendarRow(raw[0], r))
    .filter(r => r.FECHA);
  setCached(centro.id, 'calendario', rows);
  return rows;
}

function buildEnrutRow(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h.trim()] = row[i] ?? ''; });

  // FECHA_REAL puede ser "YYYY-MM-DD" (Getafe) o solo "YYYY-MM" (Illescas → inútil)
  // Si no tiene día completo, se cae a la columna FECHA que siempre tiene "DD/MM/YYYY"
  let fechaRaw = obj['FECHA_REAL'] || '';
  const esCompleta = fechaRaw.includes('-') && fechaRaw.split('-').length === 3;
  if (!esCompleta) fechaRaw = obj['FECHA'] || '';

  let fecha = null;
  if (fechaRaw.includes('/')) {
    const parts = fechaRaw.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      fecha = `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  } else if (fechaRaw.includes('-') && fechaRaw.split('-').length === 3) {
    fecha = fechaRaw.trim();
  }

  const costeRaw = String(obj['COSTE RUTA'] || '').replace(/[€\s]/g, '').replace(',', '.');
  const coste_num = parseFloat(costeRaw) || 0;

  const planificado   = parseNum(obj['CONTADOR_PLANIFICADO']);
  const extra         = parseNum(obj['CONTADOR_EXTRAS']);
  const primeraFila   = parseNum(obj['PRIMERA_FILA_FECHA']);

  return {
    FECHA:                   fecha,
    MES_CLAVE:               obj['MES_CLAVE']?.trim() || (fecha ? fecha.slice(0, 7) : ''),
    NUM_SEMANA:              parseNum(obj['NUM_SEMANA']),
    PERIODO_MES:             obj['PERIODO_MES']?.trim(),
    TIPO_EXTRA:              obj['TIPO_EXTRA']?.trim(),
    FACTURADOR:              obj['FACTURADOR']?.trim(),
    CHOFER:                  obj['CHOFER']?.trim(),
    MATRICULAS:              obj['MATRICULAS']?.trim(),
    KM_ENRUTAMIENTO:         parseNum(obj['KM_ENRUTAMIENTO']),
    KM_TACOGRAFO:            parseNum(obj['KM_TACOGRAFO']),
    DIF_KM:                  parseNum(obj['DIF_KM']),
    COSTE_RUTA_NUM:          coste_num,
    CONTADOR_PLANIFICADO:    planificado,
    CONTADOR_EXTRAS:         extra,
    PRIMERA_FILA_FECHA:      primeraFila,
    FACTURACION_PLANIFICADA: planificado > 0 ? coste_num : 0,
    FACTURACION_EXTRA:       extra > 0 ? coste_num : 0,
    DETALLE:                 (obj['DETALLE'] || '').trim(),
    LOTE:                    (obj['LOTE']    || '').trim(),
  };
}

async function getEnrutRows(centro) {
  const cached = getCached(centro.id, 'enrut');
  if (cached) return cached;
  const raw  = await fetchSheet(centro.sheetId, `'${centro.sheets.enrutamiento}'!A:AJ`);
  if (!raw.length) return [];
  const rows = raw.slice(1)
    .map(r => buildEnrutRow(raw[0], r))
    .filter(r => r.FECHA);
  setCached(centro.id, 'enrut', rows);
  return rows;
}

function buildGasoilRow(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h.trim()] = row[i] ?? ''; });

  const fechaRaw = obj['FECHA'] || '';
  let fecha = null;
  if (fechaRaw.includes('/')) {
    const parts = fechaRaw.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      fecha = `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  } else if (fechaRaw.includes('-')) {
    fecha = fechaRaw.trim();
  }

  const litrosGasoil = parseNum(obj['LITROS GASOIL']);
  const litrosFrio   = parseNum(obj['LITROS FRIO']);
  const litrosTotal  = litrosGasoil + litrosFrio;
  const importe      = parseNum(obj['IMPORTE']);

  return {
    CONDUCTOR:       (obj['CONDUCTOR'] || '').trim(),
    FECHA:           fecha,
    KILOMETRAJE:     parseNum(obj['KILOMETRAJE']),
    LITROS_GASOIL:   litrosGasoil,
    LITROS_FRIO:     litrosFrio,
    LITROS_ADBLUE:   parseNum(obj['LITROS ADBLUE']),
    LITROS_TOTAL:    litrosTotal,
    IMPORTE:         importe,
    TRUCK_ID:        (obj['truck_id'] || '').trim(),
    EUROS_POR_LITRO: (importe > 0 && litrosTotal > 0) ? importe / litrosTotal : null,
  };
}

async function getGasoilRows(centro) {
  const cached = getCached(centro.id, 'gasoil');
  if (cached) return cached;
  const raw  = await fetchSheet(centro.sheetId, `${centro.sheets.gasoil}!A:I`);
  if (!raw.length) return [];
  const rows = raw.slice(1)
    .map(r => buildGasoilRow(raw[0], r))
    .filter(r => r.FECHA);
  setCached(centro.id, 'gasoil', rows);
  return rows;
}

// ── Rutas de autenticación ─────────────────────────────────────────────────────
setupAuthRoutes(app);

// ── Validación de centro ───────────────────────────────────────────────────────
app.param('centro', (req, res, next, centroId) => {
  const centro = CENTROS[centroId];
  if (!centro) return res.status(404).json({ error: `Centro "${centroId}" no existe` });
  req.centro = centro;
  next();
});

// ── GET /api/centros — lista de centros disponibles ───────────────────────────
// No requiere auth (el frontend necesita la lista para construir el login)
app.get('/api/centros', (req, res) => {
  const list = Object.values(CENTROS).map(({ id, label, objetivos }) => ({ id, label, objetivos }));
  res.json(list);
});

// ─────────────────────────────────────────────────────────────────────────────
// A partir de aquí todos los endpoints requieren auth + acceso al centro
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/:centro/calendario ───────────────────────────────────────────────
app.get('/api/:centro/calendario', requireCentroAccess, async (req, res) => {
  if (!req.centro.sheets.calendario) return res.json([]);
  try {
    const { desde, hasta } = req.query;
    const [calRows, enrutRows] = await Promise.all([
      getCalendarioRows(req.centro),
      getEnrutRows(req.centro),
    ]);

    // Conteo de viajes planificados y extra por día desde ENRUTAMIENTO
    // También recoge notas DETALLE de filas extra (solo si tienen texto)
    const tripsByDay = {};
    enrutRows.forEach(r => {
      if (!r.FECHA) return;
      if (!tripsByDay[r.FECHA]) tripsByDay[r.FECHA] = { planificados: 0, extra: 0, detalles: [] };
      if (r.CONTADOR_PLANIFICADO > 0) tripsByDay[r.FECHA].planificados++;
      if (r.CONTADOR_EXTRAS      > 0) {
        tripsByDay[r.FECHA].extra++;
        if (r.DETALLE) tripsByDay[r.FECHA].detalles.push(r.DETALLE);
      }
    });

    const data = calRows
      .filter(r => {
        if (!r.FECHA) return false;
        if (desde && r.FECHA < desde) return false;
        if (hasta && r.FECHA > hasta) return false;
        return r.OPERATIVO_INCL_FESTIVO === 1;
      })
      .map(r => ({
        ...r,
        VIAJES_PLANIFICADOS: tripsByDay[r.FECHA]?.planificados || 0,
        VIAJES_EXTRA:        tripsByDay[r.FECHA]?.extra        || 0,
        DETALLES_EXTRA:      tripsByDay[r.FECHA]?.detalles     || [],
      }));

    res.json(data);
  } catch (err) {
    console.error(`Error /api/${req.centro.id}/calendario:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/:centro/resumen ──────────────────────────────────────────────────
app.get('/api/:centro/resumen', requireCentroAccess, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ error: 'Parámetros "desde" y "hasta" requeridos' });
    }

    const [calRows, enrutRows] = await Promise.all([
      getCalendarioRows(req.centro),
      getEnrutRows(req.centro),
    ]);

    const mesDelRango = desde.slice(0, 7);

    // ── Calendario: días operativos y cuotas ──────────────────────────────────
    const diasMesCompleto      = calRows.filter(r => r.MES_CLAVE === mesDelRango);
    const enRango              = calRows.filter(r => r.FECHA >= desde && r.FECHA <= hasta);
    const enRangoOperativos    = enRango.filter(r => r.OPERATIVO_INCL_FESTIVO === 1);
    const diasOperativosMes    = diasMesCompleto.filter(r => r.OPERATIVO_INCL_FESTIVO === 1);
    const diasOperativosRestantes = diasOperativosMes.filter(r => r.FECHA > hasta).length;

    const objetivo_fecha_min = round2(enRangoOperativos.reduce((s, r) => s + r.CUOTA_MIN_225_INCL, 0));
    const objetivo_fecha_obj = round2(enRangoOperativos.reduce((s, r) => s + r.CUOTA_OBJ_250_INCL, 0));
    const objetivo_mensual_min = round2(diasOperativosMes.reduce((s, r) => s + r.CUOTA_MIN_225_INCL, 0));
    const objetivo_mensual_obj = round2(diasOperativosMes.reduce((s, r) => s + r.CUOTA_OBJ_250_INCL, 0));

    // ── Viajes desde ENRUTAMIENTO (fuente de verdad para conteos) ─────────────
    const enrutEnRango = enrutRows.filter(r => r.FECHA >= desde && r.FECHA <= hasta);
    const viajes_planificados = enrutEnRango.filter(r => r.CONTADOR_PLANIFICADO > 0).length;
    const viajes_extra        = enrutEnRango.filter(r => r.CONTADOR_EXTRAS      > 0).length;

    const desv_fecha_min = round2(viajes_planificados - objetivo_fecha_min);
    const desv_fecha_obj = round2(viajes_planificados - objetivo_fecha_obj);

    // Media diaria basada en días con al menos un viaje
    const diasConViajes = [...new Set(
      enrutEnRango.filter(r => r.CONTADOR_PLANIFICADO > 0).map(r => r.FECHA)
    )].length;
    const media_diaria_real = diasConViajes > 0 ? round1(viajes_planificados / diasConViajes) : 0;

    const ritmo_necesario_min = diasOperativosRestantes > 0
      ? round1((objetivo_mensual_min - viajes_planificados) / diasOperativosRestantes) : null;
    const ritmo_necesario_obj = diasOperativosRestantes > 0
      ? round1((objetivo_mensual_obj - viajes_planificados) / diasOperativosRestantes) : null;

    const proyeccion_cierre = round1(viajes_planificados + media_diaria_real * diasOperativosRestantes);
    const faltan_min = Math.max(0, Math.ceil(objetivo_mensual_min - viajes_planificados));
    const faltan_obj = Math.max(0, Math.ceil(objetivo_mensual_obj - viajes_planificados));

    res.json({
      desde, hasta,
      mes: mesDelRango,
      objetivos: req.centro.objetivos,
      // Viajes
      viajes_planificados,
      viajes_extra,
      // Bloque A
      objetivo_fecha_min,
      objetivo_fecha_obj,
      desv_fecha_min,
      desv_fecha_obj,
      // Bloque B
      objetivo_mensual_min,
      objetivo_mensual_obj,
      dias_operativos_restantes: diasOperativosRestantes,
      media_diaria_real,
      ritmo_necesario_min,
      ritmo_necesario_obj,
      proyeccion_cierre,
      faltan_min,
      faltan_obj,
    });
  } catch (err) {
    console.error(`Error /api/${req.centro.id}/resumen:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/:centro/facturacion ──────────────────────────────────────────────
app.get('/api/:centro/facturacion', requireCentroAccess, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const rows = await getEnrutRows(req.centro);
    const filtradas = rows.filter(r => {
      if (!r.FECHA) return false;
      if (desde && r.FECHA < desde) return false;
      if (hasta && r.FECHA > hasta) return false;
      return true;
    });

    const byFecha = {};
    filtradas.forEach(r => {
      const k = r.FECHA;
      if (!byFecha[k]) byFecha[k] = { fecha: k, planificada: 0, extra: 0, total: 0, viajes: 0 };
      byFecha[k].planificada += r.FACTURACION_PLANIFICADA;
      byFecha[k].extra       += r.FACTURACION_EXTRA;
      byFecha[k].total       += r.FACTURACION_PLANIFICADA + r.FACTURACION_EXTRA;
      byFecha[k].viajes      += 1;
    });

    const byFact = {};
    filtradas.forEach(r => {
      if (!r.FACTURADOR) return;
      // Si es autónomo, desglosar por nombre de chofer para distinguir entre varios autónomos
      const esAutonomo = r.FACTURADOR.toUpperCase().includes('AUTONOMO') ||
                         r.FACTURADOR.toUpperCase().includes('AUTÓNOMO');
      const clave = esAutonomo && r.CHOFER ? `Autónomo · ${r.CHOFER}` : r.FACTURADOR;
      if (!byFact[clave]) byFact[clave] = { facturador: clave, total: 0 };
      byFact[clave].total += r.FACTURACION_PLANIFICADA + r.FACTURACION_EXTRA;
    });

    const byMat = {};
    filtradas.forEach(r => {
      if (!r.MATRICULAS) return;
      if (!byMat[r.MATRICULAS]) byMat[r.MATRICULAS] = { matricula: r.MATRICULAS, total: 0, viajes: 0, detalles: [] };
      byMat[r.MATRICULAS].total  += r.FACTURACION_PLANIFICADA + r.FACTURACION_EXTRA;
      byMat[r.MATRICULAS].viajes += 1;
      if (r.DETALLE) {
        const fechaFmt = r.FECHA ? r.FECHA.split('-').reverse().join('/') : '';
        byMat[r.MATRICULAS].detalles.push(fechaFmt ? `${fechaFmt}: ${r.DETALLE}` : r.DETALLE);
      }
    });

    // Agrupación por LOTE (Illescas) — usa COSTE_RUTA_NUM directamente
    // porque CONTADOR_PLANIFICADO/EXTRAS pueden tener formato distinto en Illescas
    const byLote = {};
    filtradas.forEach(r => {
      if (!r.LOTE) return;
      if (!byLote[r.LOTE]) byLote[r.LOTE] = { lote: r.LOTE, total: 0, viajes: 0 };
      byLote[r.LOTE].total  += r.COSTE_RUTA_NUM;
      byLote[r.LOTE].viajes += 1;
    });

    res.json({
      porDia:        Object.values(byFecha).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      porFacturador: Object.values(byFact).sort((a, b) => b.total - a.total),
      porMatricula:  Object.values(byMat).sort((a, b) => b.total - a.total).slice(0, 10),
      porLote:       Object.values(byLote).sort((a, b) => b.total - a.total),
    });
  } catch (err) {
    console.error(`Error /api/${req.centro.id}/facturacion:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/:centro/facturacion/resumen ──────────────────────────────────────
app.get('/api/:centro/facturacion/resumen', requireCentroAccess, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ error: 'Parámetros "desde" y "hasta" requeridos' });
    }

    const [rows, calRows] = await Promise.all([
      getEnrutRows(req.centro),
      getCalendarioRows(req.centro),
    ]);

    const filtradas     = rows.filter(r => r.FECHA && r.FECHA >= desde && r.FECHA <= hasta);
    const planificadas  = filtradas.filter(r => r.CONTADOR_PLANIFICADO > 0);
    const extras        = filtradas.filter(r => r.CONTADOR_EXTRAS      > 0);

    const fact_planificada      = planificadas.reduce((s, r) => s + r.COSTE_RUTA_NUM, 0);
    const fact_extra            = extras.reduce((s, r) => s + r.COSTE_RUTA_NUM, 0);
    const fact_total            = fact_planificada + fact_extra;
    const num_viajes_planificados = planificadas.length;

    const costes_plan     = planificadas.map(r => r.COSTE_RUTA_NUM).filter(c => c > 0);
    const precio_minimo   = costes_plan.length > 0 ? Math.min(...costes_plan) : 0;
    const precio_medio    = costes_plan.length > 0
      ? costes_plan.reduce((s, c) => s + c, 0) / costes_plan.length : 0;

    const diasUnicos       = [...new Set(filtradas.map(r => r.FECHA))].length;
    const fact_media_diaria = diasUnicos > 0 ? fact_total / diasUnicos : 0;
    const porcentaje_extra  = fact_total > 0 ? (fact_extra / fact_total) * 100 : 0;

    const { min, obj } = req.centro.objetivos;
    const obj_min = min * precio_minimo;
    const obj_obj = obj * precio_minimo;
    const obj_media_min = min * precio_medio;
    const obj_media_obj = obj * precio_medio;

    const mesDelRango = desde.slice(0, 7);
    const diasMesOp   = calRows.filter(r => r.MES_CLAVE === mesDelRango && r.OPERATIVO_INCL_FESTIVO === 1);
    const dias_operativos_mes       = diasMesOp.length;
    const dias_operativos_restantes = diasMesOp.filter(r => r.FECHA > hasta).length;
    const proyeccion_cierre_euros   = fact_total + fact_media_diaria * dias_operativos_restantes;
    const ritmo_diario_min = dias_operativos_mes > 0 ? obj_min / dias_operativos_mes : 0;
    const ritmo_diario_obj = dias_operativos_mes > 0 ? obj_obj / dias_operativos_mes : 0;

    const r2 = n => Math.round(n * 100) / 100;
    const r1 = n => Math.round(n * 10)  / 10;

    res.json({
      desde, hasta,
      objetivos: req.centro.objetivos,
      fact_planificada:      r2(fact_planificada),
      fact_extra:            r2(fact_extra),
      fact_total:            r2(fact_total),
      precio_minimo:         r2(precio_minimo),
      precio_medio:          r2(precio_medio),
      num_viajes_planificados,
      fact_media_diaria:     r2(fact_media_diaria),
      porcentaje_extra:      r1(porcentaje_extra),
      dias_operativos_mes,
      dias_operativos_restantes,
      proyeccion_cierre_euros: r2(proyeccion_cierre_euros),
      ritmo_diario_min:      r2(ritmo_diario_min),
      ritmo_diario_obj:      r2(ritmo_diario_obj),
      obj_min:               r2(obj_min),
      obj_obj:               r2(obj_obj),
      desv_min:              r2(fact_planificada - obj_min),
      desv_obj:              r2(fact_planificada - obj_obj),
      obj_media_min:         r2(obj_media_min),
      obj_media_obj:         r2(obj_media_obj),
      desv_media_min:        r2(fact_planificada - obj_media_min),
      desv_media_obj:        r2(fact_planificada - obj_media_obj),
    });
  } catch (err) {
    console.error(`Error /api/${req.centro.id}/facturacion/resumen:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/:centro/gasoil ───────────────────────────────────────────────────
app.get('/api/:centro/gasoil', requireCentroAccess, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const rows = await getGasoilRows(req.centro);
    const data = rows.filter(r => (!desde || r.FECHA >= desde) && (!hasta || r.FECHA <= hasta));
    res.json(data);
  } catch (err) {
    console.error(`Error /api/${req.centro.id}/gasoil:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/:centro/gasoil/resumen ──────────────────────────────────────────
app.get('/api/:centro/gasoil/resumen', requireCentroAccess, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'Parámetros desde y hasta requeridos' });

    const rows = await getGasoilRows(req.centro);
    const fil  = rows.filter(r => r.FECHA >= desde && r.FECHA <= hasta);

    const total_litros   = fil.reduce((s, r) => s + r.LITROS_TOTAL, 0);
    const total_importe  = fil.reduce((s, r) => s + r.IMPORTE,      0);
    const num_repostajes = fil.length;
    const km_vals = fil.filter(r => r.KILOMETRAJE > 0).map(r => r.KILOMETRAJE);
    const km_medio_repostaje      = km_vals.length > 0 ? km_vals.reduce((a, b) => a + b, 0) / km_vals.length : 0;
    const euros_por_litro_medio   = total_litros > 0 ? total_importe / total_litros : 0;

    const byCond = {};
    fil.forEach(r => {
      const k = r.CONDUCTOR || 'Sin conductor';
      if (!byCond[k]) byCond[k] = { conductor: k, litros: 0, importe: 0, n: 0, km_sum: 0, km_n: 0, fechas: [], sin_ticket: 0 };
      byCond[k].litros  += r.LITROS_TOTAL;
      byCond[k].importe += r.IMPORTE;
      byCond[k].n       += 1;
      if (r.KILOMETRAJE > 0) { byCond[k].km_sum += r.KILOMETRAJE; byCond[k].km_n += 1; }
      if (r.FECHA) byCond[k].fechas.push(r.FECHA);
      if (r.IMPORTE === 0) byCond[k].sin_ticket += 1;
    });

    const r2 = n => Math.round(n * 100) / 100;
    const porConductor = Object.values(byCond).map(c => ({
      conductor:              c.conductor,
      num_repostajes:         c.n,
      total_litros:           r2(c.litros),
      total_importe:          r2(c.importe),
      km_medio_repostaje:     c.km_n > 0 ? r2(c.km_sum / c.km_n) : 0,
      euros_por_litro_medio:  c.litros > 0 && c.importe > 0 ? r2(c.importe / c.litros) : null,
      fecha_ultimo_repostaje: c.fechas.length > 0 ? [...c.fechas].sort().at(-1) : null,
      num_sin_ticket:         c.sin_ticket,
    })).sort((a, b) => b.total_importe - a.total_importe);

    const byTruck = {};
    fil.forEach(r => {
      const k = r.TRUCK_ID || 'Sin matrícula';
      if (!byTruck[k]) byTruck[k] = { truck_id: k, litros: 0, importe: 0, n: 0, fechas: [] };
      byTruck[k].litros  += r.LITROS_TOTAL;
      byTruck[k].importe += r.IMPORTE;
      byTruck[k].n       += 1;
      if (r.FECHA) byTruck[k].fechas.push(r.FECHA);
    });

    const porTruck = Object.values(byTruck).map(t => ({
      truck_id:               t.truck_id,
      num_repostajes:         t.n,
      total_litros:           r2(t.litros),
      total_importe:          r2(t.importe),
      euros_por_litro_medio:  t.litros > 0 && t.importe > 0 ? r2(t.importe / t.litros) : null,
      fecha_ultimo_repostaje: t.fechas.length > 0 ? [...t.fechas].sort().at(-1) : null,
    })).sort((a, b) => b.total_importe - a.total_importe);

    res.json({
      global: {
        total_litros:          r2(total_litros),
        total_importe:         r2(total_importe),
        num_repostajes,
        km_medio_repostaje:    r2(km_medio_repostaje),
        euros_por_litro_medio: round1(euros_por_litro_medio),
      },
      porConductor,
      porTruck,
    });
  } catch (err) {
    console.error(`Error /api/${req.centro.id}/gasoil/resumen:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/:centro/km-desviacion ────────────────────────────────────────────
app.get('/api/:centro/km-desviacion', requireCentroAccess, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'Parámetros desde y hasta requeridos' });

    const rows = await getEnrutRows(req.centro);
    const fil  = rows.filter(r =>
      r.FECHA >= desde && r.FECHA <= hasta &&
      r.KM_TACOGRAFO > 0 && r.KM_ENRUTAMIENTO > 0
    );

    const r1 = n => Math.round(n * 10) / 10;

    const byPair = {};
    fil.forEach(r => {
      const k = `${r.CHOFER}||${r.MATRICULAS}`;
      if (!byPair[k]) byPair[k] = { chofer: r.CHOFER, matricula: r.MATRICULAS, google: 0, taco: 0, dif: 0, n: 0 };
      byPair[k].google += r.KM_ENRUTAMIENTO;
      byPair[k].taco   += r.KM_TACOGRAFO;
      byPair[k].dif    += r.DIF_KM;
      byPair[k].n      += 1;
    });

    const porChoferMatricula = Object.values(byPair).map(p => {
      const desv_pct = p.google > 0 ? (p.taco - p.google) / p.google * 100 : 0;
      return {
        chofer:                    p.chofer || '—',
        matricula:                 p.matricula || '—',
        num_rutas:                 p.n,
        km_google_total:           r1(p.google),
        km_tacografo_total:        r1(p.taco),
        desviacion_total:          r1(p.dif),
        desviacion_pct:            r1(desv_pct),
        desviacion_media_por_ruta: r1(p.dif / p.n),
      };
    }).sort((a, b) => Math.abs(b.desviacion_pct) - Math.abs(a.desviacion_pct));

    res.json({
      global: {
        desviacion_km_total:    r1(fil.reduce((s, r) => s + r.DIF_KM,           0)),
        desviacion_km_media:    fil.length > 0 ? r1(fil.reduce((s, r) => s + r.DIF_KM, 0) / fil.length) : 0,
        num_rutas:              fil.length,
        km_google_total:        r1(fil.reduce((s, r) => s + r.KM_ENRUTAMIENTO, 0)),
        km_tacografo_total:     r1(fil.reduce((s, r) => s + r.KM_TACOGRAFO,    0)),
      },
      porChoferMatricula,
    });
  } catch (err) {
    console.error(`Error /api/${req.centro.id}/km-desviacion:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Areatrans API en http://localhost:${PORT}`));
}

module.exports = app;
