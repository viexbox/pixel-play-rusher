'use strict';
/* [PISTOLA] [VIDA POR CLASE] [RACHAS] Lo básico de Krunker: arma secundaria de todas las clases, vida distinta por clase, bajas múltiples y Nuke.
   Pistola: definición, cliente (tecla 2, rueda, ranura del HUD, botón táctil)
   y servidor real: cargador propio, recarga propia, daño, nombre en la baja, la principal no gasta su cargador y sin pistola en la Carrera. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
console.log('=== 1. Definición y cliente ===');
const P = S.SECONDARY, fs2 = require('fs'), path2 = require('path');
ok(P && P.id === 'pistola' && P.mag === 10 && P.dmg === 20 && P.head === 30 && P.interval === 0.15 && P.reload === 0.7, 'S.SECONDARY es la pistola: 20 de daño (30 a la cabeza), 10 balas, 0,15 s entre disparos, 0,7 s de recarga');
ok(!S.WEAPONS.includes(P) && S.WEAPONS.every(w => w.id !== 'pistola') && S.SHOP.every(i => S.WEAPONS[i.wi] && S.WEAPONS[i.wi].id !== 'pistola'), 'no es una clase: no está en WEAPONS ni en la tienda');
const cli = fs2.readFileSync(path2.join(__dirname, '..', 'public', 'client.js'), 'utf8'), html = fs2.readFileSync(path2.join(__dirname, '..', 'public', 'index.html'), 'utf8');
ok(/e\.code === 'Digit2'\) setSlot\(secOK\(\) \? 2 : 1\)/.test(cli) && /e\.code === 'Digit3'\) setSlot\(1\)/.test(cli), 'teclas: 2 saca la pistola y 3 (o Q) el cuchillo');
ok(/setSlot\(secOK\(\) \? \(slot === 0 \? 2 : 0\)/.test(cli), 'la rueda alterna principal y pistola');
ok(/t: 'shoot'[^\n]*s: p\.sec \? 1 : undefined/.test(cli) && /t: 'reload', s: p\.sec \? 1 : undefined/.test(cli), 'el cliente marca con s = 1 los disparos y la recarga de la pistola');
ok(/id="slot2"><kbd>2<\/kbd>/.test(html) && /id="slot1"><kbd>3<\/kbd>/.test(html) && /B\('tSec', 'PISTOLA'\)/.test(cli), 'HUD con la ranura de la pistola (2) y el cuchillo en la 3; botón PISTOLA en el móvil');

console.log('\n=== 2. En el servidor real ===');
const PORT = 3793, D = '/tmp/ppr_pistola', B = 'http://127.0.0.1:' + PORT;
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
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: D, WALL_CHECK: '0', REQUIRE_TERMS: '0', FILL_BOTS: '0', NUKE_KILLS: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
  try {
    let up = false; for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(B + '/healthz')).ok; } catch (e) { await sleep(100); } }
    ok(up, 'el servidor arranca');
    const d = await duel(0, 'Pisto'); ok(!!d, 'duelo preparado (clase Asalto)');
    if (d) {
      const { A, V } = d, sky = [0, 1, 0], shotsS = () => V.all('shot').filter(m => m.id === A.id && m.s === 1).length, shotsP = () => V.all('shot').filter(m => m.id === A.id && !m.s).length;
      for (let i = 0; i < 12; i++) { A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [sky], s: 1 }); await sleep(170); }
      await sleep(300); ok(shotsS() === 10, 'la pistola dispara 10 balas y luego se queda sin cargador (' + shotsS() + ' de 12)');
      A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [sky] }); await sleep(300);
      ok(shotsP() === 1, 'la principal sigue con su cargador lleno: dispara aunque la pistola esté vacía');
      A.send({ t: 'reload', s: 1 }); await sleep(750);
      A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [sky], s: 1 }); await sleep(300);
      ok(shotsS() === 11, 'tras recargar la pistola (0,7 s) vuelve a disparar');
      const fast = shotsS(); A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [sky], s: 1 }); A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [sky], s: 1 }); await sleep(300);
      ok(shotsS() === fast + 1, 'dos disparos pegados: el segundo se rechaza por la cadencia (0,15 s)');
      await sleep(200); A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [aim(A, V.pos.x, 1.0, V.pos.z)], s: 1 });
      const h = await until(() => V.has('hurt'), 1500) && V.last('hurt');
      ok(h && h.d === 20, 'un disparo al cuerpo quita 20 (' + (h && h.d) + ')');
      for (let i = 0; i < 6 && !A.has('kill', m => m.k === A.id); i++) { await sleep(180); A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [aim(A, V.pos.x, 1.0, V.pos.z)], s: 1 }); }
      ok(await until(() => A.has('kill', m => m.k === A.id && m.w === 'Pistola'), 1500), 'cinco disparos al cuerpo eliminan y la baja lleva el nombre «Pistola»');
      const mc = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8'); ok(/case 'nuke': return nukeFx/.test(mc) && /streakFx\(m\.streak, m\.mk/.test(mc) && /id="announce"/.test(html), 'el cliente enseña los avisos de racha y la Nuke');
      A.close(); V.close(); await sleep(400);
    }
    /* [RACHAS] con NUKE_KILLS=1 la primera baja lanza la Nuke: caen todos los rivales vivos, aunque estén lejos, y las bajas llevan «Nuke» */
    { const d = await duel(0, 'Nuk'); ok(!!d, 'duelo preparado para la Nuke');
      if (d) { const { A, V } = d, X = new Bot('NukX'), Y = new Bot('NukY'); await X.connect(); await Y.connect(); await until(() => X.pos && Y.pos, 4000);
        const foe = [X, Y].find(b => b.welcome.tm !== A.welcome.tm); await sleep(300);
        for (let i = 0; i < 8 && !A.has('nuke'); i++) { A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [aim(A, V.pos.x, 1.0, V.pos.z)], s: 1 }); await sleep(180); }
        ok(await until(() => A.has('nuke', m => m.id === A.id) && V.has('nuke'), 2000), 'al llegar a la racha de la Nuke todos reciben el aviso «nuke»');
        ok(!!foe && await until(() => A.has('kill', m => m.k === A.id && m.v === foe.id && m.w === 'Nuke'), 1500), 'el otro rival (lejos, sin verlo) cae por la Nuke');
        ok(!A.has('kill', m => m.w === 'Nuke' && [X, Y].some(b => b !== foe && b.id === m.v)), 'el compañero de equipo no cae');
        const k1 = A.all('kill').find(m => m.k === A.id && m.v === V.id); ok(k1 && k1.mk === 1 && k1.streak === 1, 'la baja lleva la racha y el contador de bajas múltiples (mk)');
        A.close(); V.close(); X.close(); Y.close(); await sleep(400); } }
    /* [VIDA POR CLASE] la vida al aparecer depende de la clase: Torrente 170, Lince 60, Asalto 100 */
    { const mk = (n, c) => { const b = new Bot(n); b.connect = function () { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': '10.9.6.' + (++Bot.n) } }); this.ws.on('open', () => this.send({ t: 'hello', v: 1, n: this.name, map: 0, c }));
        this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); this.on(m); if (m.t === 'welcome') { this.id = m.id; this.welcome = m; res(m); } }); this.ws.on('error', () => {}); }); }; return b; };
      const T = mk('Tanque', 2), L = mk('Hunter', 3), As = mk('Soldado', 0); await T.connect(); await L.connect(); await As.connect(); await until(() => T.pos && L.pos && As.pos, 4000);
      const hpOf = b => { const m = b.msgs.find(x => x.t === 'spawn' && x.id === b.id); return m && m.hp; };
      ok(hpOf(T) === 170 && hpOf(L) === 60 && hpOf(As) === 100, 'vida al aparecer según la clase: Torrente ' + hpOf(T) + ', Lince ' + hpOf(L) + ', Asalto ' + hpOf(As));
      ok(S.maxHp(2) === 170 && S.maxHp(3) === 60 && S.maxHp(12) === 130 && S.maxHp(6) === 90 && S.maxHp(0) === 100, 'S.maxHp: 170 ametralladora, 60 francotirador, 130 lanzacohetes, 90 semiautomático, 100 el resto');
      T.close(); L.close(); As.close(); await sleep(300); }
    /* en la Carrera de armas no hay pistola: el arma la da el nivel */
    { const mk = (n) => { const b = new Bot(n); b.connect = function () { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': '10.9.7.' + (++Bot.n) } }); this.ws.on('open', () => this.send({ t: 'hello', v: 1, n: this.name, map: 0, c: 0, mode: 'carrera' }));
        this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); this.on(m); if (m.t === 'welcome') { this.id = m.id; this.welcome = m; res(m); } }); this.ws.on('error', () => {}); }); }; return b; };
      const A = mk('CarA'), V = mk('CarV'); await A.connect(); await V.connect(); await until(() => A.pos && V.pos, 4000); await sleep(1800);
      A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [[0, 1, 0]], s: 1 }); await sleep(250); A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [[0, 1, 0]] }); await sleep(400);
      ok(!V.has('shot', m => m.id === A.id && m.s === 1) && V.has('shot', m => m.id === A.id && !m.s), 'en la Carrera la pistola no dispara (el arma del nivel, sí)');
      A.close(); V.close(); }
  } catch (e) { ok(false, 'error: ' + e.stack); }
  finally { srv.kill(); }
  if (/Error|TypeError/.test(out)) { ok(false, 'errores en el servidor:\n' + out.slice(-800)); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
