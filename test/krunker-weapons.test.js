'use strict';
/* [ARMAS KRUNKER] Armas al estilo Krunker: números, las tres nuevas (Tríada de ráfaga, Cometa lanzacohetes y Arpón ballesta) y su lógica en el servidor real:
   la ráfaga respeta su pausa, el cohete vuela y explota con daño en área y el virote vuela y hace daño directo. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const W = S.WEAPONS, by = id => W.find(w => w.id === id);

console.log('=== 1. Datos ===');
ok(W.length === 14 && W.slice(0, 11).map(w => w.id).join() === 'asalto,rafaga,torrente,lince,trueno,sheriff,precision,duo,ak,vortice,centinela', 'las 11 armas de siempre conservan su número de clase (compras, skins y eventos no se rompen)');
ok(W.slice(11).map(w => w.id).join() === 'triada,cometa,arpon', 'las nuevas van al final: Tríada, Cometa y Arpón');
ok(by('asalto').dmg === 23 && by('rafaga').mag === 24 && by('torrente').mag === 60 && by('lince').dmg === 100 && by('lince').mag === 3 && by('sheriff').dmg === 66 && by('trueno').mag === 2 && by('precision').mag === 8, 'daño y cargadores como en Krunker (fusil 23, subfusil 24 balas, ametralladora 60, francotirador 100 con 3 balas, revólver 66, escopeta 2, semiautomático 8)');
ok(by('torrente').speed < 0.85 && by('cometa').speed < 0.9 && by('rafaga').speed > 1, 'la ametralladora y el lanzacohetes te frenan; el subfusil te acelera');
const tr = by('triada'), co = by('cometa'), ar = by('arpon');
ok(tr.burst === 3 && tr.burstCd > tr.interval * 3 && !tr.proj, 'Tríada: ráfagas de 3 con pausa entre ráfagas');
ok(co.proj && co.proj.splash > 0 && co.mag === 1 && co.dmg > 100 && ar.proj && !ar.proj.splash && ar.proj.g > 0 && ar.mag === 1 && ar.head >= 100, 'Cometa: cohete con explosión · Arpón: virote con caída que mata de un tiro a la cabeza');
ok(S.SHOP.length === 14 && ['triada', 'cometa', 'arpon'].every(id => S.SHOP.some(x => W[x.wi].id === id && x.price > 1000)), 'las tres nuevas se venden en la tienda de la partida');
ok(S.shopStats(tr).rpm < Math.round(60 / tr.interval), 'la tarjeta de la Tríada cuenta la pausa entre ráfagas en su cadencia (' + S.shopStats(tr).rpm + ' RPM)');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8'), i18n = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
ok(['triada: buildBullpupHD', 'cometa: buildLauncherHD', 'arpon: buildCrossbowHD'].every(k => src.includes(k)), 'cada una tiene su modelo 3D detallado (bullpup, tubo lanzacohetes y ballesta)');
ok(W.slice(11).every(w => ['name', 'type', 'desc'].every(k => i18n.includes('"' + w[k] + '"'))), 'nombres, tipos y descripciones traducidos al inglés');
{ const botW = src.match(/const BOT_WEAPONS = \[([^\]]*)\]/)[1].split(',').map(Number), srvBots = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').match(/const BOT_CLASSES = \[([^\]]*)\]/)[1].split(',').map(Number);
  ok(botW.concat(srvBots).every(i => !W[i].proj && !W[i].burst), 'los bots no usan cohetes, ballesta ni ráfagas'); }

console.log('\n=== 2. En el servidor real ===');
const PORT = 3791, D = '/tmp/ppr_krunker', B = 'http://127.0.0.1:' + PORT;
class Bot {
  constructor(name) { this.name = name; this.msgs = []; this.pos = null; this.id = null; this.spawnAt = 0; this.others = new Map(); }
  connect() { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': '10.9.9.' + (++Bot.n) } }); this.ws.on('open', () => this.send({ t: 'hello', v: 1, n: this.name, map: 0, c: 0 }));
    this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); this.on(m); if (m.t === 'welcome') { this.id = m.id; this.welcome = m; res(m); } }); this.ws.on('error', () => {}); }); }
  on(m) {
    if (m.t === 'spawn' && m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; this.spawnAt = Date.now(); }
    if (m.t === 'spawn' && this.others.has(m.id)) this.others.set(m.id, { x: m.x, z: m.z });
    if (m.t === 'join') this.others.set(m.p.id, { x: 0, z: 0 });
    if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; }
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(t, f) { return this.msgs.some(m => m.t === t && (!f || f(m))); } last(t) { return [...this.msgs].reverse().find(m => m.t === t); } all(t) { return this.msgs.filter(m => m.t === t); }
  async walkTo(x, z, secs = 6) { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000 && Math.hypot(x - this.pos.x, z - this.pos.z) > 0.3) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: 0, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(50); } }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}
Bot.n = 0;
const world = S.buildWorld(0);
const los = (a, b) => { const o = { x: a.x, y: 1.6, z: a.z }, d = { x: b.x - a.x, y: -0.4, z: b.z - a.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world.colliders, o, d, l) >= l - 0.05; };
async function ring(bot, tgt) { for (let r = 6; r <= 20; r += 0.6) for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r; if (Math.abs(x) > 56 || Math.abs(z) > 56 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; if (los({ x, z }, tgt)) { bot.goal = { x, z }; await bot.walkTo(x, z); return true; } } return false; }
async function duel(cls, name) {
  const A = new Bot(name + '_A'), V = new Bot(name + '_V'); await A.connect(); await V.connect();
  A.ws.send(JSON.stringify({ t: 'cls', c: cls })); A.cls = cls;
  await until(() => A.pos && V.pos, 4000);
  if (A.welcome.tm === V.welcome.tm) return null;
  await until(() => Date.now() - V.spawnAt > 1700 && Date.now() - A.spawnAt > 1700, 4000);
  if (!await ring(A, V.pos)) return null;
  const goal = { x: A.goal.x, z: A.goal.z }; await A.walkTo(goal.x, goal.z, 15);   // si el camino es largo, termina de llegar
  if (Math.hypot(goal.x - A.pos.x, goal.z - A.pos.z) > 0.5 || !los(A.pos, V.pos)) return null;
  return { A, V };
}
const aim = (A, x, y, z) => { const dx = x - A.pos.x, dy = y - 1.6, dz = z - A.pos.z, l = Math.hypot(dx, dy, dz); return [dx / l, dy / l, dz / l]; };

(async () => {
  fs.rmSync(D, { recursive: true, force: true });
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: D, WALL_CHECK: '0', REQUIRE_TERMS: '0', FILL_BOTS: '0' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
  try {
    let up = false; for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(B + '/healthz')).ok; } catch (e) { await sleep(100); } }
    ok(up, 'el servidor arranca');
    /* la clase elegida se aplica al reaparecer: se entra directamente con ella en el saludo */
    const withCls = async (cls, name) => { const orig = Bot.prototype.connect; Bot.prototype.connect = function () { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': '10.9.8.' + (++Bot.n) } }); this.ws.on('open', () => this.send({ t: 'hello', v: 1, n: this.name, map: 0, c: this.name.endsWith('_A') ? cls : 0 }));
      this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); this.on(m); if (m.t === 'welcome') { this.id = m.id; this.welcome = m; res(m); } }); this.ws.on('error', () => {}); }); };
      try { return await duel(cls, name); } finally { Bot.prototype.connect = orig; } };

    /* --- Cometa: el cohete vuela, explota junto al rival y le hace daño en área --- */
    { const d = await withCls(12, 'Cohete'); ok(!!d, 'duelo preparado con el lanzacohetes');
      if (d) { const { A, V } = d, t = { x: V.pos.x, z: V.pos.z }, dx = t.x - A.pos.x, dz = t.z - A.pos.z, l = Math.hypot(dx, dz), side = { x: -dx / l * 1.5, z: -dz / l * 1.5 };   // 1,5 m por delante del rival, en el lado del que dispara (siempre a la vista)
        const t0 = Date.now(); A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [aim(A, t.x + side.x, 0, t.z + side.z)] });
        ok(await until(() => V.has('proj', m => m.id === A.id && m.c === 12), 2000), 'el rival recibe el cohete en vuelo (para dibujarlo)');
        ok(await until(() => V.has('boom'), 3000) && Date.now() - t0 > (l / 45) * 1000 * 0.5, 'explota al llegar al suelo, no al instante (' + (Date.now() - t0) + ' ms para ' + l.toFixed(1) + ' m)');
        const h = await until(() => V.has('hurt'), 1500) && V.last('hurt');
        ok(h && h.d > 40 && h.d < 127, 'la explosión a 1,5 m hiere al rival con daño en área, menos que un impacto directo (' + (h && h.d) + ')');
        A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [aim(A, t.x, 1, t.z)] }); await sleep(600);
        ok(V.all('proj').length === 1, 'con un cohete en el cargador no se puede disparar otro sin recargar');
        A.close(); V.close(); await sleep(400); } }

    /* --- Arpón: virote con daño directo --- */
    { const d = await withCls(13, 'Virote'); ok(!!d, 'duelo preparado con la ballesta');
      if (d) { const { A, V } = d; A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [aim(A, V.pos.x, 1.0, V.pos.z)] });
        const h = await until(() => V.has('hurt'), 3000) && V.last('hurt');
        ok(h && h.d === 90, 'el virote da de lleno en el cuerpo: 90 de daño (' + (h && h.d) + ')');
        ok(!V.has('boom'), 'y no explota');
        A.close(); V.close(); await sleep(400); } }

    /* --- Tríada: 3 balas seguidas, la 4.ª pegada se rechaza, tras la pausa vuelve a disparar --- */
    { const d = await withCls(11, 'Rafaga'); ok(!!d, 'duelo preparado con el fusil de ráfaga');
      if (d) { const { A, V } = d, sh = () => A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [aim(A, V.pos.x, 1.0, V.pos.z)] });
        const hits = () => A.all('hit').length;
        for (let i = 0; i < 3; i++) { sh(); await sleep(75); }
        await until(() => hits() >= 3, 1500); ok(hits() === 3, 'una ráfaga: las 3 balas cuentan (' + hits() + ' impactos)');
        sh(); await sleep(250); ok(hits() === 3, 'una 4.ª bala sin esperar la pausa entre ráfagas se rechaza');
        await sleep(300); sh(); ok(await until(() => hits() === 4, 1500), 'tras la pausa, la siguiente ráfaga dispara');
        ok(A.has('kill', m => m.k === A.id && m.w === 'Tríada'), 'cuatro balas de 28 eliminan (la baja lleva el nombre del arma)');
        A.close(); V.close(); } }
  } catch (e) { ok(false, 'error: ' + e.stack); }
  finally { srv.kill(); }
  if (/Error|TypeError/.test(out)) { ok(false, 'errores en el servidor:\n' + out.slice(-800)); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
