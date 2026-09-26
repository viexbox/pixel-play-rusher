'use strict';
/* [GRUPOS] Grupos para jugar con amigos, contra el servidor real: invitar solo a amigos, aceptar/rechazar, ver el grupo (con el tic
   de los verificados), solo el jefe empieza, y al empezar todo el grupo entra en la MISMA sala y el MISMO equipo. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const APASS = 'Party-Admin-2026xy', PORT = 3939, B = 'http://127.0.0.1:' + PORT;
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
let ipn = 20; const ip = () => '10.12.1.' + (ipn++);
const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
const lobbyConn = (tk, name) => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': ip() } }); const c = { ws, msgs: [], name };
  ws.on('message', d => c.msgs.push(JSON.parse(d))); ws.on('open', () => { ws.send(JSON.stringify({ t: 'lobby', n: name, acct: tk })); res(c); }); c.send = m => ws.send(JSON.stringify(m)); c.last = t => [...c.msgs].reverse().find(m => m.t === t); });
const gameConn = (tk, name, pt, extra) => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': ip() } }); const c = { ws, msgs: [] };
  ws.on('message', d => c.msgs.push(JSON.parse(d))); ws.on('open', () => { ws.send(JSON.stringify(Object.assign({ t: 'hello', v: 1, n: name, map: 0, c: 0, acct: tk, pt, mode: 'duelo' }, extra || {}))); res(c); }); });

(async () => {
  const dir = fs.mkdtempSync('/tmp/ppr-party-');
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: dir, ADMIN_PASSWORD: APASS, REQUIRE_TERMS: '0', FILL_BOTS: '0', DATABASE_URL: '', PARTY_GRACE_MS: '6000' }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } });
  await sleep(1400);
  try {
    const reg = async (u) => (await call('POST', '/api/auth/register', { username: u, email: u.toLowerCase() + '@e.com', password: 'Clave-Segura-77', terms: true })).j.token;
    const [TA, TB, TC, TD] = [await reg('Ana_G'), await reg('Beto_G'), await reg('Carla_G'), await reg('Dani_G')];
    const LA = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
    await call('POST', '/api/admin/verified/set', { username: 'Carla_G', verified: true }, LA);
    for (const [a, b, tb] of [[TA, 'Beto_G', TB], [TA, 'Carla_G', TC]]) { await call('POST', '/api/social/request', { name: b }, a); await call('POST', '/api/social/accept', { name: a === TA ? 'Ana_G' : '' }, tb); }
    const A = await lobbyConn(TA, 'Ana_G'), Bt = await lobbyConn(TB, 'Beto_G'), C = await lobbyConn(TC, 'Carla_G'), D = await lobbyConn(TD, 'Dani_G');
    await until(() => [A, Bt, C, D].every(x => x.msgs.some(m => m.t === 'lobbyok')));

    console.log('=== Invitar ===');
    A.send({ t: 'pinv', u: 'Dani_G' }); ok(await until(() => A.msgs.some(m => m.t === 'pnote' && /amigos/.test(m.m))) && !D.msgs.some(m => m.t === 'pinvite'), 'no se puede invitar a quien no es tu amigo');
    const G = await lobbyConn('', 'Invitado1'); await until(() => G.msgs.some(m => m.t === 'lobbyok')); G.send({ t: 'pinv', u: 'Ana_G' });
    ok(await until(() => G.msgs.some(m => m.t === 'pnote' && /cuenta online/.test(m.m))), 'un invitado sin cuenta no puede usar los grupos');
    A.send({ t: 'pinv', u: 'Beto_G' });
    ok(await until(() => Bt.msgs.some(m => m.t === 'pinvite' && m.from.u === 'Ana_G')), 'Beto recibe al momento la invitación de Ana');
    const inv = Bt.last('pinvite');
    ok(await until(() => { const p = A.last('party'); return p && p.id && p.lead === 'Ana_G' && p.pending.includes('Beto_G'); }), 'Ana ve su grupo (es la jefa) con la invitación a Beto pendiente');
    Bt.send({ t: 'pacc', id: inv.id });
    ok(await until(() => { const p = Bt.last('party'); return p && p.members.map(x => x.u).join() === 'Ana_G,Beto_G'; }), 'Beto acepta y los dos ven el grupo: Ana y Beto');
    ok(await until(() => A.msgs.some(m => m.t === 'pnote' && /Beto_G se ha unido/.test(m.m))), 'Ana recibe el aviso de que Beto se ha unido');
    A.send({ t: 'pinv', u: 'Carla_G' }); await until(() => C.msgs.some(m => m.t === 'pinvite')); C.send({ t: 'pacc', id: C.last('pinvite').id });
    ok(await until(() => { const p = A.last('party'); return p && p.members.length === 3; }), 'Carla también se une: el grupo es de 3');
    const pv = A.last('party'), carla = pv.members.find(x => x.u === 'Carla_G'), ana = pv.members.find(x => x.u === 'Ana_G');
    ok(carla.rl === 'inf' && !pv.members.find(x => x.u === 'Beto_G').rl, 'en la lista del grupo, Carla (verificada) lleva la marca del tic y el nombre dorado; Beto no');
    ok(ana.lead && !carla.lead, 'Ana aparece como jefa del grupo');
    Bt.send({ t: 'pinv', u: 'Carla_G' }); ok(await until(() => Bt.msgs.some(m => m.t === 'pnote' && /Solo el jefe/.test(m.m))), 'solo la jefa puede invitar');
    Bt.send({ t: 'pready', r: true }); ok(await until(() => { const p = A.last('party'); return p && p.members.find(x => x.u === 'Beto_G').ready; }), 'Beto se marca «Listo» y Ana lo ve');

    console.log('\n=== Jugar juntos ===');
    Bt.send({ t: 'pplay', mode: 'duelo', map: 0 }); ok(await until(() => Bt.msgs.some(m => m.t === 'pnote' && /Solo el jefe/.test(m.m))), 'solo la jefa puede empezar la partida');
    /* dos salas con gente ya jugando, para comprobar que el grupo no se reparte entre ellas */
    const others = []; for (let i = 0; i < 3; i++) others.push(await gameConn('', 'Otro' + i, undefined)); await sleep(500);
    A.send({ t: 'pplay', mode: 'duelo', map: 0 });
    ok(await until(() => [A, Bt, C].every(x => x.msgs.some(m => m.t === 'pgo'))), 'al empezar, los tres reciben el billete para entrar juntos');
    const tok = A.last('pgo').tok;
    const gA = await gameConn(TA, 'Ana_G', tok), gB = await gameConn(TB, 'Beto_G', tok), gC = await gameConn(TC, 'Carla_G', tok);
    ok(await until(() => [gA, gB, gC].every(x => x.msgs.some(m => m.t === 'welcome'))), 'los tres entran a jugar');
    const w = [gA, gB, gC].map(x => x.msgs.find(m => m.t === 'welcome'));
    ok(w[0].room === w[1].room && w[1].room === w[2].room, 'los tres están en la MISMA sala (' + w.map(x => x.room).join(', ') + ')');
    ok(w[0].tm === w[1].tm && w[1].tm === w[2].tm, 'y en el MISMO equipo (' + w.map(x => x.tm).join(', ') + ')');
    for (const x of [gA, gB, gC, ...others]) try { x.ws.close(); } catch (e) { /* nada */ }
    /* como en el juego: al acabar vuelven a la lobby (nueva conexión) y el grupo sigue ahí */
    const A2 = await lobbyConn(TA, 'Ana_G'), B2 = await lobbyConn(TB, 'Beto_G'), C2 = await lobbyConn(TC, 'Carla_G');
    await until(() => [A2, B2, C2].every(x => x.msgs.some(m => m.t === 'lobbyok'))); A2.send({ t: 'pget' });
    ok(await until(() => { const p = A2.last('party'); return p && p.members.length === 3; }), 'al volver a la lobby después de jugar, el grupo sigue igual');

    console.log('\n=== Salir y expulsar ===');
    A2.send({ t: 'pkick', u: 'Carla_G' });
    ok(await until(() => { const p = A2.last('party'); return p && p.members.length === 2 && C2.msgs.some(m => m.t === 'pnote' && /sacado/.test(m.m)); }), 'la jefa expulsa a Carla: el grupo queda en 2 y Carla recibe el aviso');
    /* un grupo de dos, solos en una sala: al empezar la ronda, el equilibrado de equipos no los separa */
    A2.send({ t: 'pplay', mode: 'zona', map: 0 }); await until(() => A2.msgs.some(m => m.t === 'pgo') && B2.msgs.some(m => m.t === 'pgo'));
    const tok2 = A2.last('pgo').tok, hA = await gameConn(TA, 'Ana_G', tok2, { mode: 'zona' }), hB = await gameConn(TB, 'Beto_G', tok2, { mode: 'zona' });
    await until(() => hA.msgs.some(m => m.t === 'welcome') && hB.msgs.some(m => m.t === 'welcome')); await sleep(2500);
    const tmOf = (c, id) => { let tm = c.msgs.find(m => m.t === 'welcome').tm; for (const m of c.msgs) if (m.t === 'team' && m.id === id) tm = m.tm; return tm; };
    const idA = hA.msgs.find(m => m.t === 'welcome').id, idB = hB.msgs.find(m => m.t === 'welcome').id;
    ok(hA.msgs.find(m => m.t === 'welcome').room === hB.msgs.find(m => m.t === 'welcome').room && tmOf(hA, idA) === tmOf(hA, idB) && tmOf(hB, idA) === tmOf(hB, idB), 'un grupo de dos, solos en una sala: tras empezar la ronda siguen en el mismo equipo (el equilibrado no separa al grupo)');
    for (const x of [hA, hB]) try { x.ws.close(); } catch (e) { /* nada */ }
    const A3 = await lobbyConn(TA, 'Ana_G'), B3 = await lobbyConn(TB, 'Beto_G'); await until(() => A3.msgs.some(m => m.t === 'lobbyok') && B3.msgs.some(m => m.t === 'lobbyok'));   // de vuelta en la lobby
    A3.send({ t: 'pleave' });
    ok(await until(() => B3.msgs.some(m => m.t === 'party' && !m.id)), 'Ana se va: con uno solo, el grupo se deshace y Beto lo ve');
    for (const x of [A3, B3]) try { x.ws.close(); } catch (e) { /* nada */ }
    for (const x of [A, Bt, C, D, G, A2, B2, C2]) try { x.ws.close(); } catch (e) { /* nada */ }
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  srv.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
