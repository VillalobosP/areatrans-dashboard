/**
 * Script de configuración inicial del administrador.
 * Ejecutar UNA SOLA VEZ antes de arrancar el servidor:
 *
 *   node init-admin.js
 *
 * Crea (o reemplaza) el usuario admin en users.json.
 */

const bcrypt   = require('bcryptjs');
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const USERS_FILE = path.join(__dirname, 'users.json');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log('\n── Areatrans Dashboard · Setup admin ──────────────────');

  const username = (await ask('Nombre de usuario admin [admin]: ')).trim() || 'admin';
  const password = (await ask('Contraseña: ')).trim();

  if (!password) {
    console.error('La contraseña no puede estar vacía.');
    process.exit(1);
  }

  let users = [];
  if (fs.existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      // Elimina admin anterior si existe
      users = users.filter(u => u.role !== 'admin');
    } catch { users = []; }
  }

  users.unshift({
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role:    'admin',
    centros: ['getafe', 'illescas'],
  });

  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');

  console.log(`\n✓ Usuario admin "${username}" creado en users.json`);
  console.log('  Ya puedes arrancar el servidor con: npm start\n');
  rl.close();
}

main().catch(err => { console.error(err); process.exit(1); });
