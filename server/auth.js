const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { google } = require('googleapis');
const path   = require('path');

const JWT_SECRET  = process.env.JWT_SECRET || 'areatrans-dev-secret-CHANGE-IN-PROD';
const JWT_EXPIRES = '8h';

// ── Hoja de usuarios ───────────────────────────────────────────────────────────
// Pestaña "USUARIOS" dentro de la hoja principal de GETAFE.
// Columnas: A=username | B=passwordHash | C=role | D=centros (getafe,illescas)
const CENTROS        = require('./centros');
const USERS_SHEET_ID = CENTROS.getafe.sheetId;
const USERS_TAB      = 'USUARIOS DASHBOARD';
const USERS_RANGE    = `'${USERS_TAB}'!A:D`;

// ── Cliente Google Sheets (scope escritura) ────────────────────────────────────
const CREDENTIALS_PATH = path.join(__dirname, '..', 'celtic-client-485117-p4-f4378a3f13f0.json');

async function getSheetsWriteClient() {
  const authConfig = process.env.GOOGLE_CREDENTIALS
    ? { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS) }
    : { keyFile: CREDENTIALS_PATH };
  const auth = new google.auth.GoogleAuth({
    ...authConfig,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'], // lectura + escritura
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

// ── Garantiza que la pestaña USUARIOS existe (crea si no) ─────────────────────
async function ensureTab(sheets) {
  try {
    const meta   = await sheets.spreadsheets.get({ spreadsheetId: USERS_SHEET_ID });
    const existe = meta.data.sheets.some(s => s.properties.title === USERS_TAB);
    if (!existe) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: USERS_SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: USERS_TAB } } }] },
      });
      console.log(`[auth] Pestaña "${USERS_TAB}" creada en la hoja de Sheets`);
    }
  } catch (err) {
    console.warn('[auth] No se pudo verificar/crear la pestaña USUARIOS:', err.message);
  }
}

// ── Cache de usuarios (30 s) para no llamar a Sheets en cada petición ─────────
let _cache = { ts: 0, users: null };

async function loadUsers() {
  if (_cache.users && (Date.now() - _cache.ts < 30_000)) return _cache.users;
  try {
    const sheets = await getSheetsWriteClient();
    await ensureTab(sheets);
    const res  = await sheets.spreadsheets.values.get({ spreadsheetId: USERS_SHEET_ID, range: USERS_RANGE });
    const rows = res.data.values || [];
    // Fila 0 = cabecera; el resto son usuarios
    const users = rows.slice(1)
      .map(r => ({
        username:     (r[0] || '').trim(),
        passwordHash: (r[1] || '').trim(),
        role:         (r[2] || 'viewer').trim(),
        centros:      r[3] ? r[3].split(',').map(c => c.trim()).filter(Boolean) : [],
      }))
      .filter(u => u.username);
    _cache = { ts: Date.now(), users };
    return users;
  } catch (err) {
    console.error('[auth] Error leyendo USUARIOS:', err.message);
    return _cache.users || []; // devuelve caché aunque esté expirado antes de fallar
  }
}

async function saveUsers(users) {
  _cache = { ts: 0, users: null }; // invalida caché inmediatamente
  const rows = [
    ['username', 'passwordHash', 'role', 'centros'],
    ...users.map(u => [u.username, u.passwordHash, u.role, (u.centros || []).join(',')]),
  ];
  const sheets = await getSheetsWriteClient();
  await ensureTab(sheets);
  // Borra y reescribe la pestaña completa
  await sheets.spreadsheets.values.clear({ spreadsheetId: USERS_SHEET_ID, range: USERS_RANGE });
  await sheets.spreadsheets.values.update({
    spreadsheetId: USERS_SHEET_ID,
    range: `'${USERS_TAB}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

// ── Middlewares ────────────────────────────────────────────────────────────────
function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

function requireCentroAccess(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    if (!req.user.centros?.includes(req.params.centro)) {
      return res.status(403).json({ error: `Sin acceso al centro "${req.params.centro}"` });
    }
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ── Rutas de autenticación y administración ───────────────────────────────────
function setupAuthRoutes(app) {

  // POST /api/auth/login
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    try {
      const users = await loadUsers();
      const user  = users.find(u => u.username === username);
      if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }
      const payload = { username: user.username, role: user.role, centros: user.centros };
      const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
      res.json({ token, ...payload });
    } catch (err) {
      console.error('[auth/login]', err.message);
      res.status(500).json({ error: 'Error interno al verificar credenciales' });
    }
  });

  // GET /api/auth/me
  app.get('/api/auth/me', verifyToken, (req, res) => {
    res.json({ username: req.user.username, role: req.user.role, centros: req.user.centros });
  });

  // GET /api/admin/users
  app.get('/api/admin/users', verifyToken, requireAdmin, async (req, res) => {
    try {
      const users = await loadUsers();
      res.json(users.map(({ passwordHash, ...u }) => u));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/admin/users
  app.post('/api/admin/users', verifyToken, requireAdmin, async (req, res) => {
    const { username, password, role = 'viewer', centros = [] } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username y password obligatorios' });
    try {
      const users = await loadUsers();
      if (users.find(u => u.username === username)) return res.status(409).json({ error: 'El usuario ya existe' });
      const newUser = { username, passwordHash: bcrypt.hashSync(password, 10), role, centros };
      await saveUsers([...users, newUser]);
      const { passwordHash, ...safe } = newUser;
      res.status(201).json(safe);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // PUT /api/admin/users/:username
  app.put('/api/admin/users/:username', verifyToken, requireAdmin, async (req, res) => {
    const { password, role, centros } = req.body || {};
    try {
      const users = await loadUsers();
      const idx   = users.findIndex(u => u.username === req.params.username);
      if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (password)              users[idx].passwordHash = bcrypt.hashSync(password, 10);
      if (role)                  users[idx].role         = role;
      if (centros !== undefined) users[idx].centros      = centros;
      await saveUsers(users);
      const { passwordHash, ...safe } = users[idx];
      res.json(safe);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/admin/users/:username
  app.delete('/api/admin/users/:username', verifyToken, requireAdmin, async (req, res) => {
    if (req.params.username === req.user.username) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }
    try {
      const users    = await loadUsers();
      const filtered = users.filter(u => u.username !== req.params.username);
      if (filtered.length === users.length) return res.status(404).json({ error: 'Usuario no encontrado' });
      await saveUsers(filtered);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}

module.exports = { verifyToken, requireAdmin, requireCentroAccess, setupAuthRoutes };
