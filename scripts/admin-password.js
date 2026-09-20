'use strict';
/* Crea o restablece la contraseña del administrador (Viexbox) sin arrancar el servidor.
   Uso:
     node scripts/admin-password.js                      → genera una contraseña aleatoria y la muestra una vez
     node scripts/admin-password.js --password "MiClaveLarga123"
     node scripts/admin-password.js --email tu@correo.com   → además fija el correo del administrador (acceso y recuperación)
     node scripts/admin-password.js --user Viexbox --data ./data
   Solo se guarda el hash (scrypt) en DATA_DIR/admin.json; la contraseña no se almacena en ningún sitio. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const dataDir = opt('data') || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const user = (opt('user') || process.env.ADMIN_USER || 'Viexbox').slice(0, 14);
let pw = opt('password'), generated = false;
const email = opt('email') ? String(opt('email')).trim().toLowerCase() : '';
if (email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) { console.error('El correo no parece válido.'); process.exit(1); }
if (!pw) { generated = true; pw = ''; const al = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; for (const b of crypto.randomBytes(18)) pw += al[b % al.length]; }
if (pw.length < 12 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) { console.error('La contraseña necesita al menos 12 caracteres con letras y números.'); process.exit(1); }
fs.mkdirSync(dataDir, { recursive: true });
const file = path.join(dataDir, 'admin.json');
const DB_URL = process.env.DATABASE_URL;   // con PostgreSQL, las credenciales están en la tabla app_docs y no en el archivo
let prev = {}; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* nuevo */ }
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
const now = Date.now();
const done = where => { console.log('Administrador «' + user + '» actualizado en ' + where); if (generated) console.log('Contraseña (cópiala ahora, no se vuelve a mostrar): ' + pw); };
if (!DB_URL) {
  fs.writeFileSync(file, JSON.stringify({ user, email: email || prev.email || '', salt, hash, createdAt: prev.createdAt || now, changedAt: now }), { mode: 0o600 });
  done(file);
} else {
  const { Client } = require('pg'); const { sslFor } = require('../server/db.js');
  (async () => {
    const c = new Client({ connectionString: DB_URL, ssl: sslFor(DB_URL, process.env) }); await c.connect();
    try {
      await c.query('CREATE TABLE IF NOT EXISTS app_docs (name TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
      const old = (await c.query("SELECT data FROM app_docs WHERE name = 'admin.json'")).rows[0]; const p2 = old ? old.data : prev;
      const doc = JSON.stringify({ user, email: email || p2.email || '', salt, hash, createdAt: p2.createdAt || now, changedAt: now });
      await c.query("INSERT INTO app_docs (name, data) VALUES ('admin.json', $1::jsonb) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = now()", [doc]);
      done('PostgreSQL (app_docs)');
    } finally { await c.end(); }
  })().catch(e => { console.error('No se pudo actualizar en PostgreSQL: ' + e.message); process.exit(1); });
}
