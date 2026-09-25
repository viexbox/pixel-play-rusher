'use strict';
/* Copias de seguridad (archivos y PostgreSQL), cifrado, retención y restauración. */
const { spawn, spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs'); const zlib = require('zlib'); const WebSocket = require('ws');
const { openBundle, encrypt, decrypt, NAME_RE } = require('../server/backup.js');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 120; const ip = () => '10.3.1.' + (ipn++), DAY = 86400000, APASS = 'Bkp-Admin-2026xyz';
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
const png = w => { const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(w, 4); ih[8] = 8; ih[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * w); for (let i = 0; i < raw.length; i++) raw[i] = Math.random() * 256; return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', require('zlib').deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };

/* ---------- 1) funciones puras ---------- */
console.log('=== Cifrado y nombres ===');
{
  const raw = zlib.gzipSync(Buffer.from(JSON.stringify({ app: 'pixel-play-rusher', meta: { ts: 1, mode: 'files' }, files: { 'a.json': 'e30=' } }))), e = encrypt(raw, 'clave');
  ok(e.slice(0, 5).toString() === 'PPRB1' && !e.includes(Buffer.from('pixel-play')) && decrypt(e, 'clave').equals(raw) && openBundle(e, 'clave').files['a.json'] === 'e30=', 'el cifrado (AES-256-GCM) se descifra con la clave y no deja texto legible');
  let bad = ''; try { decrypt(e, 'otra'); } catch (x) { bad = x.message; } let none = ''; try { openBundle(e, ''); } catch (x) { none = x.message; }
  const t2 = Buffer.from(e); t2[60] ^= 1; let dañado = ''; try { decrypt(t2, 'clave'); } catch (x) { dañado = x.message; }
  ok(/incorrecta o archivo dañado/.test(bad) && /cifrada/.test(none) && /dañado/.test(dañado), 'con otra clave, sin clave o con un byte alterado se rechaza (autenticado)');
  ok(NAME_RE.test('backup-20260920-120000.json.gz') && NAME_RE.test('backup-20260920-120000.json.gz.enc') && !NAME_RE.test('../secret.json') && !NAME_RE.test('backup-1.json.gz') && !NAME_RE.test('backup-20260920-120000.json.gz/../x'), 'solo se aceptan nombres de copia con el formato esperado (nada de rutas)');
}

async function boot(port, dir, env, dbUrl) {
  const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, MAX_CONN_PER_IP: 30, ACCOUNTS_REG_MAX: 50, TRADE_LOCK_HOURS: 0, AVATAR_MODERATION: 'off', BACKUP_EVERY_HOURS: 0, BACKUP_PASSPHRASE: '', DATABASE_URL: dbUrl || '' }, env), stdio: 'ignore' }); procs.push(p);
  const B = 'http://127.0.0.1:' + port; await sleep(dbUrl ? 2800 : 1700);
  const call = async (m, pth, b, tk) => { const r = await fetch(B + pth, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  const AD = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
  return { p, B, call, AD, adm: (m, pth, b) => call(m, '/api/admin' + pth, b, AD), stop: async () => { p.kill('SIGTERM'); await sleep(1300); }, port };
}
const login = async (S, u) => (await S.call('POST', '/api/auth/login', { identifier: u, password: 'Clave-Segura-77' })).j;
const reg = async (S, u, e) => (await S.call('POST', '/api/auth/register', { username: u, email: e, password: 'Clave-Segura-77' })).j.token;
async function populate(S) {
  const TA = await reg(S, 'Ana_1', 'ana@e.com'), TB = await reg(S, 'Beto_2', 'beto@e.com');
  await S.adm('POST', '/px', { username: 'Ana_1', delta: 2000, reason: 't' }); await S.adm('POST', '/credits', { username: 'Beto_2', delta: 5000, reason: 't' });
  const P1 = png(16); await S.call('POST', '/api/social/avatar', { image: 'data:image/png;base64,' + P1.toString('base64') }, TA); await S.call('POST', '/api/social/status', { status: 'hola copia' }, TA);
  await S.call('POST', '/api/me/unlock', { i: 6 }, TA); const L = await S.call('POST', '/api/market/list', { t: 'color', item: '6', price: 400 }, TA);
  await S.call('POST', '/api/social/request', { name: 'Beto_2' }, TA); await S.call('POST', '/api/social/accept', { name: 'Ana_1' }, TB);
  return { TA, TB, P1, listing: L.j.id };
}
const nameOfNew = l => l.backups.map(b => b.name);

(async () => {
  /* ---------- 2) archivos ---------- */
  console.log('\n=== Copias con archivos ===');
  const D1 = '/tmp/ppr_bk_files', D2 = '/tmp/ppr_bk_files2'; fs.rmSync(D1, { recursive: true, force: true }); fs.rmSync(D2, { recursive: true, force: true });
  let S = await boot(3330, D1, { BACKUP_KEEP: 2 }); const d = await populate(S);
  { const a = await S.call('GET', '/api/admin/backups'), b = await S.adm('GET', '/backups'), c = await S.call('GET', '/api/admin/backups', null, d.TA); ok(a.status === 401 && b.status === 200 && b.j.backups.length === 0 && c.status === 401, 'sin copias al empezar; solo el administrador puede verlas (sin sesión ' + a.status + ', admin ' + b.status + ' con ' + (b.j.backups || []).length + ' copias, jugador ' + c.status + ')'); }
  await S.adm('POST', '/credits', { username: 'Beto_2', delta: 123, reason: 'justo antes de la copia' });   // cambio recentísimo: debe entrar en la copia
  let r = await S.adm('POST', '/backups/run', {}); ok(r.status === 200 && NAME_RE.test(r.j.name) && r.j.size > 500, 'el administrador crea una copia (' + r.j.name + ', ' + r.j.size + ' bytes)');
  const f1 = path.join(D1, 'backups', r.j.name); ok(fs.existsSync(f1) && (fs.statSync(f1).mode & 0o777) === 0o600 && (fs.statSync(path.join(D1, 'backups')).mode & 0o777) === 0o700, 'guardada con permisos 0600 (solo el dueño) en una carpeta 0700');
  const b1 = openBundle(fs.readFileSync(f1), ''), acc = JSON.parse(Buffer.from(b1.files['accounts.json'], 'base64').toString());
  ok(b1.meta.mode === 'files' && Object.keys(b1.files).some(k => /^avatars[\\/]/.test(k)) && !Object.keys(b1.files).some(k => /^backups/.test(k)), 'el paquete es de archivos, incluye las fotos y NO se copia a sí mismo');
  const ben = Object.values(acc.users).find(u => u.username === 'Beto_2'), ana = Object.values(acc.users).find(u => u.username === 'Ana_1');
  ok(ben && ben.credits === 5123 && ana && ana.status === 'hola copia', 'lo que aún estaba en memoria (+123 CR y el estado) entra en la copia porque se vacía antes de copiar');
  ok(!!b1.files['seasons.json'] && !!b1.files['trades.json'] && !!b1.files['social.json'], 'incluye también temporadas, intercambios y denuncias de perfil (que antes no se vaciaban al apagar)');
  const dl = await fetch(S.B + '/api/admin/backups/download?name=' + r.j.name, { headers: { Authorization: 'Bearer ' + S.AD, 'X-Forwarded-For': ip() } }); const dbuf = Buffer.from(await dl.arrayBuffer());
  ok(dl.status === 200 && dbuf.equals(fs.readFileSync(f1)) && /attachment; filename="backup-/.test(dl.headers.get('content-disposition')) && dl.headers.get('cache-control') === 'no-store', 'la descarga devuelve exactamente el archivo, como adjunto y sin caché');
  ok((await fetch(S.B + '/api/admin/backups/download?name=' + r.j.name)).status === 401 && (await fetch(S.B + '/api/admin/backups/download?name=' + r.j.name, { headers: { Authorization: 'Bearer ' + d.TA } })).status === 401, 'sin sesión de administrador (o con la de un jugador) no se descarga');
  for (const bad of ['../secret.json', '..%2Fsecret.json', 'accounts.json', 'backup-20260101-000000.json.gz', '%2Fetc%2Fpasswd']) { const x = await fetch(S.B + '/api/admin/backups/download?name=' + bad, { headers: { Authorization: 'Bearer ' + S.AD, 'X-Forwarded-For': ip() } }); if (x.status !== 404) { ok(false, 'nombre malicioso ' + bad + ' → ' + x.status); } }
  ok(true, 'nombres con rutas, archivos de datos u otras copias inexistentes: siempre 404');
  for (let i = 0; i < 3; i++) { await sleep(1100); await S.adm('POST', '/backups/run', {}); }
  let l = (await S.adm('GET', '/backups')).j; ok(l.backups.length === 2 && l.keep === 2 && l.backups[0].ts >= l.backups[1].ts && !nameOfNew(l).includes(r.j.name), 'con BACKUP_KEEP=2 solo quedan las 2 más recientes (la primera se borró)');
  ok((await S.adm('POST', '/backups/delete', { name: l.backups[1].name })).status === 200 && (await S.adm('GET', '/backups')).j.backups.length === 1 && (await S.adm('POST', '/backups/delete', { name: '../x' })).status === 404, 'se puede borrar una copia; nombres con rutas no');
  ok((await S.adm('GET', '/audit')).j.audit.filter(a => /^copia-/.test(a.action)).map(a => a.action).join().includes('copia-crear') && (await S.adm('GET', '/audit')).j.audit.some(a => a.action === 'copia-descargar') && (await S.adm('GET', '/audit')).j.audit.some(a => a.action === 'copia-borrar'), 'crear, descargar y borrar quedan en la auditoría');
  /* restaurar en un directorio limpio */
  const good = (await S.adm('GET', '/backups')).j.backups[0].name; await S.adm('POST', '/backups/run', {}); const last = (await S.adm('GET', '/backups')).j.backups[0].name; await S.stop();
  const rs = (args, env) => spawnSync('node', [path.join(__dirname, '..', 'scripts', 'restore-backup.js')].concat(args), { env: Object.assign({}, process.env, { DATABASE_URL: '', DATA_DIR: D2 }, env), encoding: 'utf8' });
  let x = rs([path.join(D1, 'backups', last)]); ok(x.status === 2 && /--yes/.test(x.stderr) && !fs.existsSync(path.join(D2, 'accounts.json')), 'sin --yes no toca nada y explica qué haría');
  x = rs(['/tmp/no-existe.json.gz', '--yes']); ok(x.status === 2, 'un archivo que no existe se rechaza');
  fs.writeFileSync('/tmp/no-copia.json.gz', zlib.gzipSync(Buffer.from('{"otra":"cosa"}'))); x = rs(['/tmp/no-copia.json.gz', '--yes']); ok(x.status === 1 && /No es una copia/.test(x.stderr), 'un archivo que no es una copia de este juego se rechaza');
  x = rs([path.join(D1, 'backups', last), '--yes'], { DATABASE_URL: PG_URL }); ok(x.status === 1 && /hay DATABASE_URL/.test(x.stderr), 'una copia de archivos no se restaura sobre PostgreSQL por error');
  x = rs([path.join(D1, 'backups', last), '--yes']); ok(x.status === 0 && /Restaurados \d+ archivos/.test(x.stdout) && fs.existsSync(path.join(D2, 'avatars')), 'con --yes restaura en el directorio nuevo (' + (x.stdout.match(/Restaurados \d+ archivos/) || [''])[0] + ')');
  const S2 = await boot(3331, D2, {}); const lg = await login(S2, 'Ana_1'); ok(!!lg.token && lg.profile.px >= 2000 - 300, 'el servidor arranca con lo restaurado y Ana entra con su contraseña de siempre');
  const pr = (await S2.call('GET', '/api/profile?name=Ana_1')).j.profile; const av = await fetch(S2.B + '/api/avatar?u=Ana_1', { headers: { 'X-Forwarded-For': ip() } });
  ok(pr.status === 'hola copia' && pr.avatar.kind === 'custom' && Buffer.from(await av.arrayBuffer()).equals(d.P1), 'conserva su estado y su foto (byte a byte)');
  const mkt = (await S2.call('GET', '/api/market', null, lg.token)).j; ok(mkt.listings.some(x => x.id === d.listing && x.t === 'color' && x.price === 400) && (await login(S2, 'Beto_2')).profile.credits === 5123, 'conserva el anuncio del mercado y los Créditos de Beto (5.123)');
  ok((await S2.call('GET', '/api/social', null, lg.token)).j.friends[0].username === 'Beto_2', 'y la amistad');
  await S2.stop();

  /* ---------- 3) cifrado y programación ---------- */
  console.log('\n=== Cifrado y programación ===');
  const D3 = '/tmp/ppr_bk_enc'; fs.rmSync(D3, { recursive: true, force: true }); S = await boot(3332, D3, { BACKUP_PASSPHRASE: 'frase-secreta-de-prueba' }); await populate(S);
  r = await S.adm('POST', '/backups/run', {}); const fe = path.join(D3, 'backups', r.j.name), raw = fs.readFileSync(fe);
  ok(/\.json\.gz\.enc$/.test(r.j.name) && raw.slice(0, 5).toString() === 'PPRB1' && !raw.includes(Buffer.from('Ana_1')) && raw[0] !== 0x1f, 'con BACKUP_PASSPHRASE la copia va cifrada (.enc): ni el nombre de un jugador se lee dentro');
  ok((await S.adm('GET', '/backups')).j.encrypted === true && openBundle(raw, 'frase-secreta-de-prueba').meta.mode === 'files', 'el panel lo indica y con la frase se abre');
  x = spawnSync('node', [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), fe, '--yes'], { env: Object.assign({}, process.env, { DATABASE_URL: '', DATA_DIR: '/tmp/ppr_bk_enc2', BACKUP_PASSPHRASE: 'mala' }), encoding: 'utf8' }); ok(x.status === 1 && /incorrecta/.test(x.stderr), 'restaurar con una frase equivocada falla sin escribir nada'); await S.stop();
  const D4 = '/tmp/ppr_bk_sched'; fs.rmSync(D4, { recursive: true, force: true }); S = await boot(3333, D4, { BACKUP_EVERY_HOURS: 0.0003, BACKUP_FIRST_MS: 500, BACKUP_CHECK_MS: 400 }); await sleep(3500);
  const auto = (await S.adm('GET', '/backups')).j; ok(auto.backups.length >= 1 && auto.backups.length <= 4 && auto.everyHours === 0.0003, 'la programación crea copias sola cuando toca (' + auto.backups.length + ' en 3,5 s con un intervalo de ~1 s) sin acumular sin límite'); await S.stop();

  /* ---------- 5) PostgreSQL ---------- */
  let pgOk = false; const { Client } = require('pg'); try { const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('\n(PostgreSQL no disponible → se omite esa parte)'); }
  if (pgOk) {
    console.log('\n=== Copias con PostgreSQL ===');
    S = await boot(3335, '/tmp/ppr_bk_pg', {}, PG_URL); const q = await populate(S); await S.call('POST', '/api/market/buy', { id: q.listing }, q.TB);
    await S.adm('POST', '/px', { username: 'Beto_2', delta: 1000, reason: 't' }); await S.call('POST', '/api/me/unlock', { i: 7 }, q.TB); const L3 = await S.call('POST', '/api/market/list', { t: 'color', item: '7', price: 300 }, q.TB); await sleep(200);
    r = await S.adm('POST', '/backups/run', {}); const pf = path.join('/tmp/ppr_bk_pg', 'backups', r.j.name), pb = openBundle(fs.readFileSync(pf), '');
    ok(r.status === 200 && pb.meta.mode === 'postgres' && ['app_docs', 'market_sales', 'market_listings', 'user_avatars', 'schema_migrations', 'bp_progress'].every(t => pb.tables[t]), 'copia de PostgreSQL con todas las tablas (' + Object.keys(pb.tables).length + ')');
    ok(pb.tables.user_avatars.rows.length === 1 && Buffer.from(pb.tables.user_avatars.rows[0].data.$b, 'base64').equals(q.P1) && pb.tables.market_sales.rows.length === 1 && pb.tables.schema_migrations.rows.length === 6, 'la foto (bytea) y las ventas van completas y las 6 migraciones constan (la 006 es la de mascotas)');
    ok(pb.tables.app_docs.rows.some(x => x.name === 'accounts.json') && pb.tables.app_docs.rows.some(x => x.name === 'seasons.json'), 'y los documentos de cuentas y temporadas');
    const accRow = pb.tables.app_docs.rows.find(x => x.name === 'accounts.json'), accs = Object.values(accRow.data.users); ok(accs.find(u => u.username === 'Beto_2').unlocked.includes(6), 'la copia lleva lo último: el color que Beto acababa de comprar');
    const maxId = Math.max(...pb.tables.market_sales.rows.map(x => +x.id), ...pb.tables.market_listings.rows.map(x => +x.id)); await S.stop();
    /* vaciar todo y restaurar */
    const c = new Client({ connectionString: PG_URL }); await c.connect(); const tabs = (await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")).rows.map(x => x.table_name);
    await c.query('TRUNCATE ' + tabs.map(t => '"' + t + '"').join(', ') + ' RESTART IDENTITY'); ok((await c.query('SELECT count(*)::int AS n FROM app_docs')).rows[0].n === 0 && (await c.query('SELECT count(*)::int AS n FROM user_avatars')).rows[0].n === 0, 'preparación: la base de datos queda vacía (como tras un desastre)'); await c.end();
    x = spawnSync('node', [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), pf, '--yes'], { env: Object.assign({}, process.env, { DATABASE_URL: PG_URL, DATA_DIR: '/tmp/ppr_bk_pg' }), encoding: 'utf8' });
    ok(x.status === 0 && /Restauradas \d+ tablas/.test(x.stdout), 'restaurar: ' + (x.stdout.match(/Restauradas [^\n]+/) || [x.stderr.slice(0, 200)])[0]);
    S = await boot(3336, '/tmp/ppr_bk_pg', {}, PG_URL); const lg2 = await login(S, 'Ana_1'); ok(!!lg2.token, 'el servidor arranca sobre la base restaurada y Ana entra con su contraseña');
    const av2 = await fetch(S.B + '/api/avatar?u=Ana_1', { headers: { 'X-Forwarded-For': ip() } }); ok(Buffer.from(await av2.arrayBuffer()).equals(q.P1), 'la foto (bytea) vuelve idéntica');
    const b2 = await login(S, 'Beto_2'); ok(b2.profile.unlocked.includes(6) && (await S.call('GET', '/api/market', null, b2.token)).j.listings.some(x => x.id === L3.j.id && x.item === '7'), 'Beto conserva el color comprado y su anuncio activo');
    const nl = await S.call('POST', '/api/market/list', { t: 'color', item: '6', price: 500 }, b2.token); ok(nl.status === 200 && nl.j.id > maxId, 'los contadores automáticos siguen por encima de lo restaurado y de lo ya vendido: el anuncio nuevo tiene id ' + nl.j.id + ' > ' + maxId + ' [' + (nl.j.error || '') + ']');
    await S.stop();
  }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
