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
let prev = {}; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* nuevo */ }
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
const now = Date.now();
fs.writeFileSync(file, JSON.stringify({ user, email: email || prev.email || '', salt, hash, createdAt: prev.createdAt || now, changedAt: now }), { mode: 0o600 });
console.log('Administrador «' + user + '» actualizado en ' + file);
if (generated) console.log('Contraseña (cópiala ahora, no se vuelve a mostrar): ' + pw);
