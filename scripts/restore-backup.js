#!/usr/bin/env node
'use strict';
/* Restaura una copia de seguridad de Krunxa.
   Uso:   node scripts/restore-backup.js <archivo.json.gz[.enc]> --yes
   Antes: PARA el servidor. Con DATABASE_URL restaura en PostgreSQL (sustituye el contenido de las tablas); sin ella, restaura los archivos en DATA_DIR.
   Variables: DATABASE_URL, DATA_DIR, BACKUP_PASSPHRASE (si la copia está cifrada). */
const fs = require('fs');
const path = require('path');
const { openBundle, dec } = require('../server/backup.js');

async function restore(file, opts) {
  opts = opts || {}; const env = opts.env || process.env, log = opts.log || console.log;
  const bundle = openBundle(fs.readFileSync(file), env.BACKUP_PASSPHRASE), dataDir = env.DATA_DIR || path.join(__dirname, '..', 'data');
  log('Copia del ' + new Date(bundle.meta.ts).toLocaleString('es-ES') + ' (' + bundle.meta.mode + ')');
  if (bundle.meta.mode === 'files') {
    if (env.DATABASE_URL) throw new Error('Esta copia es de archivos y hay DATABASE_URL definida. Quita DATABASE_URL para restaurarla en archivos.');
    let n = 0;
    for (const [rel, b64] of Object.entries(bundle.files)) {
      const dest = path.resolve(dataDir, rel); if (!dest.startsWith(path.resolve(dataDir) + path.sep)) throw new Error('Ruta no válida en la copia: ' + rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, Buffer.from(b64, 'base64'), { mode: 0o600 }); n++;
    }
    log('Restaurados ' + n + ' archivos en ' + dataDir); return { files: n };
  }
  if (!env.DATABASE_URL) throw new Error('Esta copia es de PostgreSQL: define DATABASE_URL.');
  const { initDb } = require('../server/db.js'); const db = await initDb({ url: env.DATABASE_URL, dataDir, log: () => {}, env });   // aplica las migraciones si el esquema está vacío
  const pool = db.pool, c = await pool.connect();
  try {
    await c.query('BEGIN');
    const have = new Set((await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows.map(r => r.table_name));
    const tables = Object.keys(bundle.tables).filter(t => have.has(t)), skipped = Object.keys(bundle.tables).filter(t => !have.has(t));
    if (skipped.length) log('Aviso: tablas de la copia que ya no existen y se omiten: ' + skipped.join(', '));
    await c.query('TRUNCATE ' + tables.map(t => '"' + t + '"').join(', ') + ' RESTART IDENTITY');
    let rows = 0;
    for (const t of tables) {
      const now = new Set((await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [t])).rows.map(r => r.column_name));
      const cols = bundle.tables[t].cols.filter(x => now.has(x.name));
      for (const r of bundle.tables[t].rows) {
        await c.query('INSERT INTO "' + t + '" (' + cols.map(x => '"' + x.name + '"').join(', ') + ') VALUES (' + cols.map((_, i) => '$' + (i + 1)).join(', ') + ')', cols.map(x => dec(r[x.name], x.type))); rows++;
      }
      /* que los contadores automáticos (id) sigan por encima del máximo restaurado */
      for (const s of (await c.query("SELECT column_name AS col, pg_get_serial_sequence('\"' || table_name || '\"', column_name) AS seq FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_default LIKE 'nextval%'", [t])).rows)
        if (s.seq) {   // el contador queda por encima tanto de las filas restauradas como de su valor cuando se hizo la copia
          const saved = +((bundle.sequences || {})[s.seq.replace(/^public\./, '')] || 0), mx = +((await c.query('SELECT COALESCE(MAX("' + s.col + '"), 0)::bigint AS m FROM "' + t + '"')).rows[0].m), top = Math.max(saved, mx);
          await c.query('SELECT setval($1, $2, $3)', [s.seq, top || 1, top > 0]);
        }
    }
    await c.query('COMMIT'); log('Restauradas ' + tables.length + ' tablas (' + rows + ' filas).'); return { tables: tables.length, rows };
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); await pool.end().catch(() => {}); }
}

if (require.main === module) {
  const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--'));
  if (!file || !fs.existsSync(file)) { console.error('Uso: node scripts/restore-backup.js <copia.json.gz> --yes'); process.exit(2); }
  if (!args.includes('--yes')) { console.error('Esto SUSTITUYE los datos actuales (' + (process.env.DATABASE_URL ? 'tablas de PostgreSQL' : 'archivos de ' + (process.env.DATA_DIR || 'data')) + ') por los de la copia.\nPara el servidor y repite el comando añadiendo --yes.'); process.exit(2); }
  restore(file).then(() => process.exit(0), e => { console.error('ERROR: ' + e.message); process.exit(1); });
}
module.exports = { restore };
