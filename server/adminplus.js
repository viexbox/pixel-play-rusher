'use strict';
/* Krunxa · Panel de administración: cuentas, verificados, monedas, ventas y «antes de lanzar».
   - VERIFICADOS: se escribe el nombre de la cuenta y al instante tiene el tic azul y los beneficios (los mismos que un influencer con clave: efecto dorado en las bajas,
     chat aunque esté bloqueado) más los que se configuren aquí (bono de PX y Créditos por partida, regalo al verificar). No hay ningún código que pegar.
   - MONEDAS: dar, quitar o fijar PX y Créditos, con motivo y en la auditoría.
   - VENTAS: ingresos con dinero real (Stripe y ventas manuales), reembolsos y movimientos de monedas.
   - CUENTAS: ver y gestionar cuentas (correo, verificado, eliminación).
   - ANTES DE LANZAR: comprobaciones de configuración con lo que falta y cómo arreglarlo. */
const crypto = require('crypto');

function createAdminPlus({ admin, accounts, S, log, env, getStatus, onVerified }) {
  const D = accounts.doc, now = () => Date.now(), hex = n => crypto.randomBytes(n).toString('hex');
  const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
  const err = (code, error) => ({ code, error });
  const find = name => accounts.find(String(name || ''));
  const CURR = { px: 'PX', cr: 'Créditos' };

  /* ---------- Verificados ---------- */
  const verifiedInfo = u => ({ username: u.username, since: u.verifiedAt || 0, by: u.verifiedBy || '', note: u.verifiedNote || '', px: u.px, credits: u.credits | 0, lastLogin: u.lastLogin || 0 });
  function setVerified(u, on, note, by) {
    if (on && !u.verified) {
      u.verified = true; u.verifiedAt = now(); u.verifiedBy = by; u.verifiedNote = clean(note, 80);
      const c = accounts.vcfg();
      if ((c.giftPx || c.giftCr) && !u.verifiedGift) {   // regalo de bienvenida: una sola vez por cuenta
        u.verifiedGift = true;
        if (c.giftPx) accounts.adjustPx(u.username, c.giftPx, 'regalo por verificación', by);
        if (c.giftCr) accounts.adjustCr(u.username, c.giftCr, 'regalo por verificación', by);
      }
    } else if (on) { if (note != null) u.verifiedNote = clean(note, 80); }
    else if (!on) { u.verified = false; }
    accounts.flush(); if (onVerified) onVerified(u);
  }

  /* ---------- Ventas ---------- */
  const paidOrders = () => D.orders.filter(o => o.status === 'paid' || o.status === 'manual');
  const dayKey = t => new Date(t).toISOString().slice(0, 10);
  function salesStats() {
    const t = now(), paid = paidOrders(), sum = (list) => { const m = {}; for (const o of list) m[o.currency || 'eur'] = (m[o.currency || 'eur'] || 0) + (o.amount || 0); return m; };
    const since = ms => paid.filter(o => t - o.ts < ms), today = dayKey(t);
    const cur = Object.entries(sum(paid)).sort((a, b) => b[1] - a[1])[0], main = cur ? cur[0] : (env.STORE_CURRENCY || 'eur').toLowerCase();
    const byDay = []; for (let i = 29; i >= 0; i--) { const d = dayKey(t - i * 86400000), l = paid.filter(o => dayKey(o.ts) === d && (o.currency || 'eur') === main); byDay.push({ d, amount: l.reduce((a, o) => a + (o.amount || 0), 0), n: l.length }); }
    const buyers = new Map(); for (const o of paid) { const b = buyers.get(o.user) || { user: o.user, amount: 0, px: 0, n: 0 }; b.amount += o.amount || 0; b.px += o.px || 0; b.n++; buyers.set(o.user, b); }
    const users = Object.values(D.users), manual = D.pxlog.filter(l => l.by && l.by !== 'juego');
    return {
      currency: main, storeOn: accounts.storeOn(),
      revenue: { today: sum(paid.filter(o => dayKey(o.ts) === today)), d7: sum(since(7 * 86400000)), d30: sum(since(30 * 86400000)), all: sum(paid) },
      orders: { paid: paid.filter(o => o.status === 'paid').length, manual: paid.filter(o => o.status === 'manual').length, pending: D.orders.filter(o => o.status === 'pending').length, refunded: D.orders.filter(o => o.status === 'refunded').length, other: D.orders.filter(o => !['paid', 'manual', 'pending', 'refunded'].includes(o.status)).length },
      pxSold: paid.reduce((a, o) => a + (o.px || 0), 0), average: paid.length ? Math.round(paid.reduce((a, o) => a + (o.amount || 0), 0) / paid.length) : 0,
      byDay, top: [...buyers.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
      circulation: { px: users.reduce((a, u) => a + u.px, 0), cr: users.reduce((a, u) => a + (u.credits | 0), 0), accounts: users.length },
      manualPx: { given: manual.filter(l => l.applied > 0).reduce((a, l) => a + l.applied, 0), taken: -manual.filter(l => l.applied < 0).reduce((a, l) => a + l.applied, 0) }
    };
  }

  admin.addRoutes({
    /* ----- Verificados ----- */
    'GET /verified': () => ({ cfg: accounts.vcfg(), accounts: Object.values(D.users).filter(u => u.verified).sort((a, b) => (b.verifiedAt || 0) - (a.verifiedAt || 0)).map(verifiedInfo) }),
    'POST /verified/set': ({ b, s }) => {
      const u = find(b.username); if (!u) return err(404, 'No existe ninguna cuenta con ese nombre. La persona tiene que haberse registrado antes en el juego.');
      const on = b.verified !== false, was = !!u.verified; setVerified(u, on, b.note, s.user);
      admin.audit(s.user, on ? (was ? 'verificado-nota' : 'verificar-cuenta') : 'quitar-verificado', u.username + (b.note ? ' · ' + clean(b.note, 80) : '')); log((on ? 'Cuenta verificada: ' : 'Verificado retirado: ') + u.username);
      return { ok: true, username: u.username, verified: !!u.verified, already: on && was };
    },
    'POST /verified/benefits': ({ b, s }) => { const c = accounts.setVcfg(b || {}); admin.audit(s.user, 'verificados-beneficios', JSON.stringify(c)); return { ok: true, cfg: c }; },

    /* ----- Cuentas ----- */
    'POST /accounts/delete': async ({ b, s }) => {
      const u = find(b.username); if (!u) return err(404, 'No existe ninguna cuenta con ese nombre.'); const mode = String(b.mode || '');
      if (mode === 'cancel') { u.deleteAt = 0; accounts.flush(); admin.audit(s.user, 'cuenta-eliminacion-cancelar', u.username); return { ok: true }; }
      if (mode === 'schedule') { u.deleteAt = now() + accounts.deleteDays * 86400000; accounts.flush(); admin.audit(s.user, 'cuenta-eliminacion-programar', u.username); return { ok: true, deleteAt: u.deleteAt }; }
      if (mode === 'now') { if (String(b.confirm || '').trim().toLowerCase() !== u.username.toLowerCase()) return err(400, 'Escribe el nombre exacto de la cuenta para confirmar.'); admin.audit(s.user, 'cuenta-eliminar-ahora', u.username); await accounts.removeUser(u); return { ok: true, removed: true }; }
      return err(400, 'Modo no válido.');
    },

    /* ----- Monedas ----- */
    'POST /coins/set': ({ b, s }) => {
      const cur = b.currency === 'cr' ? 'cr' : 'px', u = find(b.username); if (!u) return err(404, 'No existe ninguna cuenta con ese nombre.');
      const target = Math.trunc(+b.value); if (!Number.isFinite(target) || target < 0 || target > 100000000) return err(400, 'El saldo debe ser un número entero entre 0 y 100.000.000.');
      const have = cur === 'px' ? u.px : (u.credits | 0), delta = target - have; if (!delta) return { ok: true, applied: 0, balance: have };
      const r = cur === 'px' ? accounts.adjustPx(u.username, delta, 'fijar saldo: ' + clean(b.reason, 80), s.user) : accounts.adjustCr(u.username, delta, 'fijar saldo: ' + clean(b.reason, 80), s.user);
      if (r.error) return r; admin.audit(s.user, 'fijar-' + cur, u.username + ' ' + have + ' → ' + target + ' ' + CURR[cur] + (b.reason ? ' · ' + clean(b.reason, 80) : '')); return { ok: true, applied: r.applied, balance: cur === 'px' ? u.px : u.credits };
    },
    'GET /coins/log': () => {
      const px = D.pxlog.slice(0, 200).map(l => ({ ts: l.ts, user: l.user, cur: 'PX', delta: l.applied, balance: l.balance, reason: l.reason || '', by: l.by || '' }));
      const cr = (D.crlog || []).slice(0, 200).map(l => ({ ts: l.ts, user: l.user, cur: 'CR', delta: l.delta, balance: l.balance, reason: l.reason || '', by: /^ajuste admin/.test(l.reason || '') ? 'admin' : 'juego' }));
      return { log: px.concat(cr).sort((a, b) => b.ts - a.ts).slice(0, 200) };
    },

    /* ----- Ventas con dinero real ----- */
    'GET /sales': () => Object.assign(salesStats(), { orders_list: D.orders.slice(0, 300) }),
    'POST /orders/manual': ({ b, s }) => {
      const u = find(b.username); if (!u) return err(404, 'No existe ninguna cuenta con ese nombre.');
      const px = Math.trunc(+b.px), amount = Math.round(+String(b.amount).replace(',', '.') * 100); if (!(px > 0) || px > 1000000) return err(400, 'Los PX entregados deben ser un entero entre 1 y 1.000.000.');
      if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) return err(400, 'El importe no es válido.');
      const cur = clean(b.currency || env.STORE_CURRENCY || 'eur', 3).toLowerCase() || 'eur'; accounts.adjustPx(u.username, px, 'venta manual' + (b.note ? ': ' + clean(b.note, 60) : ''), s.user);
      const o = { id: 'manual-' + hex(4), uid: u.id, user: u.username, pack: 'manual', px, amount, currency: cur, status: 'manual', ts: now(), by: s.user, note: clean(b.note, 80) };
      D.orders.unshift(o); if (D.orders.length > 2000) D.orders.length = 2000; accounts.flush(); admin.audit(s.user, 'venta-manual', u.username + ' · ' + px + ' PX · ' + (amount / 100).toFixed(2) + ' ' + cur.toUpperCase());
      return { ok: true, order: o };
    },
    'POST /orders/refund': ({ b, s }) => {
      const o = D.orders.find(x => x.id === String(b.id || '')); if (!o) return err(404, 'No existe ese pedido.'); if (o.status !== 'paid' && o.status !== 'manual') return err(400, 'Solo se pueden reembolsar pedidos pagados o manuales.');
      const u = accounts.find(o.user); let removed = 0; if (u && b.takePx !== false) { const r = accounts.adjustPx(u.username, -o.px, 'reembolso del pedido ' + o.id, s.user); removed = r.error ? 0 : -r.applied; }
      o.status = 'refunded'; o.refundedAt = now(); o.refundedBy = s.user; o.pxRemoved = removed; accounts.flush(); admin.audit(s.user, 'reembolso', o.user + ' · ' + o.id + ' · ' + (o.amount / 100).toFixed(2) + ' ' + String(o.currency).toUpperCase() + ' · −' + removed + ' PX');
      return { ok: true, removed, note: o.id.startsWith('manual-') ? 'Pedido manual marcado como reembolsado.' : 'Marcado como reembolsado y PX retirados. Recuerda devolver el dinero desde tu panel de pagos (Stripe): esto no lo hace por ti.' };
    },

    /* ----- Antes de lanzar ----- */
    'GET /launch': () => {
      const st = getStatus(), fillBots = env.FILL_BOTS !== undefined && env.FILL_BOTS !== '' ? +env.FILL_BOTS : 4, hours = env.BACKUP_EVERY_HOURS !== undefined && env.BACKUP_EVERY_HOURS !== '' ? +env.BACKUP_EVERY_HOURS : 24;
      const it = (id, level, ok, title, good, bad) => ({ id, level, ok, title, detail: ok ? good : bad });
      const items = [
        it('storage', 'must', !st.storage.warn, 'Las cuentas se guardan de forma permanente', st.storage.mode === 'postgres' ? 'PostgreSQL: se conservan al reiniciar y redesplegar.' : 'Archivos del servidor (DATA_DIR).', 'PELIGRO: este servidor (' + st.storage.platform + ') borra su disco al reiniciar o redesplegar y no hay base de datos: se perderían TODAS las cuentas. Configura DATABASE_URL (PostgreSQL) o un disco persistente con DATA_DIR.'),
        it('mail', 'must', !!st.mail, 'Correo (SMTP) para verificar y recuperar cuentas', 'Configurado: los códigos se envían por correo.', 'Sin correo nadie puede verificar su correo ni recuperar la contraseña por su cuenta (solo tú, dándole un código desde Cuentas). Configura SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM.'),
        it('legal', 'must', !!(env.LEGAL_OWNER && env.LEGAL_EMAIL), 'Datos legales (titular y contacto)', 'Las páginas /terminos y /privacidad llevan tu nombre y correo de contacto.', 'Faltan LEGAL_OWNER y/o LEGAL_EMAIL: las páginas legales dicen «el titular de este servidor». Configúralos y revisa los textos con un profesional.'),
        it('terms', 'must', env.REQUIRE_TERMS !== '0', 'Aceptación de términos y privacidad al registrarse', 'Obligatoria.', 'Desactivada (REQUIRE_TERMS=0). Quítala antes de abrir al público.'),
        it('https', 'should', /^https:\/\//i.test(env.PUBLIC_URL || ''), 'Dirección pública con HTTPS (PUBLIC_URL)', env.PUBLIC_URL, 'PUBLIC_URL no está o no es https://: los enlaces de los correos y los pagos lo necesitan. Sin HTTPS los navegadores no protegen las contraseñas.'),
        it('backup', 'should', hours > 0, 'Copias de seguridad automáticas', 'Cada ' + hours + ' h (' + (env.BACKUP_DIR ? 'en ' + env.BACKUP_DIR : 'en el mismo servidor: descarga copias de vez en cuando') + ').', 'Desactivadas (BACKUP_EVERY_HOURS=0).'),
        it('walls', 'should', env.WALL_CHECK !== '0', 'Antitrampas de paredes', 'Activo.', 'Desactivado (WALL_CHECK=0).'),
        it('store', 'info', !!st.store, 'Tienda de pago (Stripe)', 'Activada: los pedidos aparecen en Monedas y ventas.', 'No activada. Es opcional: sin ella no se vende nada (puedes registrar ventas manuales).'),
        it('bots', 'info', fillBots > 0, 'Bots de relleno', 'Las salas se completan hasta ' + fillBots + ' jugadores (sin premios con menos de 2 personas reales).', 'Desactivados: una sala con un solo jugador espera rivales.'),
        it('photos', 'info', (env.AVATAR_MODERATION || 'off') !== 'off', 'Revisión de fotos de perfil', 'Las fotos se revisan antes de mostrarse (' + env.AVATAR_MODERATION + ').', 'Sin revisión previa: cualquiera puede subir una foto y se ve hasta que alguien la denuncie.')
      ];
      return { ready: items.filter(i => i.level === 'must').every(i => i.ok), items };
    }
  });
  return { salesStats };
}

module.exports = { createAdminPlus };
