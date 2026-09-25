'use strict';
/* PixelPlayRusher · Modo clasificatorio y temporadas.
   - Solo cuentas online. Cada cuenta tiene una puntuación (MMR, tipo Elo) que sube al ganar y baja al perder según la fuerza de los dos equipos.
   - Las primeras 10 partidas (colocación) mueven más la puntuación. Abandonar una partida clasificatoria en marcha resta puntos.
   - Emparejamiento: una sala clasificatoria solo acepta jugadores de ligas cercanas (la diferencia con la liga media de la sala no puede pasar de 1).
   - Temporadas de SEASON_DAYS días: al cerrar (sola o desde el panel) se reparten premios según la MEJOR liga alcanzada (mínimo 5 partidas), se guarda una insignia en el
     perfil y todos bajan a mitad de camino hacia 1000 puntos para empezar la siguiente.
   Rutas: GET /api/ranked · POST /api/ranked/ack · panel: GET /api/admin/ranked, POST /api/admin/ranked/close */

const path = require('path');
const { Store } = require('./admin.js');

function createRanked({ S, accounts, admin, dataDir, log, env }) {
  env = env || process.env;
  const R = Object.assign({}, S.RANKED, env.RANKED_MIN_GAMES ? { MIN_GAMES: +env.RANKED_MIN_GAMES } : {}), DAY = 86400000, SEASON_DAYS = +env.SEASON_DAYS || 30;
  const doc = new Store(path.join(dataDir, 'seasons.json'), { current: null, history: [] }, log);
  const now = () => Date.now();
  const startSeason = (id, t) => { doc.data.current = { id, start: t, end: t + SEASON_DAYS * DAY }; doc.save(); };
  if (!doc.data.current) startSeason(1, now());
  const cur = () => doc.data.current;

  const leagueOf = mmr => { const i = S.leagueIdx(mmr); return Object.assign({ i }, S.LEAGUES[i]); };
  /* Datos de clasificatorio de una cuenta (se crean al primer uso o cuando cambia la temporada) */
  function rk(u) {
    if (!u.rk || u.rk.s !== cur().id) u.rk = { s: cur().id, mmr: u.rk ? u.rk.mmr : R.START, games: 0, wins: 0, peak: u.rk ? u.rk.mmr : R.START };
    return u.rk;
  }
  const mmrOf = u => (u ? rk(u).mmr : R.START);

  /* Fin de una partida clasificatoria: rows = jugadores de la sala; winner = 0 | 1 | -1 (empate). Devuelve un mapa jugador → resultado. */
  function onRoundEnd(rows, winner) {
    const acc = rows.filter(p => p.acctUser && p.kills + p.deaths + p.points > 0), out = new Map();
    const team = t => acc.filter(p => p.team === t);
    if (acc.length < 2 || team(0).length < R.MIN_TEAM || team(1).length < R.MIN_TEAM) return out;
    const avg = t => team(t).reduce((n, p) => n + rk(p.acctUser).mmr, 0) / team(t).length, av = [avg(0), avg(1)];
    for (const p of acc) {
      const r = rk(p.acctUser), mine = av[p.team], opp = av[1 - p.team], exp = 1 / (1 + Math.pow(10, (opp - mine) / 400));
      const res = winner < 0 ? 0.5 : (p.team === winner ? 1 : 0), k = r.games < R.PLACEMENT ? R.K_PLACE : R.K;
      let d = Math.round(k * (res - exp));
      if (p === acc[0] && res >= 0.5) d += 2;                      // el mejor de la partida gana algo más si su equipo no pierde
      if (res === 1) d = Math.max(d, 1); if (res === 0) d = Math.min(d, -1);   // ganar nunca resta y perder nunca suma
      const before = leagueOf(r.mmr); r.mmr = Math.max(0, r.mmr + d); r.games++; if (res === 1) r.wins++; r.peak = Math.max(r.peak, r.mmr);
      const after = leagueOf(r.mmr); out.set(p, { delta: d, mmr: r.mmr, games: r.games, wins: r.wins, league: after.n, col: after.col, up: after.i > before.i, down: after.i < before.i });
    }
    accounts.touch(); return out;
  }
  /* Quien se va de una partida clasificatoria en marcha (con al menos 3 jugadores) pierde puntos */
  function onLeave(p) {
    if (!p.acctUser) return null; const r = rk(p.acctUser); r.mmr = Math.max(0, r.mmr - R.LEAVE_PENALTY); r.games++; accounts.touch(); return r.mmr;
  }

  /* ---------- Temporadas ---------- */
  function closeSeason(by) {
    const c = cur(), t = now(), rewards = {}; let players = 0;
    for (const u of accounts.allUsers()) {
      if (!u.rk || u.rk.s !== c.id) continue;
      const peakL = leagueOf(u.rk.peak);
      if (u.rk.games >= R.MIN_GAMES) {
        players++; rewards[peakL.n] = (rewards[peakL.n] || 0) + 1;
        if (peakL.cr) accounts.grantCr(u, peakL.cr, 'Premio de temporada ' + c.id + ' (' + peakL.n + ')'); if (peakL.px) accounts.grant(u, peakL.px, 'Premio de temporada ' + c.id + ' (' + peakL.n + ')');
        u.badges = (u.badges || []).concat([{ s: c.id, l: peakL.n, mmr: u.rk.peak }]).slice(-20);
        u.rkReward = { s: c.id, league: peakL.n, cr: peakL.cr, px: peakL.px, mmr: u.rk.peak };
      }
      const soft = Math.round(R.START + (u.rk.mmr - R.START) * 0.5);   // «reinicio suave»: a mitad de camino hacia 1000
      u.rk = { s: c.id + 1, mmr: soft, games: 0, wins: 0, peak: soft };
    }
    doc.data.history.push({ id: c.id, start: c.start, end: c.end, closedAt: t, by: by || 'automático', players, rewards }); if (doc.data.history.length > 50) doc.data.history.shift();
    startSeason(c.id + 1, t); accounts.touch(); log('Temporada ' + c.id + ' cerrada (' + players + ' jugadores con premio). Empieza la ' + (c.id + 1) + '.'); return { closed: c.id, players, rewards };
  }
  const timer = setInterval(() => { if (now() >= cur().end) closeSeason('automático'); }, 60000); timer.unref();

  const view = u => {
    const r = rk(u), l = leagueOf(r.mmr), next = S.LEAGUES[l.i + 1];
    return { season: { id: cur().id, start: cur().start, end: cur().end, daysLeft: Math.max(0, Math.ceil((cur().end - now()) / DAY)) }, me: { mmr: r.mmr, games: r.games, wins: r.wins, peak: r.peak, league: l.n, col: l.col, i: l.i, next: next ? { n: next.n, at: next.min } : null, eligible: r.games >= R.MIN_GAMES }, min: R.MIN_GAMES, reward: u.rkReward || null, badges: u.badges || [] };
  };
  const top = () => accounts.allUsers().filter(u => u.rk && u.rk.s === cur().id && u.rk.games >= R.MIN_GAMES).sort((a, b) => b.rk.mmr - a.rk.mmr).slice(0, 20)
    .map((u, i) => ({ pos: i + 1, name: u.username, mmr: u.rk.mmr, league: leagueOf(u.rk.mmr).n, col: leagueOf(u.rk.mmr).col, wins: u.rk.wins, games: u.rk.games }));

  /* ---------- HTTP ---------- */
  const handles = p => p === '/api/ranked' || p === '/api/ranked/ack';
  async function handleHttp(req, res, url) {
    const { send } = accounts.http;
    if (req.method === 'OPTIONS') { send(req, res, 204, null); return true; }
    const h = String(req.headers.authorization || ''), u = accounts.fromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    if (url.pathname === '/api/ranked' && req.method === 'GET') { send(req, res, 200, Object.assign({ ok: true, top: top() }, u ? view(u) : { season: view({}).season })); return true; }
    if (!u) { send(req, res, 401, { error: 'Inicia sesión con una cuenta online.' }); return true; }
    if (url.pathname === '/api/ranked/ack' && req.method === 'POST') { u.rkReward = null; accounts.touch(); send(req, res, 200, { ok: true }); return true; }
    send(req, res, 404, { error: 'No encontrado.' }); return true;
  }
  admin.addRoutes({
    'POST /ranked/set': ({ b, s }) => { const u = accounts.find(String(b.username || '')); const m = Math.trunc(+b.mmr); if (!u) return { code: 404, error: 'No existe esa cuenta.' }; if (!(m >= 0 && m <= 4000)) return { code: 400, error: 'La puntuación debe estar entre 0 y 4000.' }; const r = rk(u); r.mmr = m; r.peak = Math.max(r.peak, m); accounts.touch(); admin.audit(s.user, 'clasificatorio-ajustar', u.username + ' → ' + m); return { ok: true, mmr: m }; },
    'GET /ranked': () => ({ season: cur(), history: doc.data.history.slice().reverse(), top: top(), leagues: S.LEAGUES }),
    'POST /ranked/close': ({ b, s }) => { if (b.confirm !== true) return { code: 400, error: 'Confirma el cierre (confirm: true): reparte premios y reinicia la puntuación de todos.' }; const r = closeSeason(s.user); admin.audit(s.user, 'temporada-cerrar', 'temporada ' + r.closed + ' · ' + r.players + ' con premio'); return Object.assign({ ok: true }, r); }
  });
  /* Lo que ve cualquiera en un perfil: la liga actual (si ha jugado clasificatorio) y las insignias de temporadas anteriores; nunca la puntuación exacta */
  const publicOf = u => { const r = u.rk && u.rk.s === cur().id && u.rk.games > 0 ? leagueOf(u.rk.mmr) : null; const b = (u.badges || []).slice(-6); return r || b.length ? { league: r ? r.n : null, col: r ? r.col : null, badges: b.map(x => ({ s: x.s, l: x.l, col: (S.LEAGUES.find(l => l.n === x.l) || {}).col })) } : null; };
  const stats = () => { const c = cur(), by = {}; let n = 0; for (const u of accounts.allUsers()) if (u.rk && u.rk.s === c.id && u.rk.games > 0) { n++; const l = leagueOf(u.rk.mmr).n; by[l] = (by[l] || 0) + 1; } return { season: c.id, daysLeft: Math.max(0, Math.ceil((c.end - now()) / DAY)), players: n, byLeague: by, closed: doc.data.history.length }; };
  return { stats, publicOf, handles, handleHttp, mmrOf, leagueOf, rk, onRoundEnd, onLeave, closeSeason, view, current: cur };
}

module.exports = { createRanked };
