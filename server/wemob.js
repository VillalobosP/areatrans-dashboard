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
      latitude:          gf('latitude'),
      longitude:         gf('longitude'),
      fuel_percent:      gi('fuel_percent'),      // % combustible
      fuel_tank:         gi('fuel_tank'),         // litros del depósito
      temp1:             gf('temp1'),             // temperatura sonda 1 (°C)
      temp2:             gf('temp2'),
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

module.exports = { getSession, selDailyDrivingTimesV4, selUserMobileGrid, selMobileResume };
