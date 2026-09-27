'use strict';
/* [MÓVIL] Marco para móviles (shell.js): en una pantalla táctil sin ratón el juego se carga dentro de un iframe de tamaño «de ordenador»
   que se escala y, en vertical, se gira 90°; la página de fuera no arranca el juego. Con ratón, dentro del marco o para buscadores, no hace nada. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'shell.js'), 'utf8');
function page({ w, h, touch, fine, url, ua }) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><main id="menu">juego</main></body></html>', { url: url || 'https://www.krunxa.com/?party=AB12', runScripts: 'outside-only'});
  const win = dom.window;
  Object.defineProperty(win, 'innerWidth', { value: w, configurable: true, writable: true }); Object.defineProperty(win, 'innerHeight', { value: h, configurable: true, writable: true });
  win.matchMedia = q => ({ matches: q.includes('any-pointer: fine') ? !!fine : false });
  if (touch) win.ontouchstart = null;
  Object.defineProperty(win.navigator, 'userAgent', { value: ua || 'Mozilla/5.0 (iPhone) Mobile Safari', configurable: true });
  win.eval(SRC);
  return win;
}
const fr = win => win.document.getElementById('shellFrame');

let W = page({ w: 390, h: 844, touch: true });
let f = fr(W);
ok(W.__PPR_SHELL === true && W.document.documentElement.classList.contains('shell') && !!f, 'móvil: la página se convierte en marco y los scripts del juego de fuera no arrancan');
ok(f && /\/\?party=AB12&embed=1$/.test(f.getAttribute('src')), 'el marco carga el mismo juego con ?embed=1 y conserva los parámetros (' + (f && f.getAttribute('src')) + ')');
ok(f && f.style.height === '720px' && f.style.width === Math.round(844 / (390 / 720)) + 'px', 'en vertical el marco mide ' + (f && f.style.width) + ' × ' + (f && f.style.height) + ' (horizontal, al menos 720 de alto)');
ok(f && /rotate\(90deg\)/.test(f.style.transform) && /translateX\(390px\)/.test(f.style.transform) && W.document.documentElement.classList.contains('rot'), 'y se gira 90° solo para verse en horizontal (' + (f && f.style.transform) + ')');
W.innerWidth = 844; W.innerHeight = 390; W.dispatchEvent(new W.Event('resize'));
ok(!/rotate/.test(f.style.transform) && /scale\(0\.54/.test(f.style.transform) && !W.document.documentElement.classList.contains('rot'), 'al poner el móvil en horizontal ya no se gira, solo se escala (' + f.style.transform + ')');

W = page({ w: 1280, h: 800, touch: false, fine: true });
ok(!W.__PPR_SHELL && !fr(W), 'en el ordenador (con ratón) no cambia nada');
W = page({ w: 1280, h: 800, touch: true, fine: true });
ok(!fr(W), 'pantalla táctil con ratón (portátil táctil): tampoco');
W = page({ w: 390, h: 844, touch: true, url: 'https://www.krunxa.com/?embed=1' });
ok(!fr(W) && W.document.documentElement.classList.contains('embed'), 'dentro del marco no se crea otro marco');
W = page({ w: 390, h: 844, touch: true, ua: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) Mobile Safari (compatible; Googlebot/2.1)' });
ok(!fr(W), 'los buscadores (Googlebot móvil) ven la página normal');
const rest = ['client.js', 'bp.js', 'social.js', 'modes.js', 'account.js', 'diag.js'].filter(n => !/window\.__PPR_SHELL\) return;/.test(fs.readFileSync(path.join(__dirname, '..', 'public', n), 'utf8')));
ok(!rest.length && /__PPR_SHELL/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'main.js'), 'utf8')), 'todos los scripts del juego respetan el marco' + (rest.length ? ' (faltan: ' + rest.join(', ') + ')' : ''));
ok(/<script src="shell\.js"><\/script>/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').split('</head>')[0]), 'shell.js se carga en <head>, antes que el resto');
console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
