/**
 * Script de configuración inicial del administrador.
 * Crea (o reemplaza) el usuario admin directamente en la pestaña USUARIOS
 * de la Google Spreadsheet.
 *
 * Ejecutar UNA SOLA VEZ antes de usar el dashboard por primera vez:
 *
 *   node init-admin.js
 */

require('dotenv').config({ path: '../.env' });
const bcrypt   = require('bcryptjs');
const { google } = require('googleapis');
const path     = require('path');
const readline = require('readline');

const CENTROS        = require('./centros');
const USERS_SHEET_ID = CENTROS.getafe.sheetId;
const USERS_TAB      = 'USUARIOS';
const CREDENTIALS_PATH = path.join(__dirname, '..', 'celtic-client-485117-p4-f4378a3f13f0.json');

async function getSheetsClient() {
  const authConfig = process.env.GOOGLE_CREDENTIALS
    ? { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS) }
    : { keyFile: CREDENTIALS_PATH };
  const auth = new google.auth.GoogleAuth({
    ...authConfig,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log('\n── Areatrans Dashboard · Setup admin ──────────────────');

  const username = (await ask('Nombre de usuario admin [admin]: ')).trim() || 'admin';
  const password = (await ask('Contraseña: ')).trim();
  if (!password) { console.error('La contraseña no puede estar vacía.'); process.exit(1); }

  console.log('\nConectando con Google Sheets…');
  const sheets = await getSheetsClient();

  // Crear pestaña si no existe
  const meta   = await sheets.spreadsheets.get({ spreadsheetId: USERS_SHEET_ID });
  const existe = meta.data.sheets.some(s => s.properties.title === USERS_TAB);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: USERS_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: USERS_TAB } } }] },
    });
    console.log(`Pestaña "${USERS_TAB}" creada.`);
  }

  // Leer usuarios existentes y eliminar admin previo
  const res  = await sheets.spreadsheets.values.get({ spreadsheetId: USERS_SHEET_ID, range: `${USERS_TAB}!A:D` });
  const rows = (res.data.values || []).slice(1); // sin cabecera
  const others = rows
    .filter(r => r[0] && r[2] !== 'admin')
    .map(r => [r[0], r[1], r[2], r[3] || '']);

  const hash    = bcrypt.hashSync(password, 10);
  const centros = Object.keys(CENTROS).join(',');
  const newRows = [
    ['username', 'passwordHash', 'role', 'centros'],
    [username, hash, 'admin', centros],
    ...others,
  ];

  await sheets.spreadsheets.values.clear({ spreadsheetId: USERS_SHEET_ID, range: `${USERS_TAB}!A:D` });
  await sheets.spreadsheets.values.update({
    spreadsheetId: USERS_SHEET_ID,
    range: `${USERS_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: newRows },
  });

  console.log(`\n✓ Usuario admin "${username}" guardado en la pestaña USUARIOS de Sheets.`);
  console.log('  Ya puedes arrancar el servidor con: npm start\n');
  rl.close();
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
