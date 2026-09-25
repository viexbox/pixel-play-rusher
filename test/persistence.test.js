'use strict';
/* Las cuentas no se pierden: escritura inmediata, apagado en seco (kill -9), archivo dañado con y sin copia buena, y PostgreSQL. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test', APASS = 'Per-Admin-2026xyz';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill('SIGKILL'); } catch (e) { /* nada */ } });
let ipn = 150; const ip = () => '10.2.8.' + (ipn++);
async function boot(port, dir, dbUrl) {
  const logFile = path.join(dir + '.log'); fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, DATABASE_URL: dbUrl || '', MAX_CONN_PER_IP: 30, ACCOUNTS_REG_MAX: 50, BACKUP_EVERY_HOURS: 0 }), stdio: ['ignore', fs.openSync(logFile, 'a'), fs.openSync(logFile, 'a')] }); procs.push(p);
  await sleep(dbUrl ? 2800 : 1700); const B = 'http://127.0.0.1:' + port;
  const call = async (m, pth, b, tk) => { const r = await fetch(B + pth, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  return { p, call, log: () => fs.readFileSync(logFile, 'utf8'), stop: async () => { p.kill('SIGTERM'); await sleep(1200); }, kill9: async () => { p.kill('SIGKILL'); await sleep(400); } };
}
const reg = (S, u) => S.call('POST', '/api/auth/register', { username: u, email: u.toLowerCase() + '@e.com', password: 'Clave-Segura-77' });
const login = async (S, u) => (await S.call('POST', '/api/auth/login', { identifier: u, password: 'Clave-Segura-77' }));

(async () => {
  console.log('=== Archivos ===');
  const D = '/tmp/ppr_per_files'; fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(D + '.log', { force: true });
  let S = await boot(3370, D);
  const r = await reg(S, 'Ana_1'); ok(r.status === 200 && !!r.j.token, 'se crea la cuenta Ana_1');
  ok(fs.existsSync(path.join(D, 'accounts.json')) && /Ana_1/.test(fs.readFileSync(path.join(D, 'accounts.json'), 'utf8')), 'y YA está en el disco en el instante de responder (no a los 1,5 s)');
  await S.kill9(); S = await boot(3370, D);
  ok((await login(S, 'Ana_1')).status === 200, 'tras matar el servidor en seco (kill -9) al instante, Ana_1 sigue existiendo y entra con su contraseña');
  await S.call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS }); const AD = (await S.call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
  await S.call('POST', '/api/admin/px', { username: 'Ana_1', delta: 700, reason: 'prueba' }, AD);
  const px = () => JSON.parse(fs.readFileSync(path.join(D, 'accounts.json'), 'utf8')); ok(Object.values(px().users).find(u => u.username === 'Ana_1').px === 700, 'un movimiento de PX también llega al disco al momento');
  await reg(S, 'Beto_2'); await S.kill9(); S = await boot(3370, D); ok((await login(S, 'Ana_1')).status === 200 && (await login(S, 'Beto_2')).status === 200 && (await login(S, 'Ana_1')).j.profile.px === 700, 'dos cuentas y sus PX sobreviven a otro apagado en seco');
  ok(fs.existsSync(path.join(D, 'accounts.json.bak')) && JSON.parse(fs.readFileSync(path.join(D, 'accounts.json.bak'), 'utf8')).users, 'existe una copia buena (accounts.json.bak) al lado del archivo principal');
  await S.stop();
  /* archivo dañado (corte de luz a mitad de escritura), CON copia buena */
  const f = path.join(D, 'accounts.json'), good = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, good.slice(0, Math.floor(good.length * 0.6)));
  S = await boot(3370, D); const q = fs.readdirSync(D).filter(n => /^accounts\.json\.corrupt-/.test(n));
  ok(q.length === 1 && fs.readFileSync(path.join(D, q[0]), 'utf8') === good.slice(0, Math.floor(good.length * 0.6)), 'con el archivo dañado: el original se guarda aparte SIN tocarlo (' + q[0] + ') en vez de sobrescribirlo');
  ok(/ATENCIÓN[^\n]*accounts\.json estaba dañado[^\n]*última copia buena/.test(S.log()), 'el servidor avisa en el registro y dice que recuperó la copia buena');
  ok((await login(S, 'Ana_1')).status === 200, 'y Ana_1 sigue pudiendo entrar (recuperada de la copia buena)');
  await S.stop();
  /* dañado y SIN copia buena */
  fs.rmSync(path.join(D, 'accounts.json.bak'), { force: true }); const now = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, now.slice(0, 50));
  S = await boot(3370, D); const q2 = fs.readdirSync(D).filter(n => /^accounts\.json\.corrupt-/.test(n));
  ok(q2.length === 2 && q2.some(n => fs.readFileSync(path.join(D, n), 'utf8') === now.slice(0, 50)), 'sin copia buena tampoco se destruye nada: ambos archivos dañados quedan guardados para recuperarlos a mano');
  ok(/no hay copia buena/.test(S.log()), 'el aviso dice claramente que no había copia buena');
  ok((await reg(S, 'Nuevo_3')).status === 200, 'y el servidor sigue funcionando y admite cuentas nuevas'); await S.stop();
  /* apagado normal */
  fs.rmSync(D, { recursive: true, force: true }); S = await boot(3370, D); for (const n of ['Uno_1', 'Dos_2', 'Tres_3']) await reg(S, n); await S.stop(); S = await boot(3370, D);
  ok((await Promise.all(['Uno_1', 'Dos_2', 'Tres_3'].map(n => login(S, n)))).every(x => x.status === 200), 'con un apagado normal (SIGTERM) se conservan las 3 cuentas'); await S.stop();

  /* ---------- PostgreSQL ---------- */
  let pgOk = false; const { Client } = require('pg'); try { const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('\n(PostgreSQL no disponible → se omite esa parte)'); }
  if (pgOk) {
    console.log('\n=== PostgreSQL ===');
    const D2 = '/tmp/ppr_per_pg'; fs.rmSync(D2, { recursive: true, force: true }); fs.rmSync(D2 + '.log', { force: true });
    S = await boot(3371, D2, PG_URL); const rp = await reg(S, 'Pg_1'); ok(rp.status === 200, 'se crea la cuenta Pg_1 con PostgreSQL');
    await S.kill9(); S = await boot(3371, D2, PG_URL); ok((await login(S, 'Pg_1')).status === 200, 'matando el servidor en seco justo tras responder, la cuenta ya estaba en la base de datos');
    const c = new Client({ connectionString: PG_URL }); await c.connect(); const row = (await c.query("SELECT data FROM app_docs WHERE name = 'accounts.json'")).rows[0]; ok(row && Object.values(row.data.users).some(u => u.username === 'Pg_1'), 'y consta en la tabla app_docs'); await c.end();
    await S.stop(); S = await boot(3371, D2, PG_URL); ok((await login(S, 'Pg_1')).status === 200, 'y tras un reinicio normal'); await S.stop();
  }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
