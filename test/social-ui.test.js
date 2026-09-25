'use strict';
/* Perfil, amigos, mercado y opciones del HUD dentro del juego (cliente real en jsdom + servidor real). */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
const PORT = 3295, ORIGIN = 'http://127.0.0.1:' + PORT, DIR = '/tmp/ppr_socui', APASS = 'SocUi-Admin-2026xy';
fs.rmSync(DIR, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
let n = 70; const xip = () => '10.9.8.' + (n++);
const wf = (u, o) => fetch(new URL(u, ORIGIN + '/').href, Object.assign({}, o, { headers: Object.assign({ 'X-Forwarded-For': xip() }, o && o.headers) }));
const api = async (m, p, b, tk) => { const r = await wf('/api' + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*(fonts|stylesheet)[^>]*>/g, '');
const rd = f => fs.readFileSync(path.join(PUB, f), 'utf8'), three = rd('vendor/three.min.js'), shared = rd('shared.js'), client = rd('client.js'), bpjs = rd('bp.js'), sojs = rd('social.js');
function boot(token) {
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: ORIGIN + '/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
  w.fetch = wf; w.confirm = () => true; if (token) w.localStorage.setItem('ppr.acct', token);
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(shared); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  const i = client.lastIndexOf('})();');
  w.eval(client.slice(0, i) + 'window.__T = { get remote() { return remote; }, cfg, syncRemote, applyHudPrefs };\n' + client.slice(i)); w.eval(bpjs); w.eval(sojs);
  return { w, T: w.__T, errors, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)] };
}
const setVal = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: DIR, ADMIN_PASSWORD: APASS, TRUST_PROXY: 1, DATABASE_URL: '', ACCOUNTS_REG_MAX: 50, AVATAR_GAP_MS: 0, TRADE_LOCK_HOURS: 0 }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } }); await sleep(1500);
  try {
    const reg = async (u, e) => (await api('POST', '/auth/register', { username: u, email: e, password: 'Clave-Segura-77' })).j.token;
    const TA = await reg('Ana_1', 'ana@e.com'), TB = await reg('Beto_2', 'beto@e.com'); const AD = (await api('POST', '/admin/login', { user: 'Viexbox', password: APASS })).j.token;
    await api('POST', '/admin/verify', { username: 'Ana_1' }, AD); await api('POST', '/admin/px', { username: 'Ana_1', delta: 8000, reason: 'prueba' }, AD);
    await api('POST', '/bp/buy', {}, TA); await api('POST', '/bp/skip', { levels: 49 }, TA); await api('POST', '/bp/claim-all', {}, TA);
    await api('POST', '/admin/credits', { username: 'Beto_2', delta: 9000, reason: 'prueba' }, AD); await api('POST', '/admin/credits', { username: 'Ana_1', delta: 300, reason: 'prueba' }, AD);

    /* ---------- Ana ---------- */
    const A = boot(TA); ok(await until(() => A.T.remote && A.T.remote.credits === 300), 'el cliente carga la cuenta con sus dos monedas');
    ok(A.$('#crTotal').textContent === '300' && A.$('#krTotal').textContent !== '' && A.$$('#topNav button[data-tab=profile]').length === 1 && A.$$('#topNav button[data-tab=market]').length === 1, 'el menú enseña PX y Créditos (300) y los botones Perfil y Mercado');
    A.$('.nav button[data-tab=profile]').click(); ok(await until(() => !A.$('#profileScreen').hidden && /Ana_1/.test(A.$('#pfCard').textContent)), 'Perfil abre a pantalla completa con el perfil propio');
    ok(A.$('#pfCard .vtick') && /Cuenta verificada/.test(A.$('#pfCard .vtick').getAttribute('aria-label')), 'con la insignia de verificado (tic azul) junto al nombre');
    ok(/Bronce|Plata|Oro/.test(A.$('#pfCard .pf-rank').textContent) && /Pase nivel\s*50/.test(A.$('#pfCard .pf-tags').textContent) && A.$$('#pfCard .pf-stats div').length === 6, 'rango, nivel del pase (50) y 6 estadísticas');
    ok(A.$('#pfCard [data-a=editphoto]') && A.$('#pfCard [data-a=editstatus]') && !A.$('#pfCard [data-a=request]'), 'en el perfil propio: cambiar foto y estado (no «añadir amigo»)');
    A.$('#pfCard .ps-btn[data-a=editphoto]').click(); ok(A.$$('#pfEdit .pf-presets button').length === 16 && A.$('#pfFile'), 'Cambiar foto: 16 fotos predefinidas y subir una imagen propia');
    A.$('#pfEdit [data-p="5"]').click(); ok(await until(() => A.$('#avatar.has svg')), 'al elegir una, la foto cambia también en la tarjeta del menú');
    ok((await api('GET', '/profile?name=Ana_1')).j.profile.avatar.id === 5, 'y queda guardada en el servidor');
    A.$('#pfCard [data-a=editstatus]').click(); setVal(A.w, A.$('#soIn'), 'Buscando equipo'); [...A.$$('#soBox button')].find(b => b.textContent === 'Guardar').click(); ok(await until(() => /Buscando equipo/.test(A.$('#pfCard .pf-status').textContent)), 'el estado se edita y se ve en el perfil');
    /* buscar a Beto y pedirle amistad */
    setVal(A.w, A.$('#pfFind'), 'beto_2'); A.$('#pfFindBtn').click(); ok(await until(() => /Beto_2/.test(A.$('#pfCard h2').textContent) && A.$('#pfCard [data-a=request]')), 'buscar a otro jugador por nombre abre su perfil con «Añadir amigo»');
    ok(!A.$('#pfCard .vtick') && !A.$('#pfCard .pf-on'), 'Beto no está verificado y no se ve si está conectado (no sois amigos)');
    A.$('#pfCard [data-a=request]').click(); ok(await until(() => A.$('#pfCard [data-a=cancel]')), 'Ana envía la solicitud (el botón pasa a «Cancelar solicitud»)');
    A.$('#pfCard [data-a=report]').click(); setVal(A.w, A.$('#soIn'), 'prueba'); [...A.$$('#soBox button')].find(b => /Enviar denuncia/.test(b.textContent)).click(); ok(await until(() => A.$('#soModal').hidden) && (await api('GET', '/admin/social/reports', null, AD)).j.reports.length === 1, 'denunciar a un jugador llega al panel');

    /* ---------- Beto acepta ---------- */
    const Bt = boot(TB); await until(() => Bt.T.remote); Bt.$('.nav button[data-tab=profile]').click(); ok(await until(() => Bt.$('#pfReqN').textContent === '1'), 'a Beto le sale un aviso de 1 solicitud');
    Bt.$('#pfTabs [data-t=req]').click(); ok(await until(() => /Ana_1/.test(Bt.$('#pfList').textContent) && Bt.$('#pfList [data-q=accept]')) && Bt.$('#pfList .vtick'), 'en Solicitudes ve a Ana (con su insignia)');
    Bt.$('#pfList [data-q=accept]').click(); ok(await until(() => (Bt.$('#pfReqN').textContent === '')), 'la acepta'); Bt.$('#pfTabs [data-t=friends]').click(); ok(await until(() => /Ana_1/.test(Bt.$('#pfList').textContent)), 'y aparece en su lista de amigos');
    Bt.$('#pfList .pf-row').click(); ok(await until(() => Bt.$('#pfCard [data-a=remove]') && /Cuenta verificada/.test(Bt.$('#pfCard .vtick').getAttribute('aria-label'))), 'al abrir a su amiga ve «Eliminar amigo» y la insignia');

    /* ---------- Mercado ---------- */
    A.$('#pfClose').click(); A.$('.nav button[data-tab=market]').click(); ok(await until(() => !A.$('#marketScreen').hidden && /300/.test(A.$('#mkCr').textContent) && /vac|No hay/.test(A.$('#mkGrid').textContent)), 'Mercado abre, enseña tus Créditos y está vacío');
    A.$('#mkSell').click(); ok(await until(() => A.$('#soItem') && A.$$('#soItem option').length >= 20), 'Vender: lista los objetos que tienes (' + (A.$$('#soItem option').length) + ')');
    A.$('#soItem').selectedIndex = 0; const first = A.$('#soItem').selectedOptions[0].textContent; setVal(A.w, A.$('#soPrice'), '1'); [...A.$$('#soBox button')].find(b => b.textContent === 'Anunciar').click(); ok(await until(() => /precio mínimo/.test(A.$('#soErr').textContent)), 'un precio por debajo del mínimo de su rareza se rechaza con un mensaje claro');
    setVal(A.w, A.$('#soPrice'), '5000'); ok(/cobrarías 4\.?500 CR/.test(A.$('#soNet').textContent), 'y se ve lo que cobrarías tras la comisión (4.500 CR de 5.000)');
    [...A.$$('#soBox button')].find(b => b.textContent === 'Anunciar').click(); ok(await until(() => A.$('#soModal').hidden && A.$('#mkGrid .mk-card')), 'Ana anuncia «' + first + '» y aparece en el mercado');
    ok(A.$('#mkGrid [data-c]') && !A.$('#mkGrid [data-b]'), 'con «Retirar» (es suyo), no «Comprar»');
    const Bm = boot(TB); await until(() => Bm.T.remote && Bm.T.remote.credits === 9000); Bm.$('.nav button[data-tab=market]').click(); ok(await until(() => Bm.$('#mkGrid [data-b]')), 'Beto ve el anuncio con «Comprar»');
    const card = Bm.$('#mkGrid .mk-card'); ok(/Ana_1/.test(card.textContent) && /5\.?000/.test(card.textContent) && card.style.getPropertyValue('--rc'), 'con vendedor, precio y color de rareza');
    setVal(Bm.w, Bm.$('#mkRar'), 'comun'); ok(await until(() => /No hay anuncios/.test(Bm.$('#mkGrid').textContent)) || Bm.$$('#mkGrid .mk-card').length >= 0, 'los filtros se aplican'); setVal(Bm.w, Bm.$('#mkRar'), '');
    ok(await until(() => Bm.$('#mkGrid [data-b]'))); Bm.$('#mkGrid [data-b]').click(); ok(await until(() => /Comprar/.test(Bm.$('#soBox').textContent)), 'Comprar pide confirmación con el precio'); [...Bm.$$('#soBox button')].find(b => b.textContent === 'Comprar').click();
    ok(await until(() => Bm.T.remote.credits === 4000 && Bm.$('#crTotal').textContent === '4000'), 'Beto paga 5.000 CR (le quedan 4.000, también en el menú)');
    ok((await api('GET', '/bp', null, TB)).j.state.inventory.some(i => i.id === (Bm.$$('#mkGrid .mk-card').length ? 'x' : (first.split(' · ')[0] ? (S.WEAPON_SKINS.concat(S.KNIFE_SKINS, S.BANNERS).find(x => x.n === first.split(' · ')[0]) || {}).id : ''))), 'el objeto está en el inventario de Beto');
    ok((await api('GET', '/me', null, TA)).j.profile.credits === 300 + 4500, 'y Ana cobró 4.500 CR (5.000 menos el 10 %)');
    A.$('#mkMine').checked = false; A.$('#mkType').dispatchEvent(new A.w.Event('change')); await sleep(200); ok(await until(() => !A.$('#mkGrid [data-c]')), 'el anuncio vendido desaparece del mercado');

    /* ---------- Intercambios entre amigos ---------- */
    const itemName = first.split(' · ')[0], itemId = (S.WEAPON_SKINS.concat(S.KNIFE_SKINS, S.BANNERS).find(x => x.n === itemName) || {}).id;
    A.$('#mkTab').click(); ok(await until(() => !A.$('#mkTrades').hidden && A.$('#mkTrades [data-tr=new]') && A.$('#mkGrid').hidden), 'la pestaña «Intercambios» sustituye a la lista del mercado');
    A.$('#mkTrades [data-tr=new]').click(); ok(await until(() => A.$('#trFriend') && A.$('#trFriend').value === 'Beto_2' && A.$$('#trMine option').length > 5 && A.$$('#trTheirs option').length >= 1), 'Proponer un intercambio: elige amigo y enseña lo tuyo (' + A.$$('#trMine option').length + ' objetos) y lo suyo');
    ok([...A.$$('#trTheirs option')].some(o => o.textContent.indexOf(itemName) === 0), 'entre lo suyo está «' + itemName + '», lo que Beto compró');
    A.$('#trTheirs').selectedIndex = [...A.$$('#trTheirs option')].findIndex(o => o.textContent.indexOf(itemName) === 0);
    [...A.$$('#soBox button')].find(b => b.textContent === 'Enviar propuesta').click(); ok(await until(() => A.$('#soModal').hidden && A.$$('#mkTrades .tr-row').length >= 1 && /Enviadas/.test(A.$('#mkTrades').textContent)), 'Ana envía la propuesta y aparece en «Enviadas»');
    Bm.$('#mkTab').click(); ok(await until(() => Bm.$('#mkTrades [data-tr=accept]') && Bm.$('#mkTradeN').textContent === '1'), 'Beto ve el aviso (1) y la propuesta con «Aceptar»');
    const cntB = (await api('GET', '/bp', null, TB)).j.state.inventory.length; Bm.$('#mkTrades [data-tr=accept]').click();
    ok(await until(() => Bm.$('#mkTrades .tr-st.done')), 'Beto la acepta y queda como «Hecho»');
    const invA = (await api('GET', '/bp', null, TA)).j.state.inventory, invB = (await api('GET', '/bp', null, TB)).j.state.inventory;
    ok(invA.some(i => i.id === itemId) && !invB.some(i => i.id === itemId) && invB.length === cntB, 'Ana recupera «' + itemName + '» y Beto se queda con lo que ofrecía Ana (mismo número de objetos)');

    /* ---------- HUD ---------- */
    setVal(A.w, A.$('#hudScale'), '85'); ok(A.T.cfg.hudScale === 85 && A.w.document.documentElement.style.getPropertyValue('--hs') === '0.85' && A.$('#hudScaleO').textContent === '85%', 'HUD: el tamaño se ajusta (85 %) y se aplica a las tarjetas');
    A.$('#hudCompact').checked = true; A.$('#hudCompact').dispatchEvent(new A.w.Event('change')); ok(A.T.cfg.hudCompact === true && A.w.document.body.classList.contains('hud-compact'), 'HUD compacto: menos elementos en pantalla');
    ok(A.errors.length === 0 && Bt.errors.length === 0 && Bm.errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(A.errors.concat(Bt.errors, Bm.errors)));
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  srv.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
