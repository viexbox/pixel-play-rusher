'use strict';
/* PostgreSQL (opcional). Con DATABASE_URL definida:
   - el pase de batalla se guarda en sus tablas (ver migrations/);
   - las cuentas, el panel de administración y la clasificación se guardan como documentos JSONB (tabla app_docs),
     así sobreviven a reinicios y a redespliegues aunque el servidor no tenga disco propio (p. ej. Render).
   Sin DATABASE_URL todo sigue guardándose en archivos dentro de DATA_DIR. */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function sslFor(url, env) {
  const m = String(env.DATABASE_SSL || 'auto').toLowerCase();
  if (m === 'off' || m === '0' || m === 'false') return false;
  if (m === 'on' || m === '1' || m === 'true') return { rejectUnauthorized: false };
  let host = ''; try { host = new URL(url).hostname; } catch (e) { /* sin host */ }
  return /^(localhost|127\.|::1|postgres$|db$)/.test(host) ? false : { rejectUnauthorized: false };   // en servidores remotos (Render, Railway, Neon…) se usa TLS
}

async function initDb({ url, dataDir, log, env = process.env }) {
  const pool = new Pool({ connectionString: url, ssl: sslFor(url, env), max: +env.DATABASE_POOL || 8, connectionTimeoutMillis: 10000 });
  pool.on('error', e => log('PostgreSQL: ' + e.message));
  await pool.query('SELECT 1');
  /* Migraciones: cada archivo de migrations/ se aplica una sola vez, dentro de una transacción */
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const dir = path.join(__dirname, 'migrations');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) {
    if ((await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [f])).rowCount) continue;
    const c = await pool.connect();
    try { await c.query('BEGIN'); await c.query(fs.readFileSync(path.join(dir, f), 'utf8')); await c.query('INSERT INTO schema_migrations (id) VALUES ($1)', [f]); await c.query('COMMIT'); log('Migración aplicada: ' + f); }
    catch (e) { await c.query('ROLLBACK').catch(() => {}); throw new Error('Migración ' + f + ' falló: ' + e.message); }
    finally { c.release(); }
  }
  /* Documentos: se cargan todos al arrancar (son pequeños) y se escriben en segundo plano */
  const docs = new Map(); for (const r of (await pool.query('SELECT name, data FROM app_docs')).rows) docs.set(r.name, r.data);
  const pending = new Set();
  const db = {
    pool, docs, dataDir,
    get(name) { return docs.has(name) ? docs.get(name) : null; },
    put(name, obj) {
      const json = JSON.stringify(obj); docs.set(name, JSON.parse(json));
      const p = pool.query('INSERT INTO app_docs (name, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [name, json])
        .catch(e => log('No se pudo guardar ' + name + ' en PostgreSQL: ' + e.message)).then(() => { pending.delete(p); });
      pending.add(p); return p;
    },
    async drain(ms = 4000) { const t = Date.now(); while (pending.size && Date.now() - t < ms) await Promise.race([Promise.all([...pending]), new Promise(r => setTimeout(r, 200))]); },
    async close() { await db.drain(); await pool.end().catch(() => {}); }
  };
  return db;
}
module.exports = { initDb, sslFor };
