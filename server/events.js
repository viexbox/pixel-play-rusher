'use strict';
/* PixelPlayRusher · Eventos temporales.
   - El evento diario de siempre (PX por día de la semana y arma) sigue funcionando igual dentro de las reglas de PX.
   - NUEVO · Modo destacado de la semana: cada lunes (00:00 UTC) rota Capturar zona → Solo cuchillos → Carrera de armas → Duelo por equipos. Jugarlo da +50 % de PX y Créditos
     (EVENT_FEATURED_MULT; 1 lo desactiva).
   - NUEVO · Eventos del administrador: desde el panel se lanza un evento con nombre, modo y/o arma opcionales, multiplicadores de PX y Créditos (1 a 3) y una duración limitada.
   - Varios eventos a la vez se multiplican, con un tope de ×3 en total (protege la economía). Los topes diarios de PX y Créditos siguen valiendo.
   Rutas: GET /api/events (público: eventos activos) · panel: GET /api/admin/events, POST /api/admin/events/start, POST /api/admin/events/stop */

const path = require('path');
const { Store } = require('./admin.js');
const WEEK = 7 * 86400000, EPOCH = Date.UTC(2026, 0, 5);   // lunes 5 de enero de 2026
const ROTATION = ['zona', 'cuchillos', 'carrera', 'duelo'], MAX_MULT = 3, MAX_CUSTOM = 5;

function weekOf(t) { return Math.floor((t - EPOCH) / WEEK); }
const clean = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

function createEvents({ S, accounts, admin, dataDir, log, env }) {
  env = env || process.env;
  const doc = new Store(path.join(dataDir, 'events.json'), { seq: 0, custom: [] }, log), D = doc.data;
  const FEATURED = env.EVENT_FEATURED_MULT !== undefined && env.EVENT_FEATURED_MULT !== '' ? +env.EVENT_FEATURED_MULT : 1.5, MAX_H = +env.EVENT_MAX_HOURS || 168;
  const featuredMode = t => ROTATION[((weekOf(t) % 4) + 4) % 4];
  const featured = t => {
    if (!(FEATURED > 1)) return null; const m = featuredMode(t), w = weekOf(t), M = S.MODES[m];
    return { id: 'destacado', name: 'Modo destacado: ' + M.name, desc: '+' + Math.round((FEATURED - 1) * 100) + ' % de PX y Créditos jugando a ' + M.name + ' esta semana.', mode: m, px: FEATURED, cr: FEATURED, startsAt: EPOCH + w * WEEK, endsAt: EPOCH + (w + 1) * WEEK, auto: true };
  };
  const active = t => { t = t || Date.now(); const f = featured(t); return (f ? [f] : []).concat(D.custom.filter(e => e.startsAt <= t && t < e.endsAt)); };
  /* Multiplicador de una partida: por modo y arma, con tope */
  function multFor(o, t) {
    let px = 1, cr = 1; const names = [];
    for (const e of active(t)) {
      if (e.mode && e.mode !== o.mode) continue; if (e.cls && !e.cls.includes(o.cls)) continue;
      px *= e.px; cr *= e.cr; names.push(e.name);
    }
    return { px: Math.min(px, MAX_MULT), cr: Math.min(cr, MAX_MULT), names };
  }
  const view = e => ({ id: e.id, name: e.name, desc: e.desc, mode: e.mode || '', cls: e.cls || null, px: e.px, cr: e.cr, startsAt: e.startsAt, endsAt: e.endsAt, auto: !!e.auto });

  const handles = p => p === '/api/events';
  async function handleHttp(req, res) { const { send } = accounts.http; send(req, res, req.method === 'OPTIONS' ? 204 : 200, req.method === 'OPTIONS' ? null : { ok: true, now: Date.now(), events: active().map(view) }); return true; }

  admin.addRoutes({
    'GET /events': () => { const t = Date.now(); return { now: t, active: active(t).map(view), custom: D.custom.slice(-30).reverse().map(view), next: [1, 2, 3, 4].map(i => { const m = featuredMode(t + i * WEEK); return { mode: m, name: S.MODES[m].name, startsAt: EPOCH + (weekOf(t) + i) * WEEK }; }), featuredMult: FEATURED, maxHours: MAX_H }; },
    'POST /events/start': ({ b, s }) => {
      const name = clean(b.name, 40); if (name.length < 3) return { code: 400, error: 'Pon un nombre de al menos 3 caracteres.' };
      const mode = b.mode ? String(b.mode) : ''; if (mode && !S.MODES[mode]) return { code: 400, error: 'Modo no válido.' };
      let cls = null; if (b.cls !== undefined && b.cls !== null && b.cls !== '') { const c = (Array.isArray(b.cls) ? b.cls : [b.cls]).map(Number); if (!c.every(x => Number.isInteger(x) && x >= 0 && x < S.WEAPONS.length)) return { code: 400, error: 'Arma no válida.' }; cls = c; }
      const px = +b.px, cr = +b.cr, h = +b.hours;
      if (!(px >= 1 && px <= MAX_MULT) || !(cr >= 1 && cr <= MAX_MULT)) return { code: 400, error: 'Los multiplicadores van de 1 a ' + MAX_MULT + '.' };
      if (px === 1 && cr === 1) return { code: 400, error: 'Un evento sin bonificación no sirve: sube PX o Créditos.' };
      if (!(h >= 0.001 && h <= MAX_H)) return { code: 400, error: 'La duración va de una hora a ' + Math.round(MAX_H / 24) + ' días.' };
      const t = Date.now(); if (D.custom.filter(e => t < e.endsAt).length >= MAX_CUSTOM) return { code: 400, error: 'Ya hay ' + MAX_CUSTOM + ' eventos activos. Termina alguno antes.' };
      const e = { id: ++D.seq, name, desc: clean(b.desc, 120) || (mode ? 'Bonificación jugando a ' + S.MODES[mode].name + '.' : 'Bonificación en todas las partidas.'), mode, cls, px: Math.round(px * 100) / 100, cr: Math.round(cr * 100) / 100, startsAt: t, endsAt: t + h * 3600000, by: s.user };
      D.custom.push(e); if (D.custom.length > 200) D.custom.shift(); doc.save(); admin.audit(s.user, 'evento-crear', name + ' (×' + e.px + ' PX, ×' + e.cr + ' CR' + (mode ? ', ' + mode : '') + ', ' + h + ' h)'); return { ok: true, event: view(e) };
    },
    'POST /events/stop': ({ b, s }) => { const e = D.custom.find(x => x.id === Math.trunc(+b.id)); if (!e || Date.now() >= e.endsAt) return { code: 404, error: 'Ese evento no está activo.' }; e.endsAt = Date.now(); doc.save(); admin.audit(s.user, 'evento-terminar', e.name); return { ok: true }; }
  });
  return { handles, handleHttp, active, multFor, featuredMode, featured };
}

module.exports = { createEvents, weekOf, ROTATION };
