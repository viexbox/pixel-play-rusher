'use strict';
/* Pixel Play Rusher · Copias de seguridad automáticas.
   - Cada BACKUP_EVERY_HOURS horas (24 por defecto; 0 = desactivadas) se guarda una copia completa en BACKUP_DIR (por defecto DATA_DIR/backups) y se conservan las últimas BACKUP_KEEP (7).
   - Con archivos: todo lo que hay en DATA_DIR (cuentas, pase, panel, clasificación, fotos…). Con PostgreSQL: todas las tablas del esquema public (incluido app_docs).
   - Formato: JSON comprimido (.json.gz). Con BACKUP_PASSPHRASE se cifra con AES-256-GCM (clave derivada con scrypt) y el archivo acaba en .enc.
   - Permisos 0600. La descarga es solo para administradores y queda en la auditoría. Una copia contiene correos y contraseñas cifradas: guárdala como un dato sensible.
   - Restaurar: node scripts/restore-backup.js <archivo> --yes (con el servidor parado).
   Aviso honesto: una copia en el mismo disco/servidor no protege si se pierde ese servidor. Usa BACKUP_DIR en un volumen aparte o descarga copias con regularidad;
   con PostgreSQL gestionado, las copias del proveedor siguen siendo la primera línea de defensa. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const MAGIC = Buffer.from('PPRB1');
const NAME_RE = /^backup-\d{8}-\d{6}\.json\.gz(\.enc)?$/;

/* ---- cifrado ---- */
function encrypt(buf, pass) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(pass, salt, 32);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv), enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), enc]);
}
function decrypt(buf, pass) {
  if (!buf.slice(0, 5).equals(MAGIC)) throw new Error('El archivo no es una copia cifrada válida.');
  if (!pass) throw new Error('Esta copia está cifrada: indica BACKUP_PASSPHRASE.');
  const salt = buf.slice(5, 21), iv = buf.slice(21, 33), tag = buf.slice(33, 49), key = crypto.scryptSync(pass, salt, 32);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
  try { return Buffer.concat([d.update(buf.slice(49)), d.final()]); } catch (e) { throw new Error('Contraseña de la copia incorrecta o archivo dañado.'); }
}
/* Lee una copia (con o sin cifrado) y devuelve el paquete JSON */
function openBundle(buf, pass) {
  if (buf.slice(0, 5).equals(MAGIC)) buf = decrypt(buf, pass);
  const b = JSON.parse(zlib.gunzipSync(buf).toString('utf8')); if (!b || b.app !== 'pixel-play-rusher' || !b.meta) throw new Error('No es una copia de Pixel Play Rusher.'); return b;
}

/* ---- serialización de filas de PostgreSQL (bytea y fechas incluidos) ---- */
const enc = v => (Buffer.isBuffer(v) ? { $b: v.toString('base64') } : v instanceof Date ? { $d: v.toISOString() } : v);
const dec = (v, type) => (v && typeof v === 'object' && v.$b !== undefined ? Buffer.from(v.$b, 'base64') : v && typeof v === 'object' && v.$d !== undefined ? new Date(v.$d) : (type === 'jsonb' || type === 'json') && v !== null ? JSON.stringify(v) : v);

function walk(dir, base, out) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, f.name);
    if (f.isDirectory()) { if (rel === 'backups') continue; walk(path.join(dir, f.name), rel, out); }
    else if (!/\.tmp$/.test(f.name)) out.push(rel);
  }
  return out;
}

function createBackup({ db, dataDir, admin, flush, log, env }) {
  env = env || process.env;
  const dir = env.BACKUP_DIR || path.join(dataDir, 'backups'), EVERY = env.BACKUP_EVERY_HOURS !== undefined && env.BACKUP_EVERY_HOURS !== '' ? +env.BACKUP_EVERY_HOURS : 24;
  const KEEP = Math.max(1, +env.BACKUP_KEEP || 7), PASS = env.BACKUP_PASSPHRASE || '', CHECK_MS = +env.BACKUP_CHECK_MS || 60000;
  let running = null, lastError = '';
  const stamp = d => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

  async function snapshot() {
    const meta = { v: 1, ts: Date.now(), mode: db ? 'postgres' : 'files', node: process.version };
    if (!db) {
      await flush();   // lo que aún está en memoria se escribe a disco antes de copiar
      const files = {}; for (const rel of walk(dataDir, '', [])) { try { files[rel] = fs.readFileSync(path.join(dataDir, rel)).toString('base64'); } catch (e) { /* desapareció mientras se copiaba */ } }
      return { app: 'pixel-play-rusher', meta, files };
    }
    await flush(); await db.drain();
    const tables = {};
    for (const t of (await db.pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")).rows.map(r => r.table_name)) {
      const cols = (await db.pool.query("SELECT column_name AS name, data_type AS type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position", [t])).rows;
      const rows = (await db.pool.query('SELECT * FROM "' + t + '"')).rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, enc(v)])));
      tables[t] = { cols, rows };
    }
    /* Valor actual de cada contador automático (id): al restaurar se reponen desde aquí, así no se reutilizan ids de filas que ya no existen (p. ej. anuncios vendidos) */
    const sequences = Object.fromEntries((await db.pool.query("SELECT sequencename, last_value::text AS v FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL")).rows.map(r => [r.sequencename, r.v]));
    return { app: 'pixel-play-rusher', meta, tables, sequences };
  }

  function prune() {
    const all = list(); for (const f of all.slice(KEEP)) { try { fs.unlinkSync(path.join(dir, f.name)); } catch (e) { /* ya no está */ } }
  }
  function list() {
    try { return fs.readdirSync(dir).filter(n => NAME_RE.test(n)).map(n => { const st = fs.statSync(path.join(dir, n)); return { name: n, size: st.size, ts: +st.mtime, encrypted: n.endsWith('.enc') }; }).sort((a, b) => b.ts - a.ts || (a.name < b.name ? 1 : -1)); } catch (e) { return []; }
  }
  async function run(by) {
    if (running) return running;
    running = (async () => {
      try {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        const bundle = await snapshot(); let buf = zlib.gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 6 }); if (PASS) buf = encrypt(buf, PASS);
        let name = 'backup-' + stamp(new Date()) + '.json.gz' + (PASS ? '.enc' : ''), n = 0; while (fs.existsSync(path.join(dir, name))) name = 'backup-' + stamp(new Date(Date.now() + 1000 * ++n)) + '.json.gz' + (PASS ? '.enc' : '');
        const tmp = path.join(dir, name + '.tmp'); fs.writeFileSync(tmp, buf, { mode: 0o600 }); fs.renameSync(tmp, path.join(dir, name)); prune(); lastError = '';
        log('Copia de seguridad ' + name + ' (' + Math.round(buf.length / 1024) + ' KB, ' + (db ? 'PostgreSQL' : 'archivos') + (PASS ? ', cifrada' : '') + (by ? ', por ' + by : ', automática') + ')');
        return { ok: true, name, size: buf.length };
      } catch (e) { lastError = e.message; log('Copia de seguridad fallida: ' + e.message); return { ok: false, error: e.message }; }
      finally { running = null; }
    })();
    return running;
  }
  /* Programación: al arrancar (tras un minuto) y luego cada hora, si la última copia es más antigua que EVERY */
  let timer = null;
  if (EVERY > 0) {
    const due = () => { const l = list()[0]; if (!l || Date.now() - l.ts >= EVERY * 3600000) run(); };
    setTimeout(due, +env.BACKUP_FIRST_MS || 60000).unref(); timer = setInterval(due, CHECK_MS); timer.unref();
  }
  const info = () => ({ dir, everyHours: EVERY, keep: KEEP, encrypted: !!PASS, mode: db ? 'postgres' : 'files', lastError, backups: list(), running: !!running });
  /* Nombre válido y dentro de la carpeta (nada de rutas) → ruta absoluta o null */
  const pathOf = name => (NAME_RE.test(String(name || '')) && fs.existsSync(path.join(dir, name)) ? path.join(dir, name) : null);

  admin.addRoutes({
    'GET /backups': () => info(),
    'POST /backups/run': async ({ s }) => { const r = await run(s.user); if (r.ok) admin.audit(s.user, 'copia-crear', r.name); return r.ok ? Object.assign({ ok: true }, r) : { code: 500, error: 'No se pudo crear la copia: ' + r.error }; },
    'GET /backups/download': ({ q, s }) => { const p = pathOf(q.get('name')); if (!p) return { code: 404, error: 'Esa copia no existe.' }; admin.audit(s.user, 'copia-descargar', q.get('name')); return { __file: { name: path.basename(p), buf: fs.readFileSync(p) } }; },
    'POST /backups/delete': ({ b, s }) => { const p = pathOf(b.name); if (!p) return { code: 404, error: 'Esa copia no existe.' }; fs.unlinkSync(p); admin.audit(s.user, 'copia-borrar', b.name); return { ok: true }; }
  });
  return { run, list, info, pathOf, snapshot };
}

module.exports = { createBackup, openBundle, encrypt, decrypt, dec, NAME_RE };
