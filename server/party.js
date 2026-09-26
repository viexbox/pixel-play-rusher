'use strict';
/* [GRUPOS] Grupos para jugar con amigos.
   - Solo se invita a amigos (amistad en los dos sentidos y sin bloqueos). Máximo MAX_PARTY (4) y un grupo por jugador.
   - Las invitaciones caducan a los 60 s. El jefe invita, expulsa, pasa el mando y empieza la partida; si se va, manda el siguiente.
   - Al empezar, el servidor da a cada miembro un billete (token). Con él, al entrar a jugar, todos van a la MISMA sala (una con sitio
     para todo el grupo) y al MISMO equipo. Todo lo decide el servidor: el cliente solo pide.
   Mensajes (cliente → servidor): pget · pinv {u} · pacc {id} · pdec {id} · pleave · pkick {u} · plead {u} · pready {r} · pplay {mode, map}
   Mensajes (servidor → cliente): party {…} · pinvite {id, from} · pnote {m} · pgo {tok, mode, map} */
const crypto = require('crypto');

function createParty({ S, accounts, sockets, log, maxParty }) {
  const MAX = maxParty || 4, INV_MS = 60000, GO_MS = 25000;
  const parties = new Map(), byUser = new Map(), invites = new Map();   // invites: id → { id, party, from, to, until }
  const acc = () => (typeof accounts === 'function' ? accounts() : accounts);   // las cuentas se preparan después de crear el módulo: se piden al usarlas
  const userById = id => acc().allUsers().find(u => u.id === id) || null;
  const userByName = n => { const k = String(n || '').toLowerCase(); return acc().allUsers().find(u => u.username.toLowerCase() === k) || null; };
  const friends = (a, b) => !!(a && b && a.id !== b.id && (a.friends || []).includes(b.id) && (b.friends || []).includes(a.id) && !(a.blocked || []).includes(b.id) && !(b.blocked || []).includes(a.id));
  const send = (uid, msg) => { const s = JSON.stringify(msg); for (const ws of sockets(uid)) try { ws.send(s); } catch (e) { /* conexión cerrada */ } };
  const note = (uid, m) => send(uid, { t: 'pnote', m });
  const rankName = u => { const pts = (u.stats && u.stats.points) || 0; let r = S.RANKS[0]; for (const x of S.RANKS) if (pts >= x.pts) r = x; return r.n; };
  const view = p => ({ t: 'party', id: p.id, lead: (userById(p.lead) || {}).username || '', max: MAX,
    members: p.members.map(id => { const u = userById(id); return u ? { u: u.username, rl: u.verified ? 'inf' : 0, rank: rankName(u), ready: p.ready.has(id), lead: id === p.lead, on: sockets(id).length > 0 } : null; }).filter(Boolean),
    pending: [...invites.values()].filter(i => i.party === p.id && i.until > Date.now()).map(i => (userById(i.to) || {}).username).filter(Boolean) });
  const push = p => { const v = view(p); for (const id of p.members) send(id, v); };
  function create(uid) { const p = { id: crypto.randomBytes(6).toString('hex'), lead: uid, members: [uid], ready: new Set(), go: null }; parties.set(p.id, p); byUser.set(uid, p.id); return p; }
  function leave(uid) {
    const p = parties.get(byUser.get(uid)); byUser.delete(uid); if (!p) return;
    p.members = p.members.filter(x => x !== uid); p.ready.delete(uid);
    if (p.members.length <= 1) { for (const id of p.members) { byUser.delete(id); send(id, { t: 'party', id: null }); if (id !== uid) note(id, 'El grupo se ha deshecho.'); } parties.delete(p.id); for (const [k, i] of invites) if (i.party === p.id) invites.delete(k); }
    else { if (p.lead === uid) { p.lead = p.members[0]; note(p.lead, 'Ahora eres el jefe del grupo.'); } push(p); }
    send(uid, { t: 'party', id: null });
  }
  const partyOf = uid => parties.get(byUser.get(uid)) || null;

  /* Un mensaje del cliente. me = cuenta del que escribe (null si es invitado: los grupos son para cuentas online). */
  function handle(me, m) {
    if (!me) { return { t: 'pnote', m: 'Inicia sesión con una cuenta online para jugar en grupo con tus amigos.' }; }
    const now = Date.now(), p = partyOf(me.id);
    switch (m.t) {
      case 'pget': return p ? view(p) : { t: 'party', id: null };
      case 'pinv': {
        if (p && p.lead !== me.id) return { t: 'pnote', m: 'Solo el jefe del grupo puede invitar.' };
        const to = userByName(m.u);
        if (!to) return { t: 'pnote', m: 'No existe ningún jugador con ese nombre.' };
        if (!friends(me, to)) return { t: 'pnote', m: 'Solo puedes invitar a tus amigos.' };
        if (p && p.members.includes(to.id)) return { t: 'pnote', m: to.username + ' ya está en tu grupo.' };
        if (p && p.members.length >= MAX) return { t: 'pnote', m: 'El grupo está lleno (máximo ' + MAX + ').' };
        if (!sockets(to.id).length) return { t: 'pnote', m: to.username + ' no está conectado ahora mismo.' };
        const g = p || create(me.id);
        for (const [k, i] of invites) if (i.party === g.id && i.to === to.id) invites.delete(k);
        const inv = { id: crypto.randomBytes(6).toString('hex'), party: g.id, from: me.id, to: to.id, until: now + INV_MS }; invites.set(inv.id, inv);
        send(to.id, { t: 'pinvite', id: inv.id, from: { u: me.username, rl: me.verified ? 'inf' : 0 }, n: g.members.length, exp: INV_MS });
        push(g); return null;
      }
      case 'pacc': case 'pdec': {
        const inv = invites.get(m.id); invites.delete(m.id);
        if (!inv || inv.to !== me.id || inv.until < now) return { t: 'pnote', m: 'Esa invitación ya no es válida.' };
        const g = parties.get(inv.party);
        if (m.t === 'pdec') { if (g) { note(g.lead, me.username + ' ha rechazado la invitación.'); push(g); } return null; }
        if (!g) return { t: 'pnote', m: 'Ese grupo ya no existe.' };
        if (g.members.length >= MAX) return { t: 'pnote', m: 'Ese grupo ya está lleno.' };
        if (p && p.id !== g.id) leave(me.id);
        if (!g.members.includes(me.id)) { g.members.push(me.id); byUser.set(me.id, g.id); }
        for (const id of g.members) if (id !== me.id) note(id, me.username + ' se ha unido al grupo.');
        push(g); return null;
      }
      case 'pleave': if (p) leave(me.id); return null;
      case 'pkick': {
        if (!p || p.lead !== me.id) return { t: 'pnote', m: 'Solo el jefe del grupo puede expulsar.' };
        const u = userByName(m.u); if (!u || !p.members.includes(u.id) || u.id === me.id) return null;
        note(u.id, 'El jefe te ha sacado del grupo.'); leave(u.id); return null;
      }
      case 'plead': {
        if (!p || p.lead !== me.id) return null; const u = userByName(m.u); if (!u || !p.members.includes(u.id)) return null;
        p.lead = u.id; note(u.id, 'Ahora eres el jefe del grupo.'); push(p); return null;
      }
      case 'pready': { if (!p) return null; if (m.r) p.ready.add(me.id); else p.ready.delete(me.id); push(p); return null; }
      case 'pplay': {
        if (!p) return null; if (p.lead !== me.id) return { t: 'pnote', m: 'Solo el jefe del grupo puede empezar la partida.' };
        const mode = S.MODES[m.mode] ? m.mode : 'duelo', map = Number.isInteger(m.map) && S.MAPS[m.map] ? m.map : 0;
        p.go = { tok: crypto.randomBytes(9).toString('hex'), mode, map, until: now + GO_MS, room: null, team: null };
        for (const id of p.members) send(id, { t: 'pgo', tok: p.go.tok, mode, map, lead: me.username });
        p.ready.clear(); return null;
      }
    }
    return null;
  }
  /* Al entrar a jugar con un billete de grupo: dónde tiene que ir. null si el billete no vale (entonces juega normal, solo). */
  function claim(uid, tok) {
    const p = partyOf(uid); if (!p || !p.go || !tok || p.go.tok !== tok || p.go.until < Date.now()) return null;
    return { party: p, go: p.go, need: p.members.length };
  }
  return { handle, claim, leave, partyOf, _parties: parties };
}
module.exports = { createParty };
