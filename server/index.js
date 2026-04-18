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

    // Agrupación por LOTE (Illescas)
    const byLote = {};
    filtradas.forEach(r => {
      if (!r.LOTE) return;
      if (!byLote[r.LOTE]) byLote[r.LOTE] = { lote: r.LOTE, total: 0, viajes: 0 };
      byLote[r.LOTE].total  += r.COSTE_RUTA_NUM;
      byLote[r.LOTE].viajes += 1;
    });

    // Facturación por día desglosada por lote (para gráfico apilado)
    const byDiaLote = {};
    filtradas.forEach(r => {
      if (!r.FECHA || !r.LOTE) return;
      if (!byDiaLote[r.FECHA]) byDiaLote[r.FECHA] = { fecha: r.FECHA };
      byDiaLote[r.FECHA][`lote_${r.LOTE}`] = (byDiaLote[r.FECHA][`lote_${r.LOTE}`] || 0) + r.COSTE_RUTA_NUM;
    });

    res.json({
      porDia:        Object.values(byFecha).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      porFacturador: Object.values(byFact).sort((a, b) => b.total - a.total),
      porMatricula:  Object.values(byMat).sort((a, b) => b.total - a.total).slice(0, 10),
      porLote:       Object.values(byLote).sort((a, b) => b.total - a.total),
      porDiaLote:    Object.values(byDiaLote).sort((a, b) => a.fecha.localeCompare(b.fecha)),
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

// ── GET /api/:centro/horas ────────────────────────────────────────────────────
app.get('/api/:centro/horas', requireCentroAccess, async (req, res) => {
  if (!req.centro.sheets.horas) return res.json({ empleados: [], dias: [], data: {}, plantilla: {}, incidencias: [] });
  try {
    const { desde, hasta } = req.query;
    const hoy = new Date().toISOString().slice(0, 10);

    // ── Helpers locales ──────────────────────────────────────────────────────
    function parseFecha(v) {
      if (!v) return null;
      const s = String(v).trim();
      // Número serial de Excel (ej. 46119 = 07/04/2026)
      if (/^\d{4,5}$/.test(s)) {
        const d = new Date(Date.UTC(1899, 11, 30) + parseInt(s, 10) * 86400000);
        return d.toISOString().slice(0, 10);
      }
      // DD-MM-YYYY (guiones)
      if (s.includes('-') && s.split('-')[2]?.length === 4) {
        const [d, m, y] = s.split('-');
        return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      }
      // DD/MM/YYYY (barras)
      if (s.includes('/')) {
        const parts = s.split('/');
        if (parts[2]?.length === 4) {
          const [d, m, y] = parts;
          return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
      }
      // YYYY-MM-DD (ISO)
      return s.length === 10 ? s : null;
    }
    function horaToMin(v) {
      if (!v) return null;
      const parts = String(v).trim().split(':');
      return parseInt(parts[0],10)*60 + parseInt(parts[1]||0,10) + (parseInt(parts[2]||0,10)/60);
    }
    // Día de la semana (0=Dom,1=Lun...6=Sáb) → clave L,M,X,J,V,S,D
    const DOW_KEY = ['D','L','M','X','J','V','S'];

    // ── Normaliza nombre: minúsculas, sin tildes, sin espacios dobles ────────
    function normName(n) {
      return (n||'').toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g,' ');
    }

    // ── 1-4. Leer todas las hojas en PARALELO para evitar timeout ────────────
    const [rawP, rawI, calRows, raw] = await Promise.all([
      req.centro.sheets.plantilla
        ? fetchSheet(req.centro.sheetId, `'${req.centro.sheets.plantilla}'!A:E`).catch(e => { console.warn('[horas] No se pudo leer PLANTILLA:', e.message); return []; })
        : Promise.resolve([]),
      req.centro.sheets.incidencias
        ? fetchSheet(req.centro.sheetId, `'${req.centro.sheets.incidencias}'!A:E`).catch(e => { console.warn('[horas] No se pudo leer INCIDENCIAS:', e.message); return []; })
        : Promise.resolve([]),
      req.centro.sheets.calendario
        ? getCalendarioRows(req.centro).catch(e => { console.warn('[horas] No se pudo leer CALENDARIO:', e.message); return []; })
        : Promise.resolve([]),
      fetchSheet(req.centro.sheetId, `'${req.centro.sheets.horas}'!A:J`),
    ]);

    // ── Procesar PLANTILLA ───────────────────────────────────────────────────
    const plantillaMap = {};
    if (rawP.length > 1) {
      rawP.slice(1).forEach(row => {
        const emp  = (row[0] || '').trim();
        const dias = (row[1] || '').trim().split(',').map(d => d.trim().toUpperCase()).filter(Boolean);
        const hd   = parseFloat(row[2]) || 8;
        if (emp) plantillaMap[emp] = { diasSemana: new Set(dias), horasDia: hd };
      });
    }

    // ── Procesar INCIDENCIAS ─────────────────────────────────────────────────
    const incidenciasList = [];
    if (rawI.length > 1) {
      rawI.slice(1).forEach(row => {
        const emp   = (row[0] || '').trim();
        const tipo  = (row[1] || '').trim().toLowerCase();
        const ini   = parseFecha(row[2]);
        const fin   = parseFecha(row[3]) || null;
        const obs   = (row[4] || '').trim();
        if (emp && tipo && ini) incidenciasList.push({ empleado: emp, tipo, inicio: ini, fin, obs });
      });
    }

    // Helper: ¿está el empleado en incidencia en una fecha concreta?
    function getIncidencia(empleado, fecha) {
      const empN = normName(empleado);
      return incidenciasList.find(inc =>
        normName(inc.empleado) === empN &&
        fecha >= inc.inicio &&
        fecha <= (inc.fin || hoy)
      ) || null;
    }

    // ── Procesar FESTIVOS ────────────────────────────────────────────────────
    const festivosSet = new Set();
    calRows.forEach(r => {
      if (r.ES_FESTIVO_FLAG === '1' || r.ES_FESTIVO_FLAG === 1) festivosSet.add(r.FECHA);
    });

    // ── Fichajes ─────────────────────────────────────────────────────────────
    if (!raw.length) return res.json({ empleados: [], dias: [], data: {}, plantilla: {}, incidencias: incidenciasList });

    const headers      = raw[0].map(h => h.trim());
    const idx          = k => headers.indexOf(k);
    const iEmpleado    = idx('EMPLEADO');
    const iFecha       = idx('FECHA');
    const iHora        = idx('HORA');
    const iES          = idx('E/S');
    const iIncidencia  = idx('INCIDENCIA');

    const grupos = {};
    raw.slice(1).forEach(row => {
      const empleado   = (row[iEmpleado]   || '').trim();
      const fechaRaw   = (row[iFecha]      || '').trim();
      const hora       = (row[iHora]       || '').trim();
      const es         = (row[iES]         || '').trim().toUpperCase();
      const incidencia = (row[iIncidencia] || '').trim();

      if (!empleado || !fechaRaw || !hora || !es) return;
      const fecha = parseFecha(fechaRaw);
      if (!fecha) return;
      if (desde && fecha < desde) return;
      if (hasta && fecha > hasta) return;

      const key = `${empleado}||${fecha}`;
      if (!grupos[key]) grupos[key] = { empleado, fecha, eventos: [], incidencias: [] };
      grupos[key].eventos.push({ hora, min: horaToMin(hora), es, inc: incidencia.toLowerCase().trim() });
      if (incidencia && incidencia.toLowerCase().trim() !== 'comida') grupos[key].incidencias.push(incidencia);
    });

    // ── 5. Calcular horas por grupo ──────────────────────────────────────────
    const result      = {};
    const diasSet     = new Set();
    const empleadosSet = new Set();

    // Añadir empleados de plantilla aunque no tengan fichajes en el rango
    Object.keys(plantillaMap).forEach(emp => empleadosSet.add(emp));

    Object.values(grupos).forEach(({ empleado, fecha, eventos, incidencias }) => {
      diasSet.add(fecha);
      empleadosSet.add(empleado);

      const entradas = eventos.filter(e => e.es === 'E').sort((a,b) => a.min - b.min);
      const salidas  = eventos.filter(e => e.es === 'S').sort((a,b) => a.min - b.min);

      const pares = [], flags = [];
      const n = Math.min(entradas.length, salidas.length);
      for (let i = 0; i < n; i++) {
        const e = entradas[i], s = salidas[i];
        const horas = s.min > e.min ? (s.min - e.min) / 60 : null;
        pares.push({ entrada: e.hora, salida: s.hora, horas: horas != null ? Math.round(horas*100)/100 : null });
      }
      for (let i = n; i < entradas.length; i++) flags.push({ tipo: 'sin_salida',  hora: entradas[i].hora });
      for (let i = n; i < salidas.length;  i++) flags.push({ tipo: 'sin_entrada', hora: salidas[i].hora  });

      const totalHoras  = pares.reduce((s, p) => s + (p.horas || 0), 0);

      // ── Detección descanso de comida (Art. 34.4 ET: 15 min si jornada > 6h) ──
      const comidasS = eventos.filter(e => e.inc === 'comida' && e.es === 'S').sort((a,b) => a.min - b.min);
      const comidasE = eventos.filter(e => e.inc === 'comida' && e.es === 'E').sort((a,b) => a.min - b.min);
      let descanso = null;
      if (totalHoras * 60 >= 360) {
        // Jornada >= 6h: descanso obligatorio
        if (comidasS.length === 0) {
          descanso = { flag: 'sin_descanso', duracion: null, inicio: null, fin: null };
        } else if (comidasE.length === 0) {
          descanso = { flag: 'descanso_incompleto', duracion: null, inicio: comidasS[0].hora, fin: null };
        } else {
          const durMin = comidasE[0].min - comidasS[0].min;
          // tardío: si la salida a comer es después de 6h acumuladas desde la primera entrada
          const primerEntrada = entradas[0]?.min ?? 0;
          const minutosHastaComida = comidasS[0].min - primerEntrada;
          let flag;
          if (durMin < 15)        flag = 'descanso_corto';
          else if (minutosHastaComida >= 360) flag = 'descanso_tardio';
          else                    flag = 'ok';
          descanso = { flag, duracion: durMin, inicio: comidasS[0].hora, fin: comidasE[0].hora };
        }
      } else if (comidasS.length > 0 || comidasE.length > 0) {
        // Jornada < 6h pero hay registro de comida
        const durMin = (comidasS.length > 0 && comidasE.length > 0)
          ? comidasE[0].min - comidasS[0].min : null;
        descanso = { flag: 'no_requerido', duracion: durMin, inicio: comidasS[0]?.hora || null, fin: comidasE[0]?.hora || null };
      }

      const plantilla   = plantillaMap[empleado];
      const dowKey      = DOW_KEY[new Date(fecha + 'T12:00:00').getDay()];
      const esDiaSuyo   = plantilla?.diasSemana.has(dowKey) ?? true;
      const esFestivo   = festivosSet.has(fecha);
      // Es EXTRA si trabajó en día que no le toca O si es festivo
      const esExtra     = !esDiaSuyo || esFestivo;

      if (!result[empleado]) result[empleado] = {};
      result[empleado][fecha] = {
        horas:    Math.round(totalHoras * 100) / 100,
        completo: flags.length === 0 && pares.length > 0,
        esExtra,
        esFestivo,   // para mostrar "🎉 EXTRA" en lugar de solo "EXTRA"
        pares, flags, incidencias, descanso,
      };
    });

    // ── 6. Generar días esperados (ausencias y festivos) ─────────────────────
    // Para cada empleado de plantilla, recorrer el rango y marcar días que tocan
    if (desde && hasta) {
      const d0 = new Date(desde + 'T12:00:00');
      const d1 = new Date(hasta  + 'T12:00:00');

      // Pre-popular diasSet con todos los días que algún empleado de plantilla
      // debería trabajar — necesario para detectar libranzas correctamente
      // independientemente del orden de procesamiento de empleados.
      for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
        const fecha  = d.toISOString().slice(0,10);
        const dowKey = DOW_KEY[d.getDay()];
        if (Object.values(plantillaMap).some(p => p.diasSemana.has(dowKey))) {
          diasSet.add(fecha);
        }
      }

      for (const emp of Object.keys(plantillaMap)) {
        const p = plantillaMap[emp];
        for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
          const fecha  = d.toISOString().slice(0,10);
          const dowKey = DOW_KEY[d.getDay()];
          const debeTrabajar = p.diasSemana.has(dowKey);
          if (!debeTrabajar) {
            // Si el día está en el grid (algún empleado trabaja ese día), marcar libranza
            if (diasSet.has(fecha) && (!result[emp] || !result[emp][fecha])) {
              if (!result[emp]) result[emp] = {};
              const festivo = festivosSet.has(fecha);
              result[emp][fecha] = {
                horas: 0, completo: false, esExtra: false, pares: [], flags: [], incidencias: [],
                estadoEspecial: festivo ? 'festivo' : 'libranza',
              };
            }
            continue;
          }

          diasSet.add(fecha);
          if (!result[emp]) result[emp] = {};
          if (result[emp][fecha]) continue; // ya tiene fichaje

          const inc     = getIncidencia(emp, fecha);
          const festivo = festivosSet.has(fecha);

          result[emp][fecha] = {
            horas:     0,
            completo:  false,
            esExtra:   false,
            pares:     [],
            flags:     [],
            incidencias: [],
            // Estado especial — no hay fichaje
            estadoEspecial: inc    ? inc.tipo   :  // baja, vacaciones, permiso...
                            festivo ? 'festivo'  :
                            fecha > hoy ? 'futuro' :
                            'ausente',
            incidenciaObs: inc?.obs || null,
          };
        }
      }
    }

    // ── 7. Estadísticas de incidencias por empleado ──────────────────────────
    const statsIncidencias = {};
    incidenciasList.forEach(inc => {
      if (!statsIncidencias[inc.empleado]) statsIncidencias[inc.empleado] = {};
      if (!statsIncidencias[inc.empleado][inc.tipo]) statsIncidencias[inc.empleado][inc.tipo] = { episodios: 0, dias: 0 };
      const finReal = inc.fin || hoy;
      const dias = Math.round((new Date(finReal) - new Date(inc.inicio)) / 86400000) + 1;
      statsIncidencias[inc.empleado][inc.tipo].episodios++;
      statsIncidencias[inc.empleado][inc.tipo].dias += dias;
    });

    const dias      = [...diasSet].sort();
    const empleados = [...empleadosSet].sort();

    // Serializar plantillaMap: convertir Set a Array para que JSON.stringify funcione
    const plantillaSerial = {};
    Object.entries(plantillaMap).forEach(([emp, p]) => {
      plantillaSerial[emp] = { diasSemana: [...p.diasSemana], horasDia: p.horasDia };
    });

    res.json({ empleados, dias, data: result, plantilla: plantillaSerial, statsIncidencias });
  } catch (err) {
    console.error(`Error /api/${req.centro.id}/horas:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── WeMob / Tacógrafo (solo Getafe) ──────────────────────────────────────────
const wemob = require('./wemob');

// ── Helper: carga nombres normalizados de la plantilla del centro ─────────────
function normName(n) {
  return (n || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}
async function getPlantillaNames(centro) {
  if (!centro.sheets.plantilla) return null; // sin plantilla → sin filtro
  try {
    const rows = await fetchSheet(centro.sheetId, `'${centro.sheets.plantilla}'!A:A`);
    return rows.slice(1)
      .map(r => normName(r[0] || ''))
      .filter(Boolean);
  } catch { return null; }
}

// Lee la plantilla con columna D = OBSERVACIONES (Baja médica, Vacaciones, etc.).
// Devuelve { entries: [{name, estado}] | null }
function normEstado(obs) {
  const o = (obs || '').toLowerCase().trim();
  if (!o) return 'ACTIVO';
  if (o.includes('baja')) return 'BAJA';
  if (o.includes('vacaci')) return 'VACACIONES';
  if (o.includes('libre')) return 'LIBRE';
  if (o.includes('permiso')) return 'PERMISO';
  return o.toUpperCase();
}
async function getPlantillaConfig(centro) {
  if (!centro.sheets.plantilla) return { entries: null };
  try {
    const rows = await fetchSheet(centro.sheetId, `'${centro.sheets.plantilla}'!A:D`);
    const entries = rows.slice(1)
      .map(r => ({
        name:   normName(r[0] || ''),
        estado: normEstado(r[3] || ''),  // columna D = observaciones
      }))
      .filter(e => e.name);
    return { entries: entries.length > 0 ? entries : null };
  } catch { return { entries: null }; }
}
// Comprueba si el nombre WeMob coincide con algún nombre de la plantilla.
// Algoritmo robusto: para evitar falsos positivos (p.ej. "GARCIA" matcheando cualquier García)
// se requiere que al menos 2 palabras significativas coincidan entre ambos nombres,
// salvo que alguno de los dos nombres tenga solo 1 o 2 palabras.
function matchesPlantilla(wemobName, plantillaNames) {
  if (!plantillaNames || plantillaNames.length === 0) return true;
  if (!wemobName) return false;
  const nw = normName(wemobName);
  // Ignorar si es un alias alfanumérico tipo matrícula "4069LGH"
  if (/^\d+[a-z]+\d*$|^[a-z]\.[a-z]+$/.test(nw.replace(/\s/,''))) return false;
  const wordsW = nw.split(' ').filter(w => w.length > 3);

  return plantillaNames.some(p => {
    const wordsP = p.split(' ').filter(w => w.length > 3);
    if (!wordsP.length || !wordsW.length) return false;
    // Contar palabras que aparecen en ambos nombres
    const matches = wordsW.filter(w => wordsP.some(pw => pw === w || pw.startsWith(w) || w.startsWith(pw)));
    const minWords = Math.min(wordsW.length, wordsP.length);
    // Requiere al menos 2 coincidencias, o todas las palabras si hay pocas (≤2)
    return matches.length >= 2 || (minWords <= 2 && matches.length >= minWords);
  });
}

// ── Helper: lista de matrículas propias extraída de GASOIL + ENRUTAMIENTO ─────
// WeMob aliasMobile suele ser la matrícula o un alias corto — normalizamos
// quitando guiones y espacios para comparar "1234ABC" == "1234-ABC".
function normPlate(s) {
  return (s || '').toUpperCase().replace(/[\s\-\.]/g, '');
}
async function getFleetPlates(centro) {
  try {
    const results = await Promise.allSettled([
      // Matrículas de repostajes (columna truck_id — posición variable, leer cabeceras)
      centro.sheets.gasoil
        ? fetchSheet(centro.sheetId, `${centro.sheets.gasoil}!A:I`)
        : Promise.resolve([]),
      // Matrículas de enrutamiento (columna MATRICULAS)
      centro.sheets.enrutamiento
        ? fetchSheet(centro.sheetId, `'${centro.sheets.enrutamiento}'!A:Z`)
        : Promise.resolve([]),
    ]);

    const plates = new Set();

    // Gasoil: buscar columna truck_id en cabecera
    const gasoilRows = results[0].status === 'fulfilled' ? results[0].value : [];
    if (gasoilRows.length > 1) {
      const hdrs = gasoilRows[0].map(h => (h || '').trim().toLowerCase());
      const col  = hdrs.indexOf('truck_id');
      if (col >= 0) {
        gasoilRows.slice(1).forEach(r => {
          const p = normPlate(r[col]);
          if (p) plates.add(p);
        });
      }
    }

    // Enrutamiento: buscar columna MATRICULAS en cabecera
    const enrRows = results[1].status === 'fulfilled' ? results[1].value : [];
    if (enrRows.length > 1) {
      const hdrs = enrRows[0].map(h => (h || '').trim().toUpperCase());
      const col  = hdrs.indexOf('MATRICULAS');
      if (col >= 0) {
        enrRows.slice(1).forEach(r => {
          const p = normPlate(r[col]);
          if (p) plates.add(p);
        });
      }
    }

    return plates.size > 0 ? [...plates] : null; // null → sin filtro
  } catch { return null; }
}
function matchesFleet(wemobAlias, fleetPlates) {
  if (!fleetPlates || fleetPlates.length === 0) return true;
  if (!wemobAlias) return true; // sin alias → incluir (no podemos saber)
  const p = normPlate(wemobAlias);
  // Coincidencia exacta de matrícula, o la matrícula está contenida en el alias
  return fleetPlates.some(fp => p === fp || p.includes(fp) || fp.includes(p));
}

// ── Resumen diario flota (vehículos + km + paradas + velocidades del día) ─────
app.get('/api/:centro/flota-wemob', requireCentroAccess, async (req, res) => {
  try {
    const [{ idSession, idCompany, idUser }, plantillaNames, fleetPlates] = await Promise.all([
      wemob.getSession(),
      getPlantillaNames(req.centro),
      getFleetPlates(req.centro),
    ]);

    // 1. Lista de vehículos en tiempo real
    const allVehicles = await wemob.selUserMobileGrid(idSession, idCompany, idUser);

    // 2. Doble filtro: vehículo en nuestra flota Y conductor en nuestra plantilla
    //    Si un criterio no tiene lista (sin datos en Sheets) se ignora ese filtro.
    const vehicles = allVehicles.filter(v =>
      matchesFleet(v.aliasMobile, fleetPlates) &&
      (!v.drvAlias || matchesPlantilla(v.drvAlias, plantillaNames))
    );

    // 3. Resumen del día para cada vehículo (paralelo, máx 20)
    const hoyMidnight = new Date(); hoyMidnight.setHours(0, 0, 0, 0);
    const initTs = hoyMidnight.getTime();
    const endTs  = Date.now();

    const resumenList = await Promise.all(
      vehicles.slice(0, 20).map(v =>
        wemob.selMobileResume(idSession, v.idFleet, v.idMobile, initTs, endTs)
          .then(r => ({ idMobile: v.idMobile, ...r }))
          .catch(() => ({ idMobile: v.idMobile, avgSpeed: 0, maxSpeed: 0, numStops: 0, odometer: 0, transitTime: 0, consum: 0 }))
      )
    );

    // 4. Combinar grid + resumen por idMobile
    const resumeMap = Object.fromEntries(resumenList.map(r => [r.idMobile, r]));
    const result = vehicles.map(v => ({ ...v, resumen: resumeMap[v.idMobile] || null }));

    res.json({ vehicles: result, ts: new Date().toISOString() });
  } catch (err) {
    console.error('[flota-wemob]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Helper: deduplicar conductores (mismo driverId o mismo nombre normalizado)
function deduplicarDrivers(drivers) {
  // 1) Por driverId: queda el de mayor lastUpdate
  const porId = new Map();
  for (const d of drivers) {
    const prev = porId.get(d.driverId);
    if (!prev || d.lastUpdate > prev.lastUpdate) porId.set(d.driverId, d);
  }
  // 2) Por nombre normalizado: queda el de mayor drivingTime
  const porNombre = new Map();
  for (const d of porId.values()) {
    const key = normName(d.alias || d.name || String(d.driverId));
    const prev = porNombre.get(key);
    if (!prev || d.drivingTime > prev.drivingTime) porNombre.set(key, d);
  }
  return [...porNombre.values()];
}

// ── Helper: detectar tarjeta olvidada
// Si algún contador diario supera 16h es imposible → tarjeta sin retirar
function detectarTarjetaOlvidada(d) {
  const LIMITE = 16 * 3600;
  if (d.workingTime  > LIMITE) return { tipo: 'trabajo',   valor: d.workingTime  };
  if (d.restingTime  > LIMITE) return { tipo: 'descanso',  valor: d.restingTime  };
  if (d.drivingTime  > LIMITE) return { tipo: 'conduccion',valor: d.drivingTime  };
  return null;
}

app.get('/api/:centro/tacografo', requireCentroAccess, async (req, res) => {
  try {
    const fecha = req.query.fecha; // YYYY-MM-DD — si ausente → hoy (tiempo real)
    const hoy   = new Date().toISOString().slice(0, 10);
    const esHoy = !fecha || fecha === hoy;

    const [sess, plantillaConfig] = await Promise.all([
      wemob.getSession(),
      getPlantillaConfig(req.centro),
    ]);
    const { idSession, idCompany, idUser } = sess;
    const plantillaNames = plantillaConfig.entries ? plantillaConfig.entries.map(e => e.name) : null;

    let rawDrivers;

    if (esHoy) {
      // ── Tiempo real: conductores + grid de vehículos + lista de conductores ──
      const [driverData, vehicleGrid, driverList] = await Promise.allSettled([
        wemob.selDailyDrivingTimesV4(idSession, idUser),
        wemob.selUserMobileGrid(idSession, idCompany, idUser),
        wemob.getDriverList(idSession, idCompany),
      ]);
      rawDrivers = driverData.value || [];
      const vehicles = vehicleGrid.value || [];
      const driverListData = driverList.value || [];

      // Construir mapa matrícula → datos del vehículo
      const speedMap = {};
      for (const v of vehicles) {
        const plate = normPlate(v.aliasMobile || v.aliasFleet || '');
        if (plate) speedMap[plate] = {
          pendingSpeedAlm: v.pendingSpeedAlm,
          pendingSOSAlm:   v.pendingSOSAlm,
          speed:           v.speed,
          idFleet:         v.idFleet,
          idMobile:        v.idMobile,
          kmHoy:           0,
          maxSpeedHoy:     0,
        };
      }

      // Construir mapa driverId → placa usando driverList como puente:
      // driverList.alias === drvAlias del vehicle grid (mismo campo en WeMob)
      const driverIdToPlate = {}; // idDriver → plate
      const aliasToDriverId = {};
      for (const d of driverListData) {
        if (d.alias) aliasToDriverId[d.alias.trim().toUpperCase()] = d.idDriver;
      }
      for (const v of vehicles) {
        const plate = normPlate(v.aliasMobile || v.aliasFleet || '');
        if (plate && v.drvAlias) {
          const idDrv = aliasToDriverId[v.drvAlias.trim().toUpperCase()];
          if (idDrv) driverIdToPlate[idDrv] = plate;
        }
      }

      // Llamar selMobileResume para TODOS los vehículos del grid
      const hoyMidnight = new Date(); hoyMidnight.setHours(0, 0, 0, 0);
      const initTs = hoyMidnight.getTime();
      const endTs  = Date.now();

      const allPlates = Object.keys(speedMap);
      const BATCH = 5;
      for (let i = 0; i < allPlates.length; i += BATCH) {
        const lote = allPlates.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          lote.map(plate => {
            const sv = speedMap[plate];
            return wemob.selMobileResume(idSession, sv.idFleet, sv.idMobile, initTs, endTs)
              .then(r => ({ plate, kmHoy: r.odometer || 0, maxSpeedHoy: r.maxSpeed || 0 }))
              .catch(() => ({ plate, kmHoy: 0, maxSpeedHoy: 0 }));
          })
        );
        results.forEach(r => {
          if (r.status === 'fulfilled') {
            const { plate, kmHoy, maxSpeedHoy } = r.value;
            if (speedMap[plate]) { speedMap[plate].kmHoy = kmHoy; speedMap[plate].maxSpeedHoy = maxSpeedHoy; }
          }
        });
      }

      // Añadir todos los datos del vehículo a cada conductor por matrícula o driverId
      const manualVehicles = req.centro.driverVehicles || {};
      rawDrivers = rawDrivers.map(d => {
        let plate = normPlate(d.vehicle || '');
        // Fallback 1: usar driverId → plate resuelto vía driverList+vehicleGrid
        if (!speedMap[plate] && d.driverId) plate = driverIdToPlate[d.driverId] || plate;
        // Fallback 2: mapa manual en centros.js
        if (!speedMap[plate]) {
          const manualPlate = normPlate(manualVehicles[d.name] || manualVehicles[d.alias] || '');
          if (manualPlate && speedMap[manualPlate]) plate = manualPlate;
        }
        const sv = speedMap[plate] || {};
        const resolvedVehicle = (plate && plate !== '--' && speedMap[plate]) ? plate : (d.vehicle !== '--' ? d.vehicle : null);
        return { ...d, vehicle: resolvedVehicle, pendingSpeedAlm: sv.pendingSpeedAlm || 0, pendingSOSAlm: sv.pendingSOSAlm || 0, kmHoy: sv.kmHoy || 0, maxSpeedHoy: sv.maxSpeedHoy || 0 };
      });

      // Medianoche en hora Madrid (CEST=UTC+2) para consulta de timeline
      // Calculado dinámicamente para soportar cambio de horario invierno/verano
      const madridMidnightTs = (() => {
        const now = new Date();
        const madridTimeStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(now);
        const [hh, mm, ss] = madridTimeStr.split(':').map(Number);
        return now.getTime() - (hh * 3600 + mm * 60 + ss) * 1000;
      })();

      // Obtener hora de inicio y fin de jornada de conductores de plantilla via selTimeline
      const plantillaIds = rawDrivers
        .filter(d => matchesPlantilla(d.name || d.alias, plantillaNames) && d.driverId)
        .map(d => d.driverId);
      const timelineMap = {}; // driverId → { horaInicio, horaFin }
      await Promise.allSettled(
        plantillaIds.map(driverId =>
          wemob.selTimeline(idSession, driverId, madridMidnightTs)
            .then(entries => {
              if (!entries.length) return;
              // Inicio jornada = primer evento de conducción (state=4), igual que WeMob portal
              // Si no hay conducción, primer evento de trabajo (state=1)
              const firstDrive  = entries.find(e => e.state === 4);
              const firstActive = firstDrive || entries.find(e => e.state === 1);
              const last  = entries[entries.length - 1];
              const ahora = Date.now();
              timelineMap[driverId] = {
                horaInicio: firstActive ? firstActive.startMs : null,
                // Sin chip de fin si el último bloque terminó hace menos de 5 min (sigue activo)
                horaFin: (last.endMs && (ahora - last.endMs) > 5 * 60 * 1000) ? last.endMs : null,
              };
            })
            .catch(() => {})
        )
      );
      rawDrivers = rawDrivers.map(d => ({
        ...d,
        horaInicio: timelineMap[d.driverId]?.horaInicio || null,
        horaFin:    timelineMap[d.driverId]?.horaFin    || null,
      }));
    } else {
      // ── Histórico: obtener todos los conductores y consultar por día ─────────
      const allDriverList = await wemob.getDriverList(idSession, idCompany);
      // Filtrar a los de la plantilla
      const plantillaDrivers = allDriverList.filter(d =>
        matchesPlantilla(d.fullName || d.alias, plantillaNames)
      );
      // Rango de timestamps para el día solicitado (medianoche a 23:59:59 UTC)
      const initTs = new Date(`${fecha}T00:00:00Z`).getTime();
      const endTs  = new Date(`${fecha}T23:59:59Z`).getTime();

      // Obtener grid de vehículos (asignaciones actuales) para km/velocidad históricos
      // Usamos drvAlias del grid para relacionar conductor → vehículo
      let histVehicleMap = {}; // drvAlias_normalizado → {idFleet, idMobile, aliasMobile}
      try {
        const vehicleGrid = await wemob.selUserMobileGrid(idSession, idCompany, idUser);
        for (const v of vehicleGrid) {
          if (v.drvAlias) {
            const key = v.drvAlias.trim().toUpperCase();
            histVehicleMap[key] = { idFleet: v.idFleet, idMobile: v.idMobile, plate: normPlate(v.aliasMobile || '') };
          }
        }
      } catch (_) { /* sin vehicle map, km quedará en 0 */ }

      // Llamadas paralelas con límite 5 concurrentes
      const BATCH = 5;
      rawDrivers = [];
      for (let i = 0; i < plantillaDrivers.length; i += BATCH) {
        const lote = plantillaDrivers.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          lote.map(async d => {
            const times = await wemob.getDriverTimes(idSession, d.idDriver, initTs, endTs);
            // Buscar vehículo del conductor en el mapa (por alias o nombre completo)
            const dKey = (d.alias || d.fullName || '').trim().toUpperCase();
            const veh = histVehicleMap[dKey]
              || Object.values(histVehicleMap).find(v => v.plate && matchesPlantilla(d.fullName, [v.plate]));
            let kmHoy = 0, maxSpeedHoy = 0;
            if (veh) {
              try {
                const resume = await wemob.selMobileResume(idSession, veh.idFleet, veh.idMobile, initTs, endTs);
                kmHoy = resume.odometer || 0;
                maxSpeedHoy = resume.maxSpeed || 0;
              } catch (_) {}
            }
            return {
              driverId:   d.idDriver,
              name:       d.fullName,
              alias:      d.alias,
              vehicle:    veh ? veh.plate : null,
              ...times,
              kmHoy,
              maxSpeedHoy,
              actualState: null,
              continousDriving: null,
              weekDrivingRest: null,
              twoWeekDrivingRest: null,
              lastUpdate: initTs,
            };
          })
        );
        results.forEach(r => { if (r.status === 'fulfilled') rawDrivers.push(r.value); });
      }
    }

    // Deduplicar + marcar enPlantilla + estadoPlantilla + tarjeta olvidada
    const dedup = deduplicarDrivers(rawDrivers);
    const drivers = dedup.map(d => {
      const enPlantilla = plantillaNames && plantillaNames.length > 0
        ? matchesPlantilla(d.name || d.alias, plantillaNames)
        : true;
      // Buscar estado del conductor en la plantilla (BAJA, VACACIONES, LIBRE…)
      let estadoPlantilla = null;
      if (enPlantilla && plantillaConfig.entries) {
        const entry = plantillaConfig.entries.find(e =>
          matchesPlantilla(d.name || d.alias, [e.name])
        );
        if (entry && entry.estado !== 'ACTIVO') estadoPlantilla = entry.estado;
      }
      return {
        ...d,
        enPlantilla,
        estadoPlantilla,
        // Si el conductor está inactivo, no marcar tarjeta olvidada (es esperado)
        tarjetaOlvidada: estadoPlantilla ? null : detectarTarjetaOlvidada(d),
      };
    });

    // Conductores ACTIVOS de la plantilla sin señal en WeMob (solo en tiempo real)
    // Los inactivos (BAJA, VACACIONES, LIBRE) se excluyen del aviso "sin señal"
    const activosPlantilla = plantillaConfig.entries
      ? plantillaConfig.entries.filter(e => e.estado === 'ACTIVO' || e.estado === '')
      : null;
    const missing = esHoy && activosPlantilla
      ? activosPlantilla
          .map(e => e.name)
          .filter(pn => !dedup.some(d => matchesPlantilla(d.name || d.alias, [pn])))
      : [];

    res.json({ drivers, missing, esHoy, fecha: fecha || hoy, ts: new Date().toISOString() });
  } catch (err) {
    console.error('[tacografo]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── GET /api/:centro/tacografo-timeline/:driverId ─────────────────────────────
// Timeline del día de un conductor (cargado lazy cuando se expande la tarjeta)
app.get('/api/:centro/tacografo-timeline/:driverId', requireCentroAccess, async (req, res) => {
  try {
    const { idSession } = await wemob.getSession();
    const driverId = parseInt(req.params.driverId);
    if (!driverId || driverId <= 0) return res.status(400).json({ error: 'driverId inválido' });
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const timeline = await wemob.selTimeline(idSession, driverId, hoy.getTime());
    res.json({ timeline, ts: new Date().toISOString() });
  } catch (err) {
    console.error('[tacografo-timeline]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Debug: ver datos raw de WeMob (drivers + vehicles) ────────────────────────
app.get('/api/debug/wemob', async (_, res) => {
  try {
    const { idSession, idCompany, idUser } = await wemob.getSession();
    const [drivers, vehicles, driverList] = await Promise.all([
      wemob.selDailyDrivingTimesV4(idSession, idUser),
      wemob.selUserMobileGrid(idSession, idCompany, idUser),
      wemob.getDriverList(idSession, idCompany),
    ]);
    res.json({
      drivers: drivers.map(d => ({ driverId: d.driverId, name: d.name, alias: d.alias, vehicle: d.vehicle })),
      vehicles: vehicles.map(v => ({ idFleet: v.idFleet, idMobile: v.idMobile, aliasMobile: v.aliasMobile, drvAlias: v.drvAlias })),
      driverList: driverList.map(d => ({ idDriver: d.idDriver, alias: d.alias, fullName: d.fullName })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Areatrans API en http://localhost:${PORT}`));
}

module.exports = app;
