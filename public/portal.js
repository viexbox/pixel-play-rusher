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
  /* [PORTALES] Multijugador con amigos: enlace de invitación a la sala, botón de invitar del portal, leer la invitación al entrar,
     multijugador instantáneo (CrazyGames: el jefe del grupo entra directo a una sala) y ajustes del portal (chat desactivado, sin sonido) */
  P.onReady = function (fn) { when(fn); };
  P.inviteParam = function (key) {
    try { if (name === 'crazygames') { var s = cg(); if (s && s.game && typeof s.game.getInviteParam === 'function') { var v = s.game.getInviteParam(key); if (v) return String(v); } } } catch (e) { /* nada */ }
    try { if (name === 'poki' && window.PokiSDK && typeof window.PokiSDK.getURLParam === 'function') { var w = window.PokiSDK.getURLParam(key); if (w) return String(w); } } catch (e) { /* nada */ }
    try { return new URLSearchParams(location.search).get(key); } catch (e) { return null; }
  };
  P.inviteLink = function (params) {
    return new Promise(function (res) {
      when(function () {
        try {
          if (name === 'crazygames') { var r = cg().game.inviteLink(params); if (r && r.then) r.then(res, function () { res(null); }); else res(r || null); }
          else if (window.PokiSDK && window.PokiSDK.shareableURL) window.PokiSDK.shareableURL(params).then(res, function () { res(null); });
          else res(null);
        } catch (e) { res(null); }
      });
    });
  };
  P.showInvite = function (params) { when(function () { var s = cg(); if (name === 'crazygames' && s && s.game.showInviteButton) s.game.showInviteButton(params); }); };
  P.hideInvite = function () { when(function () { var s = cg(); if (name === 'crazygames' && s && s.game.hideInviteButton) s.game.hideInviteButton(); }); };
  P.instant = function () { try { var s = cg(); return !!(name === 'crazygames' && s && s.game && s.game.isInstantMultiplayer); } catch (e) { return false; } };
  P.settings = function () { try { var s = cg(), g = s && s.game && s.game.settings; return { disableChat: !!(g && g.disableChat), muteAudio: !!(g && g.muteAudio) }; } catch (e) { return { disableChat: false, muteAudio: false }; } };
  P.onSettings = function (fn) { when(function () { var s = cg(); if (name === 'crazygames' && s && s.game.addSettingsChangeListener) s.game.addSettingsChangeListener(function () { fn(P.settings()); }); fn(P.settings()); }); };
  /* [PORTALES] Cuenta de CrazyGames: si el jugador ha iniciado sesión en CrazyGames, su token (JWT firmado por CrazyGames) sirve
     para entrar con una cuenta del servidor enlazada a ese usuario (ver /api/auth/crazygames). Sin sesión, se le puede pedir que entre. */
  P.account = function () {
    return new Promise(function (res) {
      when(function () {
        var s = cg(); if (name !== 'crazygames' || !s || !s.user || s.user.isUserAccountAvailable === false) return res(null);
        Promise.resolve(s.user.getUser()).then(function (u) {
          if (!u) return res(null);
          return Promise.resolve(s.user.getUserToken()).then(function (tk) { res(tk ? { token: tk, username: u.username } : null); });
        }).catch(function () { res(null); });
      });
    });
  };
  P.accountAvailable = function () { var s = cg(); return !!(name === 'crazygames' && s && s.user && s.user.isUserAccountAvailable !== false); };
  P.login = function () { return new Promise(function (res) { when(function () { try { Promise.resolve(cg().user.showAuthPrompt()).then(function () { res(true); }, function () { res(false); }); } catch (e) { res(false); } }); }); };
  P.onAuth = function (fn) { when(function () { try { var s = cg(); if (name === 'crazygames' && s && s.user && s.user.addAuthListener) s.user.addAuthListener(function (u) { fn(u || null); }); } catch (e) { /* nada */ } }); };
  P.commercial = function (onStart, onEnd) { return ad('midgame', onStart, onEnd); };
  P.rewarded = function (onStart, onEnd) { return ad('rewarded', onStart, onEnd); };
})();
