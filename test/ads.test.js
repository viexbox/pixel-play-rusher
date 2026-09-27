'use strict';
/* [ANUNCIOS] Anuncios con recompensa: apagados por defecto; con ADS_PROVIDER=test (anuncio falso) o h5 + ADS_CLIENT (Google) se activan.
   El premio lo da el servidor con tope diario y espera entre anuncios; con Google la CSP abre sus dominios. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
async function server(port, env) {
  const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: fs.mkdtempSync('/tmp/ppr-ads-'), FILL_BOTS: '0', REQUIRE_TERMS: '0', DATABASE_URL: '', ADS_PROVIDER: '', ADS_CLIENT: '', ADS_SLOT: '' }, env), stdio: 'ignore' }); procs.push(p); await sleep(1300);
  const B = 'http://127.0.0.1:' + port, call = async (m, u, b, tk) => { const r = await fetch(B + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': '10.7.0.' + port % 200 }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, h: r.headers, j: await r.json().catch(() => ({})) }; };
  const tk = (await call('POST', '/api/auth/register', { username: 'Anuncio_' + port % 100, email: 'a' + port + '@e.com', password: 'Clave-Segura-77', terms: true })).j.token;
  return { p, call, tk, B };
}
(async () => {
  try {
    let s = await server(4701, {});
    let st = (await s.call('GET', '/api/status')).j, csp = (await fetch(s.B + '/')).headers.get('content-security-policy');
    ok(st.ads === null && !/googlesyndication/.test(csp), 'sin configurar: no hay anuncios ni se abren dominios de fuera en la CSP');
    ok((await s.call('POST', '/api/me/adreward', {}, s.tk)).status === 404, 'y pedir el premio de un anuncio da 404');
    s.p.kill();

    s = await server(4702, { ADS_PROVIDER: 'test', ADS_PER_DAY: '2' });
    st = (await s.call('GET', '/api/status')).j;
    ok(st.ads && st.ads.provider === 'test' && st.ads.px === 25 && st.ads.perDay === 2, 'modo de prueba: el juego sabe que hay anuncios, 25 PX por anuncio, 2 al día');
    const px0 = (await s.call('GET', '/api/me', null, s.tk)).j.profile.px;
    let r = await s.call('POST', '/api/me/adreward', {}, s.tk);
    ok(r.status === 200 && r.j.px === 25 && r.j.left === 1 && r.j.profile.px === px0 + 25, 'ver un anuncio da +25 PX (quedan 1)');
    r = await s.call('POST', '/api/me/adreward', {}, s.tk); ok(r.status === 429 && /Espera \d+ s/.test(r.j.error), 'hay que esperar entre anuncios (' + r.j.error + ')');
    ok((await s.call('POST', '/api/me/adreward', {})).status === 401, 'sin cuenta no hay premio');
    s.p.kill();

    s = await server(4703, { ADS_PROVIDER: 'test', ADS_PER_DAY: '2', ADS_COOLDOWN_S: '0', ADS_REWARD_PX: '40' });
    await s.call('POST', '/api/me/adreward', {}, s.tk); r = await s.call('POST', '/api/me/adreward', {}, s.tk);
    ok(r.status === 200 && r.j.px === 40 && r.j.left === 0, 'el premio se configura (ADS_REWARD_PX=40)');
    r = await s.call('POST', '/api/me/adreward', {}, s.tk); ok(r.status === 429 && /todos los anuncios/.test(r.j.error), 'con el tope diario gastado no hay más premios');
    s.p.kill();

    s = await server(4704, { ADS_PROVIDER: 'h5', ADS_CLIENT: 'ca-pub-1234567890123456', ADS_SLOT: '9876543210' });
    st = (await s.call('GET', '/api/status')).j; csp = (await fetch(s.B + '/')).headers.get('content-security-policy');
    ok(st.ads && st.ads.provider === 'h5' && st.ads.client === 'ca-pub-1234567890123456' && st.ads.slot === '9876543210', 'con Google: el juego recibe la cuenta y el bloque del banner');
    ok(/script-src 'self' https:\/\/pagead2\.googlesyndication\.com/.test(csp) && /frame-src 'self' https:\/\/pagead2/.test(csp) && /frame-ancestors 'self'/.test(csp), 'y la CSP deja cargar los anuncios de Google (y sigue sin dejar que otros metan el juego en un marco)');
    s.p.kill();
    s = await server(4705, { ADS_PROVIDER: 'h5', ADS_CLIENT: 'no-vale' });
    ok((await s.call('GET', '/api/status')).j.ads === null, 'con Google pero sin una cuenta válida (ca-pub-…), sigue apagado');
    s.p.kill();
    const cl = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
    ok(/type: 'reward'/.test(cl) && /adViewed: \(\) => claimAd\(\)/.test(cl) && (cl.match(/onDeathAds\(\);   \/\/ \[ANUNCIOS\]/g) || []).length === 2, 'el cliente pide un anuncio con recompensa y solo cobra al verlo entero; el botón sale al morir (online y entrenamiento)');
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
