'use strict';
/* [EVOLUTIVAS] Armas evolutivas (como en Free Fire): la ruleta evolutiva (PX, nunca repetidas) da el arma a nivel 1; se sube con fichas
   (1 por baja con esa arma en partidas con premio, con tope, o en paquetes con PX). Todo lo decide y cobra el servidor; los demás ven
   el arma con su nivel («id@nivel»). En el cliente (jsdom): cada nivel se construye con sus piezas 3D, las balas de dragón, fénix y
   rayo se mueven y desaparecen, y el efecto al eliminar no da errores. Se prueba con archivos y, si hay, con PostgreSQL. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
const APASS = 'Evo-Admin-2026xy', PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 60; const ip = () => '10.9.8.' + (ipn++);

function catalog() {
  console.log('=== Catálogo ===');
  ok(S.EVO_SKINS.length === 3 && S.EVO_SKINS.every(e => S.WEAPONS.some(w => w.id === e.w) && e.lv.length === S.EVO_MAX && e.ru && e.r === 'leyenda'), 'tres armas evolutivas (AK, Lince y Asalto) con ' + S.EVO_MAX + ' niveles');
  ok(S.EVO.cost.length === S.EVO_MAX && S.EVO.cost.slice(1).every((c, i, a) => c > 0 && (!i || c >= a[i - 1])), 'cada nivel cuesta más fichas: ' + S.EVO.cost.slice(1).join(' → '));
  const odds = S.rouletteOdds([], 'evo'); ok(odds.length === 3 && Math.abs(odds.reduce((a, o) => a + o.p, 0) - 1) < 1e-9, 'ruleta evolutiva: las tres con la misma probabilidad');
  ok(S.skinById('ak_evo_dragon@4').evo.lv === 4 && S.skinById('ak_evo_dragon@9').evo.lv === 5 && S.skinById('ak_evo_dragon@0').evo.lv === 1, 'el nivel de «id@nivel» se queda entre 1 y 5');
  ok(!S.bpFind({ t: 'evo', id: 'ak_evo_dragon' }), 'no se pueden vender ni intercambiar en el mercado (su nivel es de cada jugador)');
}

function clientChecks() {
  console.log('\n=== Cliente: modelos, balas y efectos ===');
  const PUB = path.join(__dirname, '..', 'public');
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {}; w.fetch = () => Promise.reject(new Error('sin servidor'));
  w.eval(fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'));
  w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.THREE.GLTFLoader = function () { this.load = () => {}; };
  w.eval(fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'));
  let c = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'); const i = c.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  c = c.slice(0, i) + 'window.__T = { gunModel, evoBullet, evoKillFx, tickEvoFx, mySkin, evoOf, evoShots, evoSprites, WEAPONS };\n' + c.slice(i);
  w.eval(c);
  const T = w.__T, THREE = w.THREE;
  for (const e of S.EVO_SKINS) {
    const wd = T.WEAPONS.find(x => x.id === e.w), n = [];
    for (let lv = 1; lv <= 5; lv++) { const g = T.gunModel(wd, 0, wd.optics ? wd.optics[0] : null, e.id + '@' + lv); let parts = null; g.traverse(o => { if (o.userData && o.userData.evoParts) parts = o; }); let k = 0; if (parts) parts.traverse(o => { if (o.isMesh) k++; }); n.push(k); }
    ok(n.every(k => k > 0) && n[1] > n[0] && n[4] > n[1], e.n + ': piezas 3D en cada nivel y muchas más al final (' + n.join(' → ') + '; las que brillan no llevan contorno)');
  }
  const a = new THREE.Vector3(0, 1, 0), b = new THREE.Vector3(0, 1, -30);
  for (const e of S.EVO_SKINS) T.evoBullet(a, b, S.skinById(e.id + '@3').evo, true);
  ok(T.evoShots.length === 2 && T.evoSprites.some(s => s.s.visible), 'balas de nivel 3: bola de fuego y bala dorada que vuelan (el rayo es instantáneo) con su estela');
  for (let k = 0; k < 40; k++) T.tickEvoFx(0.05);
  ok(T.evoShots.length === 0 && !T.evoSprites.some(s => s.s.visible), 'al llegar, las balas desaparecen y su estela se apaga');
  for (const e of S.EVO_SKINS) T.evoKillFx(new THREE.Vector3(0, 1, -5), S.skinById(e.id + '@4').evo);
  ok(T.evoSprites.some(s => s.s.visible), 'nivel 4: efecto al eliminar de las tres armas');
  w.PPR_BP.equipped = { 'weapon:ak': 'ak_evo_dragon', 'weapon:asalto': 'asalto_carbono' }; w.PPR_BP.state = { evo: { ak_evo_dragon: { lv: 3, tok: 0 } } };
  ok(T.mySkin('ak') === 'ak_evo_dragon@3' && T.mySkin('asalto') === 'asalto_carbono' && T.evoOf(T.mySkin('ak')).fx === 'fuego' && !T.evoOf('asalto_carbono'), 'tu arma equipada lleva el nivel que dice el servidor («ak_evo_dragon@3»)');
  ok(!errors.length, 'sin errores en el cliente' + (errors.length ? ': ' + errors[0] : ''));
}

/* Fichas por bajas: se llama a awardEvo como al acabar una partida con premio */
async function tokens(label, db, dir) {
  console.log('\n=== Fichas por bajas (' + label + ') ===');
  const { createBattlePass } = require('../server/battlepass.js');
  const accounts = { legacyPending: () => [], legacyDone() {}, spend: (u, n) => (u.px >= n ? (u.px -= n, true) : false), grant: (u, n) => { u.px += n; }, http: {}, fromToken: () => null, find: () => null };
  const bp = createBattlePass({ S, accounts, admin: { addRoutes() {}, audit() {} }, db, dataDir: dir, log: () => {} });
  const u = { id: 'u-evo-' + label.length, username: 'Evo_' + label.length, px: 0 };
  ok(Object.keys(await bp.awardEvo(u, { ak_evo_dragon: 5 })).length === 0, 'sin tener el arma, las bajas no dan fichas');
  await bp.store.grantItem(u.id, 'evo', 'ak_evo_dragon', 'prueba');
  const r = await bp.awardEvo(u, { ak_evo_dragon: 45, 'no_existe': 3 });
  let st = (await bp.store.evoState(u.id)).ak_evo_dragon;
  ok(r.ak_evo_dragon === S.EVO.killCap && st.tok === S.EVO.killCap && st.kills === 45 && st.lv === 1, '45 bajas en una partida dan ' + S.EVO.killCap + ' fichas (tope por partida); las bajas se cuentan todas');
  const up = await bp.store.evoUp(u.id, 'ak_evo_dragon', S.EVO.cost, S.EVO_MAX);
  ok(up.lv === 2 && up.tok === S.EVO.killCap - S.EVO.cost[1], 'con ' + S.EVO.cost[1] + ' fichas sube a nivel 2');
  ok((await bp.store.evoUp(u.id, 'ak_evo_dragon', S.EVO.cost, S.EVO_MAX)).error === 'tokens', 'sin fichas suficientes no sube');
  await bp.store.evoAdd(u.id, 'ak_evo_dragon', 10000, 0);
  for (let k = 0; k < 6; k++) await bp.store.evoUp(u.id, 'ak_evo_dragon', S.EVO.cost, S.EVO_MAX);
  st = (await bp.store.evoState(u.id)).ak_evo_dragon;
  ok(st.lv === S.EVO_MAX && (await bp.store.evoUp(u.id, 'ak_evo_dragon', S.EVO.cost, S.EVO_MAX)).error === 'max', 'llega al nivel ' + S.EVO_MAX + ' y de ahí no pasa');
  const t0 = st.tok; await bp.awardEvo(u, { ak_evo_dragon: 4 }); st = (await bp.store.evoState(u.id)).ak_evo_dragon;
  ok(st.tok === t0 && st.kills > 45, 'en el nivel máximo ya no se acumulan fichas (pero las bajas sí se cuentan)');
  ok((await bp.equippedLook(u.id)).ak === undefined, 'sin equiparla, los demás no la ven');
  await bp.store.equip(u.id, 'weapon:ak', 'ak_evo_dragon', 'evo');
  ok((await bp.equippedLook(u.id)).ak === 'ak_evo_dragon@5', 'equipada, los demás la ven con su nivel: ' + (await bp.equippedLook(u.id)).ak);
  if (bp.flush) bp.flush();
}

async function http(label, port, dir, dbUrl) {
  console.log('\n=== Servidor: ruleta, subir de nivel y equipar (' + label + ') ===');
  const B = 'http://127.0.0.1:' + port;
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, REQUIRE_TERMS: '0', FILL_BOTS: '0', DATABASE_URL: dbUrl }), stdio: 'ignore' }); procs.push(srv);
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  await sleep(dbUrl ? 2600 : 1400);
  const reg = async (u, e) => (await call('POST', '/api/auth/register', { username: u, email: e, password: 'Clave-Segura-77', terms: true })).j.token;
  const TA = await reg('Drako_1', 'drako@e.com'), TB = await reg('Fenix_2', 'fenix@e.com');
  const LA = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
  const R = S.EVO_ROULETTE, P = S.EVO.pack;
  const px = async tk => (await call('GET', '/api/me', null, tk)).j.profile.px;
  ok((await call('POST', '/api/bp/evo-spin', {}, TB)).status === 402, 'sin PX suficientes no se gira');
  await call('POST', '/api/admin/px', { username: 'Drako_1', delta: R.px * 3 + P.px * 2, reason: 'prueba' }, LA);
  const p0 = await px(TA), got = [];
  for (let i = 0; i < 3; i++) { const r = await call('POST', '/api/bp/evo-spin', {}, TA); if (r.status === 200) got.push(r.j.item); }
  ok(got.length === 3 && new Set(got).size === 3 && (await px(TA)) === p0 - R.px * 3, '3 tiradas de ' + R.px + ' PX dan las 3 armas sin repetir (' + got.join(', ') + ')');
  const st = (await call('GET', '/api/bp', null, TA)).j.state;
  ok(S.EVO_SKINS.every(e => st.evo[e.id] && st.evo[e.id].lv === 1 && st.evo[e.id].tok === 0), 'empiezan en nivel 1 con 0 fichas');
  ok((await call('POST', '/api/bp/evo-spin', {}, TA)).status === 409, 'con las tres, la ruleta no deja girar');
  ok((await call('POST', '/api/bp/equip', { slot: 'weapon:lince', item: 'ak_evo_dragon' }, TA)).status === 400, 'no se puede poner en otra arma');
  ok((await call('POST', '/api/bp/equip', { slot: 'weapon:ak', item: 'ak_evo_dragon' }, TB)).status === 403, 'quien no la tiene no la puede equipar');
  ok((await call('POST', '/api/bp/evo-up', { id: 'ak_evo_dragon' }, TA)).status === 402, 'sin fichas no sube de nivel');
  ok((await call('POST', '/api/bp/evo-tokens', { id: 'ak_evo_dragon' }, TB)).status === 403, 'no se compran fichas de un arma que no tienes');
  const q0 = await px(TA);
  for (let i = 0; i < 2; i++) await call('POST', '/api/bp/evo-tokens', { id: 'ak_evo_dragon' }, TA);
  const upr = await call('POST', '/api/bp/evo-up', { id: 'ak_evo_dragon' }, TA);
  ok((await px(TA)) === q0 - P.px * 2 && upr.status === 200 && upr.j.lv === 2 && upr.j.state.evo.ak_evo_dragon.tok === P.n * 2 - S.EVO.cost[1], 'dos paquetes (' + P.n * 2 + ' fichas, ' + P.px * 2 + ' PX) suben el Dragón a nivel 2');
  ok((await call('POST', '/api/bp/equip', { slot: 'weapon:ak', item: 'ak_evo_dragon' }, TA)).status === 200, 'se equipa en la AK');
  const gv = await call('POST', '/api/admin/bp/give', { username: 'Fenix_2', t: 'evo', id: 'lince_evo_fenix', reason: 'prueba' }, LA);
  ok(gv.status === 200 && gv.j.state.evo.lince_evo_fenix && gv.j.state.evo.lince_evo_fenix.lv === 1, 'el panel de administración puede regalar un arma evolutiva');
  ok((await call('POST', '/api/admin/bp/take', { username: 'Fenix_2', t: 'evo', id: 'lince_evo_fenix' }, LA)).status === 200, 'y quitarla');
  const conn = (name, tk) => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: { 'X-Forwarded-For': ip() } }); const msgs = [];
    ws.on('message', d => msgs.push(JSON.parse(d))); ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', v: 1, n: name, map: 0, c: 0, acct: tk || '' })); res({ ws, msgs }); }); });
  const seer = await conn('Fenix_2', TB); await until(() => seer.msgs.some(m => m.t === 'welcome'));
  const owner = await conn('Drako_1', TA);
  ok(await until(() => seer.msgs.some(m => (m.t === 'look' && m.sk && m.sk.ak === 'ak_evo_dragon@2') || (m.t === 'join' && m.p.sk && m.p.sk.ak === 'ak_evo_dragon@2'))), 'otro jugador de la sala ve la AK Dragón Infernal a nivel 2');
  for (const c of [seer, owner]) try { c.ws.close(); } catch (e) { /* nada */ }
  srv.kill(); await sleep(300);
}

(async () => {
  try {
    catalog(); clientChecks();
    const base = fs.mkdtempSync('/tmp/ppr-evo-');
    await tokens('archivos', null, path.join(base, 'unit')); await http('archivos', 3971, path.join(base, 'files'), '');
    let pgOk = false; try { const { Client } = require('pg'); const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('\n(sin PostgreSQL accesible: ' + e.message + ' — solo se prueba con archivos)'); }
    if (pgOk) {
      const { initDb } = require('../server/db.js'); const db = await initDb({ url: PG_URL, dataDir: path.join(base, 'pgu'), log: () => {} });
      await tokens('PostgreSQL', db, path.join(base, 'pgu')); await db.pool.end();
      await http('PostgreSQL', 3972, path.join(base, 'pg'), PG_URL);
    }
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
