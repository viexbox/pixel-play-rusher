'use strict';
/* [SALAS PRIVADAS] Crear una sala privada (código de 6 caracteres), entrar con el código, que el emparejamiento normal no meta a nadie en ella,
   sin bots aunque el servidor rellene con bots, error con un código que no existe, y que el enlace ?sala=N no sirva para colarse. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const PORT = 3794, D = '/tmp/ppr_private', B = 'http://127.0.0.1:' + PORT;
let n = 0;
function join(hello) {
  return new Promise(res => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': '10.8.1.' + (++n) } }), c = { ws, msgs: [] };
    ws.on('open', () => ws.send(JSON.stringify(Object.assign({ t: 'hello', v: 1, n: 'Jug' + n, map: 0, c: 0, mode: 'duelo' }, hello))));
    ws.on('message', d => { const m = JSON.parse(d); c.msgs.push(m); if (m.t === 'welcome') { c.w = m; res(c); } if (m.t === 'err') { c.err = m.m; res(c); } });
    ws.on('close', () => res(c)); ws.on('error', () => {});
  });
}
(async () => {
  fs.rmSync(D, { recursive: true, force: true });
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: D, WALL_CHECK: '0', REQUIRE_TERMS: '0', FILL_BOTS: '4' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
  try {
    let up = false; for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(B + '/healthz')).ok; } catch (e) { await sleep(100); } }
    ok(up, 'el servidor arranca');
    const A = await join({ pv: 1, map: 2, mode: 'zona' });
    ok(A.w && /^[A-HJ-NP-Z2-9]{6}$/.test(A.w.pc) && A.w.map === 2 && A.w.mode === 'zona', 'pv = 1 crea una sala privada con el mapa y el modo elegidos y devuelve su código (' + (A.w && A.w.pc) + ')');
    const code = A.w && A.w.pc;
    const Bp = await join({ map: 2, mode: 'zona' });
    ok(Bp.w && Bp.w.room !== A.w.room && !Bp.w.pc, 'un jugador normal del mismo mapa y modo NO entra en la sala privada (va a otra sala pública)');
    const C = await join({ pc: code.toLowerCase(), map: 0, mode: 'duelo' });
    ok(C.w && C.w.room === A.w.room && C.w.pc === code && C.w.map === 2 && C.w.mode === 'zona', 'con el código (aunque sea en minúsculas) se entra en la misma sala, con su mapa y su modo');
    const X = await join({ pc: 'ZZZZ22' });
    ok(!X.w && /código ZZZZ22/.test(X.err || ''), 'un código que no existe da un error claro (' + X.err + ')');
    const J = await join({ jr: A.w.room, map: 2, mode: 'zona' });
    ok(J.w && J.w.room !== A.w.room, 'el enlace de invitación a una sala (?sala=N) no sirve para colarse en una privada');
    await sleep(2500);
    const st = await (await fetch(B + '/api/status')).json(), pr = st.rooms.find(r => r.id === A.w.room), pub = st.rooms.find(r => r.id === Bp.w.room);
    ok(pr && pr.pv === 1 && pr.players === 2, 'en la sala privada no hay bots de relleno: solo los 2 amigos (' + (pr && pr.players) + ')');
    ok(pub && !pub.pv && pub.players > 2, 'en las públicas sí se rellena con bots (' + (pub && pub.players) + ' jugadores)');
    const R = await join({ pv: 1, rk: 1 });
    ok(!R.w && R.err, 'una sala privada no puede ser clasificatoria');
    for (const c of [A, Bp, C, J]) c.ws.close(); await sleep(400);
    const st2 = await (await fetch(B + '/api/status')).json(); ok(!st2.rooms.some(r => r.id === A.w.room), 'al irse todos, la sala privada desaparece');
    const K = await join({ pc: code }); ok(!K.w && /código/.test(K.err || ''), 'y su código deja de servir');
    const cli = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
    ok(/function openPrivate\(\)/.test(cli) && /data-pt="priv"/.test(cli) && /get\('codigo'\)/.test(cli) && /pv: pvo\.c \? 1 : undefined, pc: pvo\.k \|\| undefined/.test(cli) && /id="pvChip"/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8')), 'cliente: botón «Sala privada», enlace ?codigo=, código en la partida y hello con pv/pc');
  } catch (e) { ok(false, 'error: ' + e.stack); }
  finally { srv.kill(); }
  if (/TypeError|ReferenceError/.test(out)) ok(false, 'errores en el servidor:\n' + out.slice(-800));
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
