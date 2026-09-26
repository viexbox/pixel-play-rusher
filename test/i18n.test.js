'use strict';
/* Idiomas (public/i18n.js) con la página real: detecta el idioma del dispositivo, usa inglés si el idioma no está
   disponible, respeta la elección guardada en Ajustes y traduce también lo que el juego añade después de cargar. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '');
const I18N = fs.readFileSync(path.join(PUB, 'i18n.js'), 'utf8');

function boot(languages, saved) {
  const w = new JSDOM(html, { runScripts: 'outside-only', url: 'https://ejemplo.test/' }).window;
  Object.defineProperty(w.navigator, 'languages', { value: languages });
  Object.defineProperty(w.navigator, 'language', { value: languages[0] });
  if (saved) w.localStorage.setItem('ppr.lang', saved);
  w.confirm = m => { w.__lastConfirm = m; return true; };   // para comprobar que las ventanas del navegador también se traducen
  w.eval(I18N);
  return w;
}

(async () => {
  console.log('=== 1. Detección del idioma del dispositivo ===');
  const en = boot(['en-US', 'en']), d = en.document;
  ok(en.PPR_I18N.lang === 'en' && d.documentElement.lang === 'en', 'navegador en inglés → el juego sale en inglés');
  ok(d.querySelector('#shopBar b').textContent === 'WEAPON SHOP' && d.getElementById('shopBack').textContent === 'Back', 'la tienda de reaparición sale en inglés');
  ok(d.querySelector('#play b').textContent === 'TRAINING', 'el botón Entrenar sale como TRAINING');
  ok(/Blocky shooting arena/.test(d.title), 'y el título de la pestaña también (' + d.title + ')');
  ok(/^Type a message/.test(d.querySelector('[placeholder^="Type a message"]').placeholder), 'los textos de ayuda de los campos (placeholder) también se traducen');

  const es = boot(['es-ES']), e = es.document;
  ok(es.PPR_I18N.lang === 'es' && e.querySelector('#shopBar b').textContent === 'TIENDA DE ARMAS' && e.getElementById('shopBack').textContent === 'Volver', 'navegador en español → todo en español, también la tienda (ya no queda «WEAPON SHOP» ni «Back»)');
  ok(boot(['es-MX']).PPR_I18N.lang === 'es', 'cualquier variante de español (es-MX) → español');
  ok(boot(['fr-FR', 'de']).PPR_I18N.lang === 'en', 'idioma que aún no tenemos (francés, alemán) → inglés');
  ok(boot(['fr-FR', 'es-ES']).PPR_I18N.lang === 'es', 'si el dispositivo tiene varios idiomas, usa el primero disponible (francés no, español sí)');

  console.log('\n=== 2. La elección de Ajustes manda sobre la del dispositivo ===');
  const saved = boot(['en-US'], 'es');
  ok(saved.PPR_I18N.lang === 'es', 'navegador en inglés pero el jugador eligió Español → español');
  const sel = saved.document.getElementById('lang');
  ok(sel && sel.options.length >= 2 && sel.value === 'es', 'el selector de Ajustes lista los idiomas y marca el actual');
  ok([...sel.options].map(o => o.textContent).join(',') === 'Español,English', 'los nombres de los idiomas salen en su propio idioma (no se traducen)');

  console.log('\n=== 3. Lo que el juego añade después también se traduce ===');
  const b = d.createElement('button'); b.textContent = 'Reaparecer'; d.body.appendChild(b);
  const p2 = d.createElement('p'); p2.innerHTML = '<b>Nivel 7</b>'; d.body.appendChild(p2);
  const keep = d.createElement('span'); keep.textContent = 'Guest_1234'; d.body.appendChild(keep);
  await sleep(10);
  ok(b.textContent === 'Respawn', 'un botón creado por el código después de cargar sale traducido');
  ok(p2.textContent === 'Level 7', 'los textos con números también (Nivel 7 → Level 7)');
  ok(keep.textContent === 'Guest_1234', 'lo que no está en el diccionario (nombres de jugador) se deja tal cual');
  let changes = 0; new en.MutationObserver(r => { changes += r.length; }).observe(d.body, { subtree: true, childList: true, characterData: true });
  b.textContent = 'Recargar'; await sleep(30);
  ok(b.textContent === 'Reload' && changes < 10, 'cambiar un texto lo traduce una vez y para (no se queda en bucle: ' + changes + ' cambios)');

  console.log('\n=== 4. El diccionario está completo para la página ===');
  const dict = (() => { const m = I18N.match(/en: \{([\s\S]*?)\n    \}\n  \};/); return m ? m[1] : ''; })();
  const statics = new Set(); const walker = new JSDOM(html).window;
  for (const n of walker.document.body.querySelectorAll('*')) {
    if (/SCRIPT|STYLE|svg/i.test(n.nodeName) || n.closest('svg')) continue;
    for (const c of n.childNodes) if (c.nodeType === 3 && /[A-Za-záéíóúñ]{2}/.test(c.nodeValue)) statics.add(c.nodeValue.trim().replace(/\s+/g, ' '));
  }
  const missing = [...statics].filter(s => !dict.includes("'" + s.replace(/'/g, "\\'") + "'"));
  ok(missing.length === 0, 'todos los textos fijos de la página tienen traducción al inglés' + (missing.length ? ' (faltan: ' + missing.slice(0, 5).join(' | ') + ')' : ''));

  console.log('\n=== 5. [Paso 2] Lo que el juego escribe mientras funciona ===');
  const T = en.PPR_I18N.t;
  const cases = [
    ['1500 puntos · +150 PX', '1500 points · +150 PX', 'los números cambian pero la frase se traduce igual'],
    ['12.000 puntos · +800 PX · color «Cian»', '12,000 points · +800 PX · colour “Cyan”', 'millares con coma en inglés y el color entre comillas también traducido'],
    ['NIVEL 7 · BRONCE', 'LEVEL 7 · BRONZE', 'trozos separados por «·», en mayúsculas'],
    ['Asalto · Fusil de asalto', 'Assault · Assault rifle', 'nombre y tipo del arma'],
    ['0 puntos · faltan 1500 para Plata', '0 points · need 1500 more for Silver', 'frase con un rango en medio'],
    ['Violeta, cuesta 150 PX', 'Violet, costs 150 PX', 'color con precio'],
    ['Reapareces en 3 s.', 'Respawning in 3 s.', 'cuenta atrás de la pantalla de muerte'],
    ['Quedaste en el puesto 2 de 8 con 250 puntos.', 'You placed 2 of 8 with 250 points.', 'resultado de la partida'],
    ['¡Victoria del equipo AZUL!', 'Team BLUE wins!', 'ganador de la partida'],
    ['Desafío completado: Juega 3 partidas', 'Challenge complete: Play 3 matches', 'desafío completado con su nombre también traducido'],
    ['Termina en 2 d 9 h · solo en Solo cuchillos', 'Ends in 2 d 9 h · only in Knives only', 'duración del evento con el modo'],
    ['No hay ningún jugador llamado «Zoe_7» en tu sala.', 'There’s no player called “Zoe_7” in your room.', 'el nombre del jugador se deja tal cual'],
    ['Usuario o contraseña incorrectos.', 'Wrong username or password.', 'mensajes de error del servidor'],
    ['No te alcanza el dinero.', 'Not enough money.', 'aviso de la tienda de armas'],
    ['Kraken', 'Kraken', 'los nombres de los bots no se tocan'],
    ['¿Comprar Dron Z-3 por 1500 PX?', 'Buy Drone Z-3 for 1500 PX?', 'confirmación de compra de una mascota'],
    ['Comprar · 5000 PX', 'Buy · 5000 PX', 'botón de comprar mascota'],
    ['Te faltan 4350 PX.', 'You need 4350 more PX.', 'aviso de saldo insuficiente'],
    ['Osario · Skin · Asalto', 'Ossuary · Skin · Assault', 'nombre de una skin de neón del Pase VIP']
  ];
  for (const [es, want, why] of cases) { const got = T(es); ok(got === want, why + ': «' + es + '» → «' + got + '»'); }
  en.confirm('¿Bloquear a Zoe_7? Se romperá la amistad y no podrá enviarte solicitudes.');
  ok(en.__lastConfirm === 'Block Zoe_7? Your friendship will end and they won’t be able to send you requests.', 'las ventanas de confirmación del navegador también salen en inglés');
  ok(es.PPR_I18N.t('1500 puntos · +150 PX') === '1500 puntos · +150 PX', 'y en español no se toca nada');

  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
