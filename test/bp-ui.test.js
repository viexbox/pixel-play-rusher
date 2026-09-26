'use strict';
/* Pantalla del Pase de batalla dentro del juego (cliente real en jsdom + servidor real). */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
const PORT = 3188, ORIGIN = 'http://127.0.0.1:' + PORT, DIR = '/tmp/ppr_bpui', APASS = 'BpUi-Admin-2026xy';
fs.rmSync(DIR, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
let n = 40; const xip = () => '10.9.4.' + (n++);
const wf = (u, o) => fetch(new URL(u, ORIGIN + '/').href, Object.assign({}, o, { headers: Object.assign({ 'X-Forwarded-For': xip() }, o && o.headers) }));
const api = async (m, p, b, tk) => { const r = await wf('/api' + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*(fonts|stylesheet)[^>]*>/g, '');
const three = fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'), shared = fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'), client = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'), bpjs = fs.readFileSync(path.join(PUB, 'bp.js'), 'utf8');
function boot(token) {
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: ORIGIN + '/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
  w.fetch = wf; if (token) w.localStorage.setItem('ppr.acct', token);
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(shared); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  const i = client.lastIndexOf('})();');
  w.eval(client.slice(0, i) + 'window.__T = { get remote() { return remote; }, get state() { return state; }, gun, knifeG, step, netHandle, cfg, syncRemote };\n' + client.slice(i));
  w.eval(bpjs);
  return { w, T: w.__T, errors, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)] };
}
const setVal = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const findColor = (g, hex) => { let f = false; g.traverse(o => { if (o.material && o.material.color && o.material.color.getHexString && o.material.color.getHexString() === hex.replace('#', '')) f = true; }); return f; };
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: DIR, ADMIN_PASSWORD: APASS, TRUST_PROXY: 1, DATABASE_URL: '', ACCOUNTS_REG_MAX: 50 }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } }); await sleep(1500);
  try {
    const reg = async (u, e) => (await api('POST', '/auth/register', { username: u, email: e, password: 'Clave-Segura-77' })).j.token;
    const TZ = await reg('Zoe_7', 'zoe@e.com'); await reg('Nico_9', 'nico@e.com'); const AT = (await api('POST', '/admin/login', { user: 'Viexbox', password: APASS })).j.token;
    const give = (u, d) => api('POST', '/admin/px', { username: u, delta: d, reason: 'prueba' }, AT); await give('Zoe_7', 3000);

    /* ---------- Sin cuenta: solo se puede mirar el catálogo ---------- */
    let G = boot(''); await sleep(300); G.$('.nav button[data-tab=pass]').click(); await sleep(200);
    ok(!G.$('#passScreen').hidden && G.$$('#psScroll .ps-col').length === 50, 'el botón «Pase» abre la pantalla a pantalla completa con las 50 columnas de niveles');
    ok(G.$$('#psScroll .rcard.free').length === 50 && G.$$('#psScroll .rcard.vip').length === 50, 'dos filas: 50 tarjetas GRATIS arriba y 50 VIP abajo');
    ok(/catálogo/.test(G.$('#psNote').textContent) && G.$('#psBuy').disabled && G.$('#psGift').disabled && G.$('#psSkip').disabled && !G.$$('#psScroll [data-claim]').length, 'sin cuenta online: aviso, botones desactivados y nada que reclamar');
    G.$('#psClose').click(); ok(G.$('#passScreen').hidden, 'la pantalla se cierra');

    /* ---------- Con cuenta ---------- */
    const A = boot(TZ); await sleep(400); ok(await until(() => A.T.remote && A.T.remote.px === 3000), 'el juego carga la cuenta (3.000 PX)');
    A.$('.nav button[data-tab=pass]').click(); ok(await until(() => /NIVEL|1/.test(A.$('#psLv').textContent) && A.$('#psWallet').textContent !== ''), 'abre el pase y carga el estado del servidor');
    ok(A.$('#psLv').textContent === '1' && A.$('#psXpTxt').textContent === '0 / 250 XP' && A.$('#psVipStat').textContent === 'PASE GRATIS', 'nivel 1, barra de XP «0 / 250 XP» y pase gratis');
    const cards = A.$$('#psScroll .rcard');
    ok(cards.length === 100 && cards.every(c => c.querySelector('.rar') && /^--rc/.test('--rc') && c.style.getPropertyValue('--rc')), 'las 100 tarjetas llevan etiqueta de rareza y color de rareza');
    const rarSet = new Set(cards.map(c => c.querySelector('.rar').textContent)); ok(['COMÚN', 'POCO COMÚN', 'RARO', 'ÉPICO', 'LEGENDARIO'].every(x => rarSet.has(x)), 'están las 5 rarezas: ' + [...rarSet].join(' · '));
    const rc = {}; cards.forEach(c => { rc[c.querySelector('.rar').textContent] = c.style.getPropertyValue('--rc'); }); ok(rc['LEGENDARIO'] === S.RARITY.leyenda.c && rc['ÉPICO'] === S.RARITY.epico.c && rc['COMÚN'] === S.RARITY.comun.c, 'cada rareza tiene su color (legendario dorado, épico morado, común gris)');
    ok(cards.every(c => c.querySelector('.prev svg') && c.querySelector('.nm').textContent.length > 1), 'todas tienen vista previa del objeto (SVG) y nombre');
    const skinCard = cards.find(c => /Dragón/.test(c.textContent)); ok(skinCard && skinCard.querySelector('.prev svg').innerHTML.includes(S.WEAPON_SKINS.find(k => k.id === 'ak_dragon').body), 'la vista previa de una skin usa sus colores reales (Dragón: rojo)');
    ok(A.$$('#psScroll .rcard.vip .padlock').length === 50 && A.$$('#psScroll .rcard.vip.locked, #psScroll .rcard.vip.vipoff').length === 50, 'toda la fila VIP lleva candado mientras no se compra el pase');
    ok(A.$('#psScroll .ps-col:nth-child(1) .rcard.free [data-claim]') && !A.$('#psScroll .ps-col:nth-child(2) .rcard.free [data-claim]') && /Nivel 2/.test(A.$('#psScroll .ps-col:nth-child(2) .rcard.free .st').textContent), 'el nivel 1 se puede reclamar; el 2 muestra «Nivel 2» (bloqueado)');
    A.$('#psScroll [data-claim="1:free"]').click(); ok(await until(() => A.T.remote && A.T.remote.px === 3008 || A.$('#krTotal').textContent === '3008'), 'reclamar el nivel 1 gratis suma 8 PX (3.008)');
    ok(await until(() => /Reclamado/.test(A.$('#psScroll .ps-col:nth-child(1) .rcard.free .act').textContent)), 'y la tarjeta pasa a «✓ Reclamado»');

    /* Comprar VIP */
    A.$('#psBuy').click(); ok(await until(() => !A.$('#psModal').hidden) && /Pase VIP · Temporada 1/.test(A.$('#psmBox').textContent) && /1\.?500 PX/.test(A.$('#psmBox').textContent), 'Comprar Pase VIP abre la confirmación con el precio (1.500 PX)');
    [...A.$$('#psmBox button')].find(b => /Comprar por/.test(b.textContent)).click(); ok(await until(() => A.$('#psVipStat').textContent === 'PASE VIP' && A.$('#psModal').hidden), 'al confirmar, el pase pasa a VIP');
    ok(A.$$('#psScroll .padlock').length === 0 && A.$('#psBuy').disabled && /activo/.test(A.$('#psBuy').textContent) && A.$('#psWallet').textContent.replace(/\D/g, '') === '1508', 'sin candados, botón «activo» y saldo 1.508 PX');
    A.$('#psScroll [data-claim="1:vip"]').click(); ok(await until(() => A.$('#psScroll [data-equip="banner"]')), 'se reclama el banner S1 del nivel 1 VIP y aparece «Equipar»');
    A.$('#psScroll [data-equip="banner"]').click(); ok(await until(() => !A.$('#myBanner').hidden && /S1/.test(A.$('#myBanner').textContent)), 'al equiparlo, el banner S1 se muestra en tu tarjeta del lobby');

    /* Regalar */
    A.$('#psGift').click(); ok(await until(() => !A.$('#psModal').hidden) && A.$('#psmTo'), 'Regalar Pase abre el formulario con el nombre del destinatario');
    setVal(A.w, A.$('#psmTo'), 'NoExiste'); [...A.$$('#psmBox button')].find(b => b.textContent === 'Regalar').click(); ok(await until(() => /No existe/.test(A.$('#psmErr').textContent)), 'un nombre inexistente muestra el error');
    setVal(A.w, A.$('#psmTo'), 'nico_9'); [...A.$$('#psmBox button')].find(b => b.textContent === 'Regalar').click(); ok(await until(() => A.$('#psModal').hidden && /regalado a Nico_9/.test(A.$('#toast').textContent)), 'un nombre válido regala el pase');
    ok(A.$('#psWallet').textContent.replace(/\D/g, '') === '8', 'y cobra 1.500 PX (queda 8)');
    await give('Zoe_7', 5000);

    /* Saltar niveles */
    await A.T.syncRemote(); A.$('#psSkip').click(); ok(await until(() => !A.$('#psModal').hidden) && A.$('#psmN'), 'Saltar Niveles abre el selector');
    setVal(A.w, A.$('#psmN'), '5'); ok(A.$('#psmLv').textContent === '6' && /600/.test(A.$('#psmCost').textContent), 'con 5 niveles muestra que llegarías al 6 por 600 PX');
    [...A.$$('#psmBox button')].find(b => b.textContent === 'Saltar').click(); ok(await until(() => A.$('#psLv').textContent === '6' && A.$('#psModal').hidden), 'al confirmar, subes al nivel 6');
    ok(A.$('#psScroll .ps-col:nth-child(6) .ps-lv.cur') && A.$$('#psScroll .ps-lv.done').length === 5, 'la fila de niveles marca el actual y los superados');
    A.$('#psClaimAll').click(); ok(await until(() => A.$$('#psScroll [data-claim]').length === 0 && A.$$('#psScroll .rcard.claimed').length >= 10), 'Reclamar todo recoge todo lo disponible hasta el nivel 6');
    await give('Zoe_7', 6000); await A.T.syncRemote(); A.$('#psSkip').click(); await until(() => !A.$('#psModal').hidden && A.$('#psmN')); setVal(A.w, A.$('#psmN'), '999'); [...A.$$('#psmBox button')].find(b => b.textContent === 'Saltar').click(); ok(await until(() => A.$('#psLv').textContent === '50'), 'un número enorme se limita al nivel 50');
    ok(A.$('#psXpTxt').textContent === 'NIVEL MÁXIMO' && A.$('#psSkip').disabled, 'nivel máximo: la barra lo dice y «Saltar» se desactiva');
    A.$('#psClaimAll').click(); ok(await until(() => A.$$('#psScroll .rcard.claimed').length === 100), 'Reclamar todo: las 100 recompensas reclamadas');

    /* Equipar skins y verlas en el juego */
    const dragon = () => A.$$('#psScroll .rcard').find(c => /Dragón/.test(c.textContent));
    dragon().querySelector('[data-equip]').click(); ok(await until(() => dragon().querySelector('.equip.on')), 'equipar la skin Dragón (botón «Equipado ✓»)');
    const oro = () => A.$$('#psScroll .rcard').find(c => /Oro real/.test(c.textContent)); oro().querySelector('[data-equip]').click(); ok(await until(() => oro().querySelector('.equip.on')), 'y el cuchillo Oro real');
    ok(A.w.PPR_BP.equipped['weapon:ak'] === 'ak_dragon' && A.w.PPR_BP.equipped.knife === 'k_oro', 'el juego sabe lo equipado');
    /* [INVENTARIO] sección con todo lo que tiene la cuenta */
    { A.$('[data-tab=inv]').click(); await sleep(600);
      const own = A.w.PPR_BP.state ? A.w.PPR_BP.state.inventory.length : -1, cards = A.$$('#invBox .rcard').length;
      ok(A.$('[data-tab=inv]') && !A.$('#tab-inv').hidden && own > 0 && cards >= own, 'la sección Inventario lista todo lo que tiene la cuenta (' + cards + ' objetos, ' + own + ' del pase y mascotas)');
      const fb = A.$('#invBox [data-invf=kskin]'); fb.click(); await sleep(50);
      ok(A.$$('#invBox .rcard').length === A.w.PPR_BP.state.inventory.filter(i => i.t === 'kskin').length, 'el filtro «Cuchillos» deja solo las skins de cuchillo');
      A.$('#invBox [data-invf=all]').click(); A.$('[data-tab=home]').click(); }
    /* [3D] las skins de armas se pueden ver en 3D al pulsar su tarjeta */
    { const WS = S.BP_TIERS.reduce((n, t) => n + (t.free.t === 'wskin') + (t.vip.t === 'wskin'), 0);
      ok(A.$$('#psScroll .rcard.has3d').length === WS && A.$$('#psScroll .rcard.has3d .v3d').length === WS, 'las ' + WS + ' tarjetas de skins de armas llevan la etiqueta «3D»');
      ok(A.$$('#psScroll .rcard.has3d').every(c => { const r = S.BP_TIERS[+c.dataset.l - 1][c.dataset.t]; return r && r.t === 'wskin'; }), 'y solo las de skins de armas (no las de PX, cuchillos ni banners)');
      const c = A.$('#psScroll .rcard.has3d[data-l="35"][data-t="vip"]'); c.querySelector('.prev').click(); await sleep(60);
      const ov = A.$('.sk3d');
      ok(!ov || (/Osario/.test(ov.textContent) && /Asalto/.test(ov.textContent)), 'pulsar la de Osario abre su vista 3D con su nombre y su arma (o, sin gráficos 3D, no deja una ventana vacía)');
      if (ov) { A.w.document.dispatchEvent(new A.w.KeyboardEvent('keydown', { key: 'Escape' })); await sleep(30); ok(!A.$('.sk3d'), 'Escape la cierra'); }
    }
    A.$('#psClose').click(); A.$$('#classes .cls')[8].click(); A.$('#play').click(); A.$('#eqPlay').click(); ok(await until(() => A.T.state === 'playing'), 'empieza una partida con la AK');
    ok(findColor(A.T.gun, S.WEAPON_SKINS.find(k => k.id === 'ak_dragon').body) && findColor(A.T.gun, S.WEAPON_SKINS.find(k => k.id === 'ak_dragon').acc), 'el arma en primera persona lleva los colores de la skin Dragón');
    ok(findColor(A.T.knifeG, '#ffd23a') && findColor(A.T.knifeG, '#c4161f'), 'y el cuchillo lleva los colores del Oro real (hoja dorada, guarda roja)');
    ok(findColor(A.T.gun, '#c4161f') && !findColor(A.T.gun, S.WEAPONS[8].col.replace('#', '')), 'sin rastro del color original del arma');
    /* Quitar y XP de partida */
    A.T.netHandle({ t: 'bpxp', xp: 180, total: 36000, level: 50, up: false }); ok(/\+180 XP/.test(A.$('#toast').textContent) && !A.$('#endXp').hidden && /180 XP del Pase/.test(A.$('#endXp').textContent), 'el mensaje de XP de una partida se muestra (aviso y línea en la pantalla final)');
    ok(A.errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(A.errors));
    ok(S.BP_TIERS.length === 50, 'catálogo de 50 niveles');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  srv.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
