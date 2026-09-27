/* [MÓVIL] Marco para móviles y tabletas: el juego está pensado para una pantalla de ordenador en horizontal. En una pantalla
   táctil sin ratón esta página se detiene y carga el juego en un marco (iframe con ?embed=1) de tamaño «de ordenador»
   (al menos 720 px de alto) que se escala para llenar la pantalla y, si el móvil está en vertical, se gira 90° solo:
   así se juega en horizontal aunque el móvil tenga el giro automático bloqueado. La página de fuera se carga igual (para buscadores
   y para que el navegador la pinte) pero sus scripts del juego no arrancan (window.__PPR_SHELL). Dentro del marco todo (menús, tienda,
   HUD, controles táctiles) funciona igual que en el ordenador, y el navegador traduce los toques a través del giro.
   No se usa con ratón, dentro del propio marco, abriendo el archivo local ni para buscadores (el SEO ve la página normal). */
(function () {
  try {
    var q = location.search, h = document.documentElement;
    if (/[?&]embed=1(&|$)/.test(q)) { h.className += ' embed'; return; }
    if (location.protocol === 'file:' || window.top !== window.self) return;
    var fine = window.matchMedia && window.matchMedia('(any-pointer: fine)').matches, touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (fine || !touch || /bot|crawl|spider|slurp|lighthouse/i.test(navigator.userAgent)) return;
    window.__PPR_SHELL = true;   // los scripts del juego de esta página no arrancan (cada uno lo comprueba): el juego va dentro del marco
    var d = document, head = d.head;
    h.className += ' shell';
    var st = d.createElement('style');
    st.textContent = 'html.shell,html.shell body{margin:0;height:100%;overflow:hidden;background:#05070f;overscroll-behavior:none;touch-action:none}' +
      'html.shell body>*:not(#shellFrame){display:none!important}' +
      '#shellFrame{position:fixed;left:0;top:0;border:0;transform-origin:0 0;background:#05070f}';
    head.appendChild(st);
    var f = d.createElement('iframe'); f.id = 'shellFrame'; f.title = 'Krunxa';
    f.setAttribute('allow', 'fullscreen; autoplay; clipboard-write; screen-wake-lock');
    f.src = location.pathname + (q ? q + '&' : '?') + 'embed=1' + location.hash;
    var mount = function () { d.body.appendChild(f); fit(); };
    var scale = 1;
    var send = function () { try { f.contentWindow.postMessage({ t: 'ppr-shell', s: scale }, location.origin); } catch (e) { /* aún no */ } };
    var fit = function () {
      var W = window.innerWidth, H = window.innerHeight, rot = H > W, L = Math.max(W, H), S = Math.min(W, H);
      var fh = Math.max(S, 720), s = S / fh, fw = Math.round(L / s);
      scale = s; f.style.width = fw + 'px'; f.style.height = fh + 'px';
      f.style.transform = rot ? 'translateX(' + W + 'px) rotate(90deg) scale(' + s + ')' : 'scale(' + s + ')';
      h.classList.toggle('rot', rot); send();
    };
    if (d.body) mount(); else d.addEventListener('DOMContentLoaded', mount);
    window.addEventListener('resize', fit); window.addEventListener('orientationchange', function () { setTimeout(fit, 250); });
    f.addEventListener('load', send);
    window.addEventListener('message', function (e) {   // el juego pide pantalla completa al empezar una partida
      if (e.origin !== location.origin || !e.data || e.data.t !== 'ppr-fs') return;
      try { var r = (h.requestFullscreen || h.webkitRequestFullscreen).call(h); if (r && r.catch) r.catch(function () {}); } catch (err) { /* no se puede */ }
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (err) { /* no se puede */ }
      setTimeout(fit, 300);
    });
    window.__PPR_SHELL_API = { fit: fit, frame: f };
  } catch (e) { /* si algo falla, se juega sin marco */ }
})();
