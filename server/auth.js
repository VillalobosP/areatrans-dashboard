const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const fs       = require('fs');
const path     = require('path');

const USERS_FILE  = path.join(__dirname, 'users.json');
const JWT_SECRET  = process.env.JWT_SECRET || 'areatrans-dev-secret-CHANGE-IN-PROD';
const JWT_EXPIRES = '8h';

// ── Persistencia de usuarios ──────────────────────────────────────────────────
// Local: lee/escribe users.json
// Vercel / producción: lee USERS_JSON env var (JSON string); escritura requiere
//   actualizar la variable de entorno manualmente en el panel de Vercel.

function loadUsers() {
  if (process.env.USERS_JSON) {
    try { return JSON.parse(process.env.USERS_JSON); } catch { return []; }
  }
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return []; }
}

function saveUsers(users) {
  if (process.env.NODE_ENV === 'production') {
    // En Vercel el filesystem es de solo lectura; el admin debe copiar este JSON
    // y pegarlo como variable USERS_JSON en el panel de Vercel.
    console.warn('[auth] Actualiza USERS_JSON en Vercel con:', JSON.stringify(users));
    return;
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// ── Middleware: verifica JWT ───────────────────────────────────────────────────
function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ── Middleware: solo admin ─────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
  next();
}

// ── Middleware: verifica JWT + acceso al centro ────────────────────────────────
function requireCentroAccess(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    const centroId = req.params.centro;
    if (!req.user.centros?.includes(centroId)) {
      return res.status(403).json({ error: `Sin acceso al centro "${centroId}"` });
    }
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ── Rutas de autenticación y administración ───────────────────────────────────
function setupAuthRoutes(app) {

  // POST /api/auth/login
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    const users = loadUsers();
    const user  = users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    const payload = { username: user.username, role: user.role, centros: user.centros };
    const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, ...payload });
  });

  // GET /api/auth/me — devuelve datos del usuario logueado
  app.get('/api/auth/me', verifyToken, (req, res) => {
    res.json({ username: req.user.username, role: req.user.role, centros: req.user.centros });
  });

  // ── Admin: CRUD usuarios ────────────────────────────────────────────────────

  // GET /api/admin/users
  app.get('/api/admin/users', verifyToken, requireAdmin, (req, res) => {
    const users = loadUsers().map(({ passwordHash, ...u }) => u);
    res.json(users);
  });

  // POST /api/admin/users
  app.post('/api/admin/users', verifyToken, requireAdmin, (req, res) => {
    const { username, password, role = 'viewer', centros = [] } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username y password son obligatorios' });
    }
    const users = loadUsers();
    if (users.find(u => u.username === username)) {
      return res.status(409).json({ error: 'El usuario ya existe' });
    }
    const newUser = {
      username,
      passwordHash: bcrypt.hashSync(password, 10),
      role,
      centros,
    };
    users.push(newUser);
    saveUsers(users);
    const { passwordHash, ...safe } = newUser;
    res.status(201).json(safe);
  });

  // PUT /api/admin/users/:username
  app.put('/api/admin/users/:username', verifyToken, requireAdmin, (req, res) => {
    const users = loadUsers();
    const idx   = users.findIndex(u => u.username === req.params.username);
    if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
    const { password, role, centros } = req.body || {};
    if (password)             users[idx].passwordHash = bcrypt.hashSync(password, 10);
    if (role)                 users[idx].role         = role;
    if (centros !== undefined) users[idx].centros      = centros;
    saveUsers(users);
    const { passwordHash, ...safe } = users[idx];
    res.json(safe);
  });

  // DELETE /api/admin/users/:username
  app.delete('/api/admin/users/:username', verifyToken, requireAdmin, (req, res) => {
    if (req.params.username === req.user.username) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }
    const users    = loadUsers();
    const filtered = users.filter(u => u.username !== req.params.username);
    if (filtered.length === users.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    saveUsers(filtered);
    res.json({ ok: true });
  });
}

module.exports = { verifyToken, requireAdmin, requireCentroAccess, setupAuthRoutes };
