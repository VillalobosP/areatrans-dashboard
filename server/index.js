require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ── Google Sheets ─────────────────────────────────────────────────────────────
const SHEET_ID = '1PloSwT20dFVmF2w-tseaDscnKZ_35a6H9PPgpP6xBOc';
const CREDENTIALS_PATH = path.join(__dirname, '..', 'celtic-client-485117-p4-f4378a3f13f0.json');

async function getSheetsClient() {
  // En Vercel: credenciales como variable de entorno GOOGLE_CREDENTIALS (JSON string)
  // En local:  fichero JSON en CREDENTIALS_PATH
  const authConfig = process.env.GOOGLE_CREDENTIALS
    ? { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS) }
    : { keyFile: CREDENTIALS_PATH };

  const auth = new google.auth.GoogleAuth({
    ...authConfig,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

async function getSheetData(sheets, range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return res.data.values || [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseDate(value) {
  if (!value) return null;
  if (String(value).includes('/')) {
    const [d, m, y] = String(value).split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return String(value).trim();
}

function parseNum(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = parseFloat(String(value).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function round2(n) { return Math.round(n * 100) / 100; }
function round1(n) { return Math.round(n * 10) / 10; }

function buildCalendarRow(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h.trim()] = row[i] ?? ''; });
  return {
    FECHA: parseDate(obj['FECHA']),
    MES_CLAVE: obj['MES_CLAVE']?.trim(),
    DIA_SEMANA_NUM: parseNum(obj['DIA_SEMANA_NUM']),
    ES_DOMINGO: String(obj['ES_DOMINGO']).trim(),
    ES_FESTIVO_FLAG: String(obj['ES_FESTIVO_FLAG']).trim(),
    OPERATIVO_INCL_FESTIVO: parseNum(obj['OPERATIVO_INCL_FESTIVO']),
    OPERATIVO_EXCL_FESTIVO: parseNum(obj['OPERATIVO_EXCL_FESTIVO']),
    CUOTA_MIN_225_INCL: parseNum(obj['CUOTA_MIN_225_INCL']),
    CUOTA_OBJ_250_INCL: parseNum(obj['CUOTA_OBJ_250_INCL']),
    VIAJES_REALES_DIA: parseNum(obj['VIAJES_REALES_DIA']),
  };
}

// Cache simple en memoria (TTL 60s) para no spamear la API de Google
let cache = { ts: 0, rows: null };
async function getCalendarioRows() {
  const now = Date.now();
  if (cache.rows && now - cache.ts < 60_000) return cache.rows;
  const sheets = await getSheetsClient();
  const raw = await getSheetData(sheets, 'CALENDARIO!A:N');
  if (raw.length === 0) return [];
  const headers = raw[0];
  cache.rows = raw.slice(1).map(r => buildCalendarRow(headers, r)).filter(r => r.FECHA);
  cache.ts = now;
  return cache.rows;
}

// Devuelve "YYYY-MM" del primer día del mes que contiene una fecha ISO
function mesClave(fechaISO) {
  return fechaISO.slice(0, 7);
}

// ── GET /api/calendario?desde=2026-04-01&hasta=2026-04-30 ────────────────────
// Devuelve solo los días operativos del rango (para el gráfico)
app.get('/api/calendario', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const rows = await getCalendarioRows();

    const data = rows.filter(r => {
      if (!r.FECHA) return false;
      if (desde && r.FECHA < desde) return false;
      if (hasta && r.FECHA > hasta) return false;
      return r.OPERATIVO_INCL_FESTIVO === 1;
    });

    res.json(data);
  } catch (err) {
    console.error('Error /api/calendario:', err.message);
    res.status(500).json({ error: 'Error al obtener calendario', detail: err.message });
  }
});

// ── GET /api/resumen?desde=2026-04-01&hasta=2026-04-05 ───────────────────────
app.get('/api/resumen', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ error: 'Parámetros "desde" y "hasta" requeridos (YYYY-MM-DD)' });
    }

    const todos = await getCalendarioRows();

    // Mes al que pertenece "desde" (para proyección)
    const mesDelRango = mesClave(desde);

    // Días del mes completo (usamos el mes de "desde")
    const diasMesCompleto = todos.filter(r => r.MES_CLAVE === mesDelRango);

    // ── BLOQUE A: rango seleccionado ──────────────────────────────────────────
    const enRango = todos.filter(r => r.FECHA >= desde && r.FECHA <= hasta);
    const enRangoOperativos = enRango.filter(r => r.OPERATIVO_INCL_FESTIVO === 1);

    const viajes_reales = enRango.reduce((s, r) => s + r.VIAJES_REALES_DIA, 0);
    const objetivo_fecha_min = round2(enRangoOperativos.reduce((s, r) => s + r.CUOTA_MIN_225_INCL, 0));
    const objetivo_fecha_obj = round2(enRangoOperativos.reduce((s, r) => s + r.CUOTA_OBJ_250_INCL, 0));
    const desv_fecha_min = round2(viajes_reales - objetivo_fecha_min);
    const desv_fecha_obj = round2(viajes_reales - objetivo_fecha_obj);

    // ── BLOQUE B: proyección cierre de mes ────────────────────────────────────
    const diasOperativosMes = diasMesCompleto.filter(r => r.OPERATIVO_INCL_FESTIVO === 1);
    const objetivo_mensual_225 = round2(diasOperativosMes.reduce((s, r) => s + r.CUOTA_MIN_225_INCL, 0));
    const objetivo_mensual_250 = round2(diasOperativosMes.reduce((s, r) => s + r.CUOTA_OBJ_250_INCL, 0));

    // Días operativos restantes = operativos del mes que son > hasta
    const diasOperativosRestantes = diasOperativosMes.filter(r => r.FECHA > hasta).length;

    // Media diaria: viajes reales / días del rango con viajes > 0
    const diasConViajes = enRango.filter(r => r.VIAJES_REALES_DIA > 0).length;
    const media_diaria_real = diasConViajes > 0 ? round1(viajes_reales / diasConViajes) : 0;

    // Ritmo necesario para alcanzar objetivo en días restantes
    const ritmo_necesario_225 = diasOperativosRestantes > 0
      ? round1((objetivo_mensual_225 - viajes_reales) / diasOperativosRestantes)
      : null;
    const ritmo_necesario_250 = diasOperativosRestantes > 0
      ? round1((objetivo_mensual_250 - viajes_reales) / diasOperativosRestantes)
      : null;

    // Proyección: viajes actuales + (media diaria * días operativos restantes)
    const proyeccion_cierre = round1(viajes_reales + media_diaria_real * diasOperativosRestantes);

    // Faltan: siempre enteros con Math.ceil, mínimo 0 si ya se superó
    const faltan_225 = Math.max(0, Math.ceil(objetivo_mensual_225 - viajes_reales));
    const faltan_250 = Math.max(0, Math.ceil(objetivo_mensual_250 - viajes_reales));

    res.json({
      desde,
      hasta,
      mes: mesDelRango,
      // Bloque A
      viajes_reales,
      objetivo_fecha_min,
      objetivo_fecha_obj,
      desv_fecha_min,
      desv_fecha_obj,
      // Bloque B
      objetivo_mensual_225,
      objetivo_mensual_250,
      dias_operativos_restantes: diasOperativosRestantes,
      media_diaria_real,
      ritmo_necesario_225,
      ritmo_necesario_250,
      proyeccion_cierre,
      faltan_225,
      faltan_250,
    });
  } catch (err) {
    console.error('Error /api/resumen:', err.message);
    res.status(500).json({ error: 'Error al calcular resumen', detail: err.message });
  }
});

// ── Cache de facturación (TTL 60s) ───────────────────────────────────────────
let cacheEnrut = { ts: 0, rows: null };

function buildEnrutRow(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h.trim()] = row[i] ?? ''; });

  const fechaRaw = obj['FECHA_REAL'] || obj['FECHA'] || '';
  let fecha = null;
  if (fechaRaw.includes('/')) {
    const parts = fechaRaw.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      fecha = `${y.padStart(4,'20')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
  } else if (fechaRaw.includes('-')) {
    fecha = fechaRaw.trim();
  }

  const costeRaw = String(obj['COSTE RUTA'] || '').replace(/[€\s]/g, '').replace(',', '.');
  const coste_num = parseFloat(costeRaw) || 0;

  const planificado = parseNum(obj['CONTADOR_PLANIFICADO']);
  const extra = parseNum(obj['CONTADOR_EXTRAS']);
  const primeraFila = parseNum(obj['PRIMERA_FILA_FECHA']);

  return {
    FECHA: fecha,
    MES_CLAVE: obj['MES_CLAVE']?.trim() || (fecha ? fecha.slice(0, 7) : ''),
    NUM_SEMANA: parseNum(obj['NUM_SEMANA']),
    PERIODO_MES: obj['PERIODO_MES']?.trim(),
    TIPO_EXTRA: obj['TIPO_EXTRA']?.trim(),
    FACTURADOR: obj['FACTURADOR']?.trim(),
    CHOFER: obj['CHOFER']?.trim(),
    MATRICULAS: obj['MATRICULAS']?.trim(),
    KM_ENRUTAMIENTO: parseNum(obj['KM_ENRUTAMIENTO']),
    KM_TACOGRAFO: parseNum(obj['KM_TACOGRAFO']),
    DIF_KM: parseNum(obj['DIF_KM']),
    COSTE_RUTA_NUM: coste_num,
    CONTADOR_PLANIFICADO: planificado,
    CONTADOR_EXTRAS: extra,
    PRIMERA_FILA_FECHA: primeraFila,
    // Cada fila = un viaje. COSTE RUTA ya es único por viaje.
    FACTURACION_PLANIFICADA: planificado > 0 ? coste_num : 0,
    FACTURACION_EXTRA: extra > 0 ? coste_num : 0,
  };
}

async function getEnrutRows() {
  const now = Date.now();
  if (cacheEnrut.rows && now - cacheEnrut.ts < 60_000) return cacheEnrut.rows;
  const sheets = await getSheetsClient();
  const raw = await getSheetData(sheets, "'PRUEBA ENRUTAMIENTO AUTOMATICO GETAFE'!A:AJ");
  if (raw.length === 0) return [];
  const headers = raw[0];
  cacheEnrut.rows = raw.slice(1)
    .map(r => buildEnrutRow(headers, r))
    .filter(r => r.FECHA);
  cacheEnrut.ts = now;
  return cacheEnrut.rows;
}

// ── GET /api/facturacion?desde=&hasta= ───────────────────────────────────────
// Devuelve datos diarios de facturación para el gráfico
app.get('/api/facturacion', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const rows = await getEnrutRows();

    const filtradas = rows.filter(r => {
      if (!r.FECHA) return false;
      if (desde && r.FECHA < desde) return false;
      if (hasta && r.FECHA > hasta) return false;
      return true;
    });

    // Agrupar por fecha + facturador
    const byFecha = {};
    filtradas.forEach(r => {
      const k = r.FECHA;
      if (!byFecha[k]) byFecha[k] = {
        fecha: k, planificada: 0, extra: 0, total: 0, viajes: 0,
      };
      byFecha[k].planificada += r.FACTURACION_PLANIFICADA;
      byFecha[k].extra += r.FACTURACION_EXTRA;
      byFecha[k].total += r.FACTURACION_PLANIFICADA + r.FACTURACION_EXTRA;
      byFecha[k].viajes += 1;
    });

    // Agrupar por facturador
    const byFact = {};
    filtradas.forEach(r => {
      if (!r.FACTURADOR) return;
      if (!byFact[r.FACTURADOR]) byFact[r.FACTURADOR] = { facturador: r.FACTURADOR, total: 0 };
      byFact[r.FACTURADOR].total += r.FACTURACION_PLANIFICADA + r.FACTURACION_EXTRA;
    });

    // Agrupar por matrícula
    const byMat = {};
    filtradas.forEach(r => {
      if (!r.MATRICULAS) return;
      if (!byMat[r.MATRICULAS]) byMat[r.MATRICULAS] = { matricula: r.MATRICULAS, total: 0 };
      byMat[r.MATRICULAS].total += r.FACTURACION_PLANIFICADA + r.FACTURACION_EXTRA;
    });

    res.json({
      porDia: Object.values(byFecha).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      porFacturador: Object.values(byFact).sort((a, b) => b.total - a.total),
      porMatricula: Object.values(byMat).sort((a, b) => b.total - a.total).slice(0, 10),
    });
  } catch (err) {
    console.error('Error /api/facturacion:', err.message);
    res.status(500).json({ error: 'Error al obtener facturación', detail: err.message });
  }
});

// ── GET /api/facturacion/resumen?desde=&hasta= ───────────────────────────────
app.get('/api/facturacion/resumen', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ error: 'Parámetros "desde" y "hasta" requeridos' });
    }

    const rows = await getEnrutRows();
    const filtradas = rows.filter(r =>
      r.FECHA && r.FECHA >= desde && r.FECHA <= hasta
    );

    // Cada fila = un viaje. Separamos planificados y extras.
    const planificadas = filtradas.filter(r => r.CONTADOR_PLANIFICADO > 0);
    const extras = filtradas.filter(r => r.CONTADOR_EXTRAS > 0);

    const fact_planificada = planificadas.reduce((s, r) => s + r.COSTE_RUTA_NUM, 0);
    const fact_extra = extras.reduce((s, r) => s + r.COSTE_RUTA_NUM, 0);
    const fact_total = fact_planificada + fact_extra;
    const num_viajes_planificados = planificadas.length;

    // Precio mín/medio solo sobre filas con coste real (excluye vacíos)
    const costes_plan = planificadas.map(r => r.COSTE_RUTA_NUM).filter(c => c > 0);
    const precio_minimo = costes_plan.length > 0 ? Math.min(...costes_plan) : 0;
    const precio_medio = costes_plan.length > 0
      ? costes_plan.reduce((s, c) => s + c, 0) / costes_plan.length
      : 0;

    // Días únicos con datos
    const diasUnicos = [...new Set(filtradas.map(r => r.FECHA))].length;
    const fact_media_diaria = diasUnicos > 0 ? fact_total / diasUnicos : 0;
    const porcentaje_extra = fact_total > 0 ? (fact_extra / fact_total) * 100 : 0;

    // Escenario conservador (precio mínimo)
    const obj_min_225 = 225 * precio_minimo;
    const obj_min_250 = 250 * precio_minimo;
    const desv_min_225 = fact_planificada - obj_min_225;
    const desv_min_250 = fact_planificada - obj_min_250;

    // Escenario realista (precio medio)
    const obj_media_225 = 225 * precio_medio;
    const obj_media_250 = 250 * precio_medio;
    const desv_media_225 = fact_planificada - obj_media_225;
    const desv_media_250 = fact_planificada - obj_media_250;

    // Proyección cierre de mes y ritmos diarios (usando calendario)
    const calRows = await getCalendarioRows();
    const mesDelRango = desde.slice(0, 7);
    const diasMesOp = calRows.filter(r => r.MES_CLAVE === mesDelRango && r.OPERATIVO_INCL_FESTIVO === 1);
    const dias_operativos_mes = diasMesOp.length;
    const dias_operativos_restantes = diasMesOp.filter(r => r.FECHA > hasta).length;
    const proyeccion_cierre_euros = fact_total + fact_media_diaria * dias_operativos_restantes;
    // Ritmo diario necesario para alcanzar cada escenario
    const ritmo_diario_225 = dias_operativos_mes > 0 ? obj_min_225 / dias_operativos_mes : 0;
    const ritmo_diario_250 = dias_operativos_mes > 0 ? obj_min_250 / dias_operativos_mes : 0;

    const r2 = n => Math.round(n * 100) / 100;
    const r1 = n => Math.round(n * 10) / 10;

    res.json({
      desde, hasta,
      // KPIs base
      fact_planificada: r2(fact_planificada),
      fact_extra: r2(fact_extra),
      fact_total: r2(fact_total),
      precio_minimo: r2(precio_minimo),
      precio_medio: r2(precio_medio),
      num_viajes_planificados,
      fact_media_diaria: r2(fact_media_diaria),
      porcentaje_extra: r1(porcentaje_extra),
      // Proyección cierre
      dias_operativos_mes,
      dias_operativos_restantes,
      proyeccion_cierre_euros: r2(proyeccion_cierre_euros),
      // Ritmos diarios para el gráfico
      ritmo_diario_225: r2(ritmo_diario_225),
      ritmo_diario_250: r2(ritmo_diario_250),
      // Escenario conservador
      obj_min_225: r2(obj_min_225),
      obj_min_250: r2(obj_min_250),
      desv_min_225: r2(desv_min_225),
      desv_min_250: r2(desv_min_250),
      // Escenario realista
      obj_media_225: r2(obj_media_225),
      obj_media_250: r2(obj_media_250),
      desv_media_225: r2(desv_media_225),
      desv_media_250: r2(desv_media_250),
    });
  } catch (err) {
    console.error('Error /api/facturacion/resumen:', err.message);
    res.status(500).json({ error: 'Error al calcular resumen de facturación', detail: err.message });
  }
});

// ── Cache de gasoil (TTL 60s) ─────────────────────────────────────────────────
let cacheGasoil = { ts: 0, rows: null };

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
  const eurosPorLitro = (importe > 0 && litrosTotal > 0) ? importe / litrosTotal : null;

  return {
    CONDUCTOR:      (obj['CONDUCTOR'] || '').trim(),
    FECHA:          fecha,
    KILOMETRAJE:    parseNum(obj['KILOMETRAJE']),
    LITROS_GASOIL:  litrosGasoil,
    LITROS_FRIO:    litrosFrio,
    LITROS_ADBLUE:  parseNum(obj['LITROS ADBLUE']),
    LITROS_TOTAL:   litrosTotal,
    IMPORTE:        importe,
    TRUCK_ID:       (obj['truck_id'] || '').trim(),
    EUROS_POR_LITRO: eurosPorLitro,
  };
}

async function getGasoilRows() {
  const now = Date.now();
  if (cacheGasoil.rows && now - cacheGasoil.ts < 60_000) return cacheGasoil.rows;
  const sheets = await getSheetsClient();
  const raw = await getSheetData(sheets, 'GASOIL!A:I');
  if (raw.length === 0) return [];
  const headers = raw[0];
  cacheGasoil.rows = raw.slice(1)
    .map(r => buildGasoilRow(headers, r))
    .filter(r => r.FECHA);
  cacheGasoil.ts = now;
  return cacheGasoil.rows;
}

// ── GET /api/gasoil?desde=&hasta= ─────────────────────────────────────────────
app.get('/api/gasoil', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const rows = await getGasoilRows();
    const data = rows.filter(r => (!desde || r.FECHA >= desde) && (!hasta || r.FECHA <= hasta));
    res.json(data);
  } catch (err) {
    console.error('Error /api/gasoil:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/gasoil/resumen?desde=&hasta= ─────────────────────────────────────
app.get('/api/gasoil/resumen', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'Parámetros desde y hasta requeridos' });

    const rows = await getGasoilRows();
    const fil = rows.filter(r => r.FECHA >= desde && r.FECHA <= hasta);

    // ── KPIs globales ──
    const total_litros  = fil.reduce((s, r) => s + r.LITROS_TOTAL, 0);
    const total_importe = fil.reduce((s, r) => s + r.IMPORTE, 0);
    const num_repostajes = fil.length;
    const km_vals = fil.filter(r => r.KILOMETRAJE > 0).map(r => r.KILOMETRAJE);
    const km_medio_repostaje = km_vals.length > 0 ? km_vals.reduce((a, b) => a + b, 0) / km_vals.length : 0;
    const euros_por_litro_medio = total_litros > 0 ? total_importe / total_litros : 0;

    // ── Por conductor ──
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
    const r1 = n => Math.round(n * 10) / 10;

    const porConductor = Object.values(byCond).map(c => ({
      conductor:            c.conductor,
      num_repostajes:       c.n,
      total_litros:         r2(c.litros),
      total_importe:        r2(c.importe),
      km_medio_repostaje:   c.km_n > 0 ? r2(c.km_sum / c.km_n) : 0,
      euros_por_litro_medio: c.litros > 0 && c.importe > 0 ? r2(c.importe / c.litros) : null,
      fecha_ultimo_repostaje: c.fechas.length > 0 ? [...c.fechas].sort().at(-1) : null,
      num_sin_ticket:       c.sin_ticket,
    })).sort((a, b) => b.total_importe - a.total_importe);

    // ── Por truck_id ──
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
      truck_id:             t.truck_id,
      num_repostajes:       t.n,
      total_litros:         r2(t.litros),
      total_importe:        r2(t.importe),
      euros_por_litro_medio: t.litros > 0 && t.importe > 0 ? r2(t.importe / t.litros) : null,
      fecha_ultimo_repostaje: t.fechas.length > 0 ? [...t.fechas].sort().at(-1) : null,
    })).sort((a, b) => b.total_importe - a.total_importe);

    res.json({
      global: {
        total_litros:          r2(total_litros),
        total_importe:         r2(total_importe),
        num_repostajes,
        km_medio_repostaje:    r2(km_medio_repostaje),
        euros_por_litro_medio: r1(euros_por_litro_medio),
      },
      porConductor,
      porTruck,
    });
  } catch (err) {
    console.error('Error /api/gasoil/resumen:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/km-desviacion?desde=&hasta= ──────────────────────────────────────
app.get('/api/km-desviacion', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'Parámetros desde y hasta requeridos' });

    const rows = await getEnrutRows();
    const fil = rows.filter(r =>
      r.FECHA >= desde && r.FECHA <= hasta &&
      r.KM_TACOGRAFO > 0 && r.KM_ENRUTAMIENTO > 0
    );

    const r1 = n => Math.round(n * 10) / 10;
    const r2 = n => Math.round(n * 100) / 100;

    // ── Por (CHOFER, MATRICULAS) ──
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
        chofer:                  p.chofer || '—',
        matricula:               p.matricula || '—',
        num_rutas:               p.n,
        km_google_total:         r1(p.google),
        km_tacografo_total:      r1(p.taco),
        desviacion_total:        r1(p.dif),
        desviacion_pct:          r1(desv_pct),
        desviacion_media_por_ruta: r1(p.dif / p.n),
      };
    }).sort((a, b) => Math.abs(b.desviacion_pct) - Math.abs(a.desviacion_pct));

    // ── Globales ──
    const desviacion_km_total = r1(fil.reduce((s, r) => s + r.DIF_KM, 0));
    const desviacion_km_media = fil.length > 0 ? r1(fil.reduce((s, r) => s + r.DIF_KM, 0) / fil.length) : 0;

    res.json({
      global: {
        desviacion_km_total,
        desviacion_km_media,
        num_rutas: fil.length,
        km_google_total:    r1(fil.reduce((s, r) => s + r.KM_ENRUTAMIENTO, 0)),
        km_tacografo_total: r1(fil.reduce((s, r) => s + r.KM_TACOGRAFO, 0)),
      },
      porChoferMatricula,
    });
  } catch (err) {
    console.error('Error /api/km-desviacion:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Local: arranca el servidor. En Vercel este bloque no se ejecuta.
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Areatrans API en http://localhost:${PORT}`));
}

module.exports = app;
