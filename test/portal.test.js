'use strict';
/* [PORTALES] Krunxa en CrazyGames y Poki: el servidor deja incrustar el juego en sus webs, abre la CSP a su SDK solo con ?portal=…,
   acepta conexiones y la API desde sus dominios (y rechaza otros), y da el premio del anuncio del portal con los mismos topes.
   El cliente (jsdom, con un SDK falso) avisa de carga/juego/pausa, pide anuncio entre partidas y con premio, y esconde pagos y
   enlaces externos. build-portal.js genera el paquete para subir. */
const { spawn, execFileSync } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const PORT = 3349, B = 'http://127.0.0.1:' + PORT;
const wsTry = origin => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { Origin: origin } }); ws.on('open', () => { ws.close(); res(true); }); ws.on('error', () => res(false)); ws.on('unexpected-response', () => res(false)); });

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: fs.mkdtempSync('/tmp/ppr-portal-'), FILL_BOTS: '0', REQUIRE_TERMS: '0', DATABASE_URL: '', ADS_PROVIDER: '', ADS_PER_DAY: '3', ADS_COOLDOWN_S: '0' }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } });
  try {
    await sleep(1500); for (let k = 0; k < 40; k++) { try { if ((await fetch(B + '/healthz')).ok) break; } catch (e) { await sleep(150); } }
    const call = async (m, u, b, tk, origin) => { const r = await fetch(B + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': '10.8.1.1' }, tk ? { Authorization: 'Bearer ' + tk } : {}, origin ? { Origin: origin } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, h: r.headers, j: await r.json().catch(() => ({})) }; };
    console.log('=== Servidor ===');
    const csp = (await fetch(B + '/')).headers.get('content-security-policy'), cspP = (await fetch(B + '/?portal=crazygames')).headers.get('content-security-policy');
    ok(/frame-ancestors 'self' https:\/\/\*\.crazygames\.com https:\/\/crazygames\.com https:\/\/\*\.poki\.com/.test(csp) && /poki-gdn\.com/.test(csp), 'el juego se puede incrustar en CrazyGames y Poki (frame-ancestors), y en ninguna otra web');
    ok(/script-src 'self';/.test(csp) && !/sdk\.crazygames/.test(csp), 'sin ?portal= la CSP sigue igual de cerrada');
    ok(/script-src 'self' https:/.test(cspP) && /connect-src 'self' ws: wss: https:/.test(cspP) && /frame-src 'self' https:/.test(cspP) && !/unsafe-inline'[^;]*script|script-src[^;]*unsafe-inline/.test(cspP), 'con ?portal=crazygames se abre para su SDK y sus anuncios (sin permitir scripts en línea)');
    ok(await wsTry('https://abc123.poki-gdn.com') && await wsTry('https://games.crazygames.com'), 'el juego subido a Poki o incrustado en CrazyGames puede conectarse al servidor (WebSocket)');
    ok(!(await wsTry('https://otra-web.com')) && !(await wsTry('https://evil-crazygames.com')), 'pero desde otras webs (o que imitan el nombre) no');
    const st = await call('GET', '/api/status', null, null, 'https://abc123.poki-gdn.com');
    ok(st.h.get('access-control-allow-origin') === 'https://abc123.poki-gdn.com' && st.j.portalAds && st.j.portalAds.px === 25 && st.j.portalAds.perDay === 3 && st.j.ads === null, 'la API responde a Poki (CORS) y avisa de los anuncios del portal aunque los propios estén apagados');
    const reg = await call('POST', '/api/auth/register', { username: 'PortalUno', email: 'p1@e.com', password: 'Clave-Segura-77', terms: true }, null, 'https://abc123.poki-gdn.com');
    ok(reg.status === 200 && reg.h.get('access-control-allow-origin') === 'https://abc123.poki-gdn.com', 'también la API de cuentas (registro desde el dominio de Poki)');
    const tk = reg.j.token, px0 = (await call('GET', '/api/me', null, tk)).j.profile.px;
    ok((await call('POST', '/api/me/adreward', {}, tk)).status === 404, 'sin portal y sin anuncios propios, pedir premio da 404');
    let r = await call('POST', '/api/me/adreward', { portal: 'crazygames' }, tk);
    ok(r.status === 200 && r.j.px === 25 && r.j.profile.px === px0 + 25, 'el anuncio con premio del portal da +25 PX');
    await call('POST', '/api/me/adreward', { portal: 'poki' }, tk); await call('POST', '/api/me/adreward', { portal: 'poki' }, tk); r = await call('POST', '/api/me/adreward', { portal: 'poki' }, tk);
    ok(r.status === 429, 'con el mismo tope diario (3 en la prueba): el cuarto se rechaza');
    ok((await call('POST', '/api/me/adreward', { portal: 'otro' }, tk)).status !== 200, 'un portal desconocido no cuenta');
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  srv.kill();

  console.log('\n=== Cliente con CrazyGames (SDK falso) ===');
  {
    const PUB = path.join(__dirname, '..', 'public');
    const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
    const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://krunxa.test/?portal=crazygames' }).window;
    w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} }); const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
    w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
    const posts = []; w.fetch = async (u, o) => { u = String(u); if (/adreward/.test(u)) { posts.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ ok: true, px: 25, left: 9, profile: { px: 125, username: 'X' } }) }; } throw new Error('sin servidor'); };
    const log = []; let adKind = null;
    w.eval(fs.readFileSync(path.join(PUB, 'portal.js'), 'utf8'));
    const sdkTag = [...w.document.querySelectorAll('script')].find(s => /crazygames-sdk-v3/.test(s.src));
    ok(!!sdkTag && w.document.documentElement.classList.contains('portal') && w.PPR_PORTAL.name === 'crazygames', 'con ?portal=crazygames se carga el SDK v3 de CrazyGames y la página se marca como «portal»');
    w.CrazyGames = { SDK: { init: async () => { log.push('init'); }, game: { loadingStart: () => log.push('loadingStart'), loadingStop: () => log.push('loadingStop'), gameplayStart: () => log.push('gameplayStart'), gameplayStop: () => log.push('gameplayStop'), happytime: () => log.push('happy') },
      ad: { requestAd: (kind, cb) => { adKind = kind; log.push('ad:' + kind); cb.adStarted(); setTimeout(() => cb.adFinished(), 30); } } } };
    sdkTag.onload(); await sleep(50);
    w.eval(fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8')); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
    w.eval(fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'));
    const c = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'), i = c.lastIndexOf('})();'), errors = []; w.addEventListener('error', e => errors.push(e.message));
    w.eval(c.slice(0, i) + 'window.__T = { get state() { return state; }, endMatch, initAds, watchAd, pauseGame, renderStore, set remote(v) { remote = v; }, get ads() { return ADS; } };\n' + c.slice(i));
    const T = w.__T, $ = s => w.document.querySelector(s);
    ok(await until(() => log.includes('init') && log.includes('loadingStart') && log.includes('loadingStop')), 'avisa al portal: init → loadingStart → loadingStop cuando el juego ha cargado (' + log.join(', ') + ')');
    $('#play').click(); $('#eqPlay').click();
    ok(await until(() => T.state === 'playing' && log.includes('gameplayStart')), 'al empezar a jugar: gameplayStart');
    T.pauseGame(); ok(await until(() => log.lastIndexOf('gameplayStop') > log.lastIndexOf('gameplayStart')), 'en la pausa: gameplayStop (el portal puede enseñar anuncios fuera del combate)');
    $('#resume') && $('#resume').click(); await sleep(200);
    T.endMatch(); ok(await until(() => adKind === 'midgame'), 'al terminar la partida se pide el anuncio entre partidas («midgame»)');
    ok(await until(() => !w.PPR_PORTAL.adBusy), 'y el portal lo da por terminado (nunca dos anuncios a la vez)');
    T.initAds(null, { px: 25, perDay: 10 }); T.remote = { px: 100, username: 'X' };
    ok(T.ads && T.ads.provider === 'portal', 'los anuncios con premio pasan a ser los del portal');
    adKind = null; T.watchAd(); ok(await until(() => adKind === 'rewarded' && posts.length === 1), 'el botón de anuncio con premio pide un «rewarded» al portal y, al verlo entero, cobra el premio');
    ok(posts[0] && posts[0].portal === 'crazygames', 'el servidor recibe de qué portal viene el anuncio');
    T.renderStore(); await sleep(50); ok(/se consiguen jugando/.test($('#storeBox').textContent) && !$('#storeBox button'), 'la tienda de PX no ofrece pagos con dinero dentro del portal');
    const css = [...w.document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    ok(/html\.portal #discordBtn,html\.portal \[data-tab="store"\],html\.portal \.pt-ref\{display:none!important\}/.test(css), 'y se esconden el enlace a Discord, la pestaña Tienda y las invitaciones (enlaces externos)');
    ok(errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(errors.slice(0, 2)));
    w.close();
  }

  console.log('\n=== Sin portal no cambia nada ===');
  {
    const w = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'outside-only', url: 'https://krunxa.test/' }).window;
    w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'portal.js'), 'utf8'));
    ok(!w.PPR_PORTAL && !w.document.querySelector('script[src]') && !w.document.documentElement.classList.contains('portal'), 'sin ?portal= no se carga ningún SDK ni se esconde nada');
  }

  console.log('\n=== Paquete para subir (build-portal.js) ===');
  {
    const root = path.join(__dirname, '..'), out = path.join(root, 'dist', 'poki', 'index.html');
    execFileSync('node', [path.join(root, 'scripts', 'build-portal.js'), 'poki', 'https://krunxa.up.railway.app'], { cwd: root, stdio: 'ignore' });
    const h = fs.readFileSync(out, 'utf8');
    ok(h.includes('window.PPR_PORTAL_NAME = "poki"') && h.includes('window.VOLT_CONFIG.server = "https://krunxa.up.railway.app"') && !/<script src=/.test(h) && h.length > 800000, 'genera dist/poki/index.html: un solo archivo, con Poki activado y el servidor online fijo (' + Math.round(h.length / 1024) + ' KB)');
    let bad = false; try { execFileSync('node', [path.join(root, 'scripts', 'build-portal.js'), 'otro', 'x'], { stdio: 'ignore' }); } catch (e) { bad = true; }
    ok(bad, 'con un portal o una dirección que no valen, avisa y no genera nada');
    fs.rmSync(path.join(root, 'dist', 'poki'), { recursive: true, force: true });
  }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
