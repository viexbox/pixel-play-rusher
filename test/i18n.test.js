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

  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
