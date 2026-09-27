/* [PORTALES] Krunxa dentro de CrazyGames o Poki.
   Se activa con ?portal=crazygames / ?portal=poki (la dirección que se da de alta en CrazyGames) o con window.PPR_PORTAL_NAME
   (lo pone scripts/build-portal.js en el archivo que se sube a Poki). Sin portal no hace nada y el juego sigue como siempre.
   Carga el SDK del portal y ofrece a client.js una API común (window.PPR_PORTAL):
     loadingDone()     el juego ya ha cargado (Poki: gameLoadingFinished · CrazyGames: loadingStop)
     gameplay(on)      se está jugando (true) o no: menú, pausa, muerte, fin de partida (gameplayStart / gameplayStop)
     commercial()      anuncio entre partidas → Promise (siempre se resuelve; el portal decide si hay anuncio)
     rewarded()        anuncio con premio → Promise<boolean> (true = visto entero)
     happy()           momento de alegría (CrazyGames: happytime), p. ej. al ganar
   En modo portal la página lleva la clase «portal» en <html>: se esconden los enlaces externos (Discord, invitaciones) y la
   compra de PX con dinero (los portales no permiten pagos ni enlaces fuera de su web). */
(function () {
  'use strict';
  var q = null; try { q = new URLSearchParams(location.search).get('portal'); } catch (e) { /* sin URL */ }
  var name = String(window.PPR_PORTAL_NAME || q || '').toLowerCase();
  if (name !== 'crazygames' && name !== 'poki') return;
  try { document.documentElement.className += ' portal portal-' + name; } catch (e) { /* nada */ }
  var SDK_URL = { crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js', poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js' }[name];
  var ready = false, playing = false, loaded = false, queue = [];
  var P = window.PPR_PORTAL = { name: name, ready: false, adBusy: false };
  function cg() { return window.CrazyGames && window.CrazyGames.SDK; }
  function when(fn) { if (ready) { try { fn(); } catch (e) { /* el SDK no respondió */ } } else queue.push(fn); }
  function done() { ready = true; P.ready = true; var q2 = queue; queue = []; q2.forEach(function (fn) { try { fn(); } catch (e) { /* nada */ } }); }
  /* carga del SDK; si falla (bloqueador, sin internet, prueba local) el juego funciona igual, solo sin anuncios */
  var sc = document.createElement('script'); sc.src = SDK_URL; sc.async = true;
  sc.onload = function () {
    try {
      if (name === 'poki') window.PokiSDK.init().then(done, done);
      else { var r = cg().init(); if (r && r.then) r.then(done, done); else done(); }
    } catch (e) { done(); }
  };
  sc.onerror = function () { P.failed = true; done(); };
  (document.head || document.documentElement).appendChild(sc);
  if (name === 'crazygames') when(function () { var s = cg(); if (s && !loaded) s.game.loadingStart(); });

  P.loadingDone = function () {
    if (loaded) return; loaded = true;
    when(function () { if (name === 'poki') window.PokiSDK.gameLoadingFinished(); else { var s = cg(); if (s) s.game.loadingStop(); } });
  };
  P.gameplay = function (on) {
    on = !!on; if (on === playing) return; playing = on;
    when(function () {
      if (name === 'poki') { if (on) window.PokiSDK.gameplayStart(); else window.PokiSDK.gameplayStop(); }
      else { var s = cg(); if (s) { if (on) s.game.gameplayStart(); else s.game.gameplayStop(); } }
    });
  };
  P.happy = function () { when(function () { var s = cg(); if (name === 'crazygames' && s && s.game.happytime) s.game.happytime(); }); };
  /* anuncios: mientras sale el anuncio el juego se silencia (onStart/onEnd los da client.js) */
  function ad(kind, onStart, onEnd) {
    return new Promise(function (res) {
      if (!ready || P.failed || P.adBusy) return res(false);
      var fin = function (v) { P.adBusy = false; try { if (onEnd) onEnd(); } catch (e) { /* nada */ } res(!!v); };
      P.adBusy = true;
      try {
        if (name === 'poki') {
          var st = function () { try { if (onStart) onStart(); } catch (e) { /* nada */ } };
          (kind === 'rewarded' ? window.PokiSDK.rewardedBreak(st) : window.PokiSDK.commercialBreak(st)).then(function (ok) { fin(kind === 'rewarded' ? ok : true); }, function () { fin(false); });
        } else {
          cg().ad.requestAd(kind === 'rewarded' ? 'rewarded' : 'midgame', {
            adStarted: function () { try { if (onStart) onStart(); } catch (e) { /* nada */ } },
            adFinished: function () { fin(true); },
            adError: function () { fin(false); }
          });
        }
      } catch (e) { fin(false); }
    });
  }
  P.commercial = function (onStart, onEnd) { return ad('midgame', onStart, onEnd); };
  P.rewarded = function (onStart, onEnd) { return ad('rewarded', onStart, onEnd); };
})();
