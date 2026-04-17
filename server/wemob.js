// ── Cliente WeMob SOAP ─────────────────────────────────────────────────────────
// Documentación: https://ws.wemob.es/WMServices/API/index.jsp
// Flujo: initSession → selUserTracking → selDailyDrivingTimesV4
// ─────────────────────────────────────────────────────────────────────────────

const https  = require('https');
const crypto = require('crypto');

const WEMOB_USER  = process.env.WEMOB_USER  || 'areatransit';
const WEMOB_PASS  = process.env.WEMOB_PASS  || 'Hv1FDhyK4$pv';
const WEMOB_IDAPP = parseInt(process.env.WEMOB_IDAPP || '4');

const WM_NS           = 'http://webservices.wemob.wm.es/';
const WM_AUTH_HOST    = 'ws.wemob.es';
const WM_AUTH_PATH    = '/WMServices/AuthenticationService';
const WM_USER_PATH    = '/WMServices/UserWebService';
const WM_DRIVER_PATH  = '/WMServices/DriverWebService';
const WM_MOBILE_PATH  = '/WMServices/MobileWebService';
const WM_HISTORIC_HOST = 'wemob.es';           // HistoricWebService usa hostname diferente
const WM_HISTORIC_PATH = '/WMServices/HistoricWebService';

function md5lower(str) {
  return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

// ── Llamada SOAP genérica ──────────────────────────────────────────────────────
// Acepta hostname explícito para HistoricWebService (host diferente)
function soapPost(path, bodyXml, hostname) {
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="${WM_NS}"><soap:Body>${bodyXml}</soap:Body></soap:Envelope>`;
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: hostname || WM_AUTH_HOST,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(envelope),
        'SOAPAction': '',
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => (data += d));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          const desc = data.match(/<errorDescription>(.*?)<\/errorDescription>/)?.[1]
                    || data.match(/<faultstring>(.*?)<\/faultstring>/)?.[1]
                    || `HTTP ${res.statusCode}`;
          reject(new Error(`WeMob: ${desc}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('WeMob: timeout')); });
    req.write(envelope);
    req.end();
  });
}

// ── Autenticación ──────────────────────────────────────────────────────────────
async function initSession() {
  const xml = await soapPost(
    WM_AUTH_PATH,
    `<tns:initSession><login>${WEMOB_USER}</login><password>${md5lower(WEMOB_PASS)}</password><idApp>${WEMOB_IDAPP}</idApp><ip>127.0.0.1</ip><close>true</close><lang>es</lang></tns:initSession>`,
  );
  const m = xml.match(/<return>(.*?)<\/return>/);
  if (!m) throw new Error('WeMob: no se recibió idSession');
  return m[1];
}

// ── Datos del usuario (idCompany + idUser necesarios para selDailyDrivingTimesV4) ─
async function selUserTracking(idSession) {
  const xml = await soapPost(
    WM_USER_PATH,
    `<tns:selUserTracking><idSession>${idSession}</idSession><lang>es</lang></tns:selUserTracking>`,
  );
  return {
    idCompany: parseInt(xml.match(/<idCompany>(.*?)<\/idCompany>/)?.[1] || '0'),
    idUser:    parseInt(xml.match(/<idUser>(.*?)<\/idUser>/)?.[1]    || '0'),
  };
}

// ── Tiempos de conducción diarios (V4) ─────────────────────────────────────────
// Devuelve array de conductores con sus tiempos actuales.
// Unidades: segundos (int). lastUpdate=0 → devuelve todos.
async function selDailyDrivingTimesV4(idSession, idUser) {
  const xml = await soapPost(
    WM_DRIVER_PATH,
    `<tns:selDailyDrivingTimesV4><idSession>${idSession}</idSession><idUser>${idUser}</idUser><lastUpdate>0</lastUpdate><lang>es</lang></tns:selDailyDrivingTimesV4>`,
  );

  const drivers = [];
  const blockRe = /<drivingTimeList>([\s\S]*?)<\/drivingTimeList>/g;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const b  = m[1];
    const g  = tag => b.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] ?? '';
    const gi = tag => parseInt(g(tag) || '0');
    const gl = tag => parseInt(g(tag) || '0');
    drivers.push({
      driverId:             gi('driverId'),
      name:                 g('name'),
      alias:                g('alias'),
      vehicle:              g('vehicle'),
      actualState:          gi('actualState'),    // 0=conduciendo 1=trabajo 2=disponible 3=descanso
      drivingTime:          gi('drivingTime'),     // conducción acumulada hoy (s)
      workingTime:          gi('workingTime'),     // otros trabajos hoy (s)
      availableTime:        gi('availableTime'),   // tiempo disponible restante hoy (s)
      continousDriving:     gi('continousDriving'),// conducción continua sin pausa (s)
      restingTime:          gi('restingTime'),     // descanso acumulado (s)
      infraction:           gi('infraction'),      // 0=ok >0=infracción
      overdriving:          gi('overdriving'),     // exceso de conducción (s)
      weekDrivingRest:      gi('weekDrivingRest'), // descanso semanal restante (s)
      twoWeekDrivingRest:   gi('twoWeekDrivingRest'),
      lastUpdate:           gl('lastUpdate'),      // unix ms
    });
  }
  return drivers;
}

// ── Grid de vehículos en tiempo real ─────────────────────────────────────────
// Devuelve todos los vehículos del usuario con posición, km, velocidad, conductor, alertas.
// lastUpdate=0 → siempre todos. idLanguage=1 (es).
async function selUserMobileGrid(idSession, idCompany, idUser) {
  const xml = await soapPost(
    WM_MOBILE_PATH,
    `<tns:selUserMobileGrid><idSession>${idSession}</idSession><idCompany>${idCompany}</idCompany><idUser>${idUser}</idUser><lastUpdate>0</lastUpdate><idLanguage>1</idLanguage><lang>es</lang></tns:selUserMobileGrid>`,
  );

  const vehicles = [];
  const blockRe = /<mobileList>([\s\S]*?)<\/mobileList>/g;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const b  = m[1];
    const g  = tag => b.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] ?? '';
    const gi = tag => parseInt(g(tag) || '0');
    const gf = tag => parseFloat(g(tag) || '0');
    vehicles.push({
      idFleet:           gi('idFleet'),
      idMobile:          gi('idMobile'),
      aliasMobile:       g('aliasMobile'),
      aliasFleet:        g('aliasFleet'),
      drvAlias:          g('drvAlias'),           // conductor asignado
      km:                gi('km'),                // km recorridos hoy
      speed:             gi('speed'),             // velocidad actual (km/h)
      stateDesc:         g('stateDesc'),          // descripción del estado
      causeDesc:         g('causeDesc'),          // descripción de la causa
      latitude:          gi('latitude') / 3600,   // arcsegundos → grados decimales
      longitude:         gi('longitude') / 3600,
      fuel_percent:      gi('fuel_percent'),      // % combustible
      fuel_tank:         gi('fuel_tank'),         // litros del depósito
      temp1:             gi('temp1') / 10,        // décimas de °C → °C
      temp2:             gi('temp2') / 10,
      maintenanceWarning: gi('maintenanceWarning'),
      pendingSpeedAlm:   gi('pendingSpeedAlm'),   // alertas velocidad pendientes
      pendingSOSAlm:     gi('pendingSOSAlm'),
      lastUpdate:        parseInt(g('lastUpdate') || '0'),  // unix ms
      timestamp:         parseInt(g('timestamp') || '0'),
    });
  }
  return vehicles;
}

// ── Resumen del día por vehículo ───────────────────────────────────────────────
// initTs / endTs: unix ms (inicio del día y ahora)
// Devuelve: avgSpeed, maxSpeed, numStops, odometer, transitTime (s), consum (litros).
async function selMobileResume(idSession, idFleet, idMobile, initTs, endTs) {
  const xml = await soapPost(
    WM_HISTORIC_PATH,
    `<tns:selMobileResume><idSession>${idSession}</idSession><idFleet>${idFleet}</idFleet><idMobile>${idMobile}</idMobile><initTimestamp>${initTs}</initTimestamp><endTimestamp>${endTs}</endTimestamp><lang>es</lang></tns:selMobileResume>`,
    WM_HISTORIC_HOST,
  );
  const g  = tag => xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] ?? '';
  return {
    avgSpeed:    parseFloat(g('avgSpeed') || '0'),
    maxSpeed:    parseInt(g('maxSpeed') || '0'),
    numStops:    parseInt(g('numStops') || '0'),
    odometer:    parseInt(g('odometer') || '0'),   // km totales odómetro
    transitTime: parseInt(g('transitTime') || '0'), // tiempo en ruta (s)
    consum:      parseFloat(g('consum') || '0'),    // litros consumidos
  };
}

// ── Lista de conductores de la empresa (id, nombre, alias) ────────────────────
// Necesaria para histórico: getDriverTimes requiere idDriver numérico.
async function selDriverByCompany(idSession, idCompany) {
  const xml = await soapPost(
    WM_DRIVER_PATH,
    `<tns:selDriverByCompany><idSession>${idSession}</idSession><idCompany>${idCompany}</idCompany><lang>es</lang></tns:selDriverByCompany>`,
  );
  const drivers = [];
  // El tag repetido puede ser <return> o <driverList> según la versión SOAP
  const blockRe = /<(?:return|driverList)>([\s\S]*?)<\/(?:return|driverList)>/g;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const b  = m[1];
    const g  = tag => b.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] ?? '';
    const gi = tag => parseInt(g(tag) || '0');
    const id = gi('idDriver');
    if (id > 0) {
      drivers.push({
        idDriver: id,
        userName: g('userName'),
        lastName: g('lastName'),
        alias:    g('alias'),
        fullName: [g('userName'), g('lastName')].filter(Boolean).join(' '),
      });
    }
  }
  return drivers;
}

// ── Tiempos de conducción de un conductor en un rango de fechas ───────────────
// initDate / endDate: unix ms del inicio y fin del día consultado.
// Devuelve acumulados del período: drivingTime, workingTime, restingTime, etc.
async function getDriverTimes(idSession, idDriver, initDate, endDate) {
  const xml = await soapPost(
    WM_DRIVER_PATH,
    `<tns:getDriverTimes><idSession>${idSession}</idSession><idDriver>${idDriver}</idDriver><initDate>${initDate}</initDate><endDate>${endDate}</endDate><lang>es</lang></tns:getDriverTimes>`,
  );
  // La respuesta puede venir en bloques <return> o en tags directos
  const g  = tag => xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] ?? '';
  const gi = tag => parseInt(g(tag) || '0');
  return {
    drivingTime:   gi('drivingTime'),
    workingTime:   gi('workingTime'),
    restingTime:   gi('restingTime'),
    availableTime: gi('availableTime'),
    overdriving:   gi('overdriving'),
    infraction:    gi('infraction'),
  };
}

// ── Timeline del conductor (actividad del día por bloques) ───────────────────
// from: unix ms de inicio del período (medianoche).
// state: 1=otros trabajos, 3=descanso, 4=conduciendo (2=disponible rara vez)
async function selTimeline(idSession, idDriver, from) {
  const xml = await soapPost(
    WM_DRIVER_PATH,
    `<tns:selTimeline><idSession>${idSession}</idSession><idDriver>${idDriver}</idDriver><from>${from}</from><lang>es</lang></tns:selTimeline>`,
  );
  const entries = [];
  const blockRe = /<TimelineList>([\s\S]*?)<\/TimelineList>/g;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const b = m[1];
    const g  = tag => b.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] ?? '';
    const startMs = parseInt(g('start') || '0');
    const endMs   = parseInt(g('end')   || '0');
    entries.push({
      state:       parseInt(g('state') || '0'), // 1=trabajo 3=descanso 4=conduciendo
      startMs,
      endMs,
      endDate:     g('endDate'),
      durationMin: (startMs && endMs) ? Math.round((endMs - startMs) / 60000) : 0,
    });
  }
  return entries;
}

// ── Estados del conductor (timeline histórica) ───────────────────────────────
// from: unix ms de inicio. Devuelve lista de eventos de estado.
async function selDriverStates(idSession, idDriver, from) {
  const xml = await soapPost(
    WM_DRIVER_PATH,
    `<tns:selDriverStates><idSession>${idSession}</idSession><idDriver>${idDriver}</idDriver><from>${from}</from><lang>es</lang></tns:selDriverStates>`,
  );
  const states = [];
  const blockRe = /<(?:return|tachographFilteredRecord)>([\s\S]*?)<\/(?:return|tachographFilteredRecord)>/g;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const b  = m[1];
    const g  = tag => b.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] ?? '';
    const gi = tag => parseInt(g(tag) || '0');
    states.push({
      timestamp: parseInt(g('timestamp') || g('initTimestamp') || '0'),
      state:     gi('state') || gi('idState'),
      duration:  gi('duration'),
    });
  }
  return states;
}

// ── Caché de sesión (se renueva cada 7h) ───────────────────────────────────────
let _sess = { idSession: null, ts: 0, idCompany: 0, idUser: 0 };
const SESS_TTL = 7 * 3600 * 1_000;

async function getSession() {
  if (_sess.idSession && Date.now() - _sess.ts < SESS_TTL) return _sess;
  const idSession        = await initSession();
  const { idCompany, idUser } = await selUserTracking(idSession);
  _sess = { idSession, ts: Date.now(), idCompany, idUser };
  return _sess;
}

// ── Caché de lista de conductores (TTL 1h, cambia poco) ──────────────────────
let _driverCache = { list: null, ts: 0 };
const DRIVER_TTL = 1 * 3600 * 1_000;

async function getDriverList(idSession, idCompany) {
  if (_driverCache.list && Date.now() - _driverCache.ts < DRIVER_TTL) return _driverCache.list;
  const list = await selDriverByCompany(idSession, idCompany);
  _driverCache = { list, ts: Date.now() };
  return list;
}

module.exports = {
  getSession,
  getDriverList,
  getDriverTimes,
  selDriverStates,
  selTimeline,
  selDailyDrivingTimesV4,
  selUserMobileGrid,
  selMobileResume,
};
