/* Estado del jugador: sesión + perfil, con guardado automático. Los cambios se notifican a la interfaz. */
import { defaultProfile } from '../api/playerService.js';

const clone = v => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export function createPlayerState({ service, bus }) {
  let state = { session: null, profile: null };
  const subs = new Set();
  function emit(kind) {
    for (const fn of [...subs]) { try { fn(state, kind); } catch (e) { console.error('[playerState] suscriptor', e); } }
    if (bus) bus.emit('state:change', { state, kind });
  }
  return {
    get: () => state,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    /* Carga (o crea) el perfil de la sesión iniciada */
    signIn(session) {
      let profile = service.load(session.userId);
      if (!profile) { profile = defaultProfile(session.username, { guest: session.guest }); service.save(session.userId, profile); }
      state = { session, profile };
      emit('signin'); return state;
    },
    /* Cierra la sesión. `wipe` borra también el perfil (se usa con los invitados: no se pueden recuperar). */
    signOut(opts = {}) {
      if (state.session && opts.wipe) service.remove(state.session.userId);
      state = { session: null, profile: null };
      emit('signout');
    },
    /* Cambia el perfil con una función pura (recibe una copia) y lo guarda */
    updateProfile(fn) {
      if (!state.session) return state;
      const next = fn(clone(state.profile));
      if (next && typeof next === 'object') { state = { session: state.session, profile: next }; service.save(state.session.userId, next); emit('profile'); }
      return state;
    }
  };
}
