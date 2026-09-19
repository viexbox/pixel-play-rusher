/* Persistencia del perfil del jugador (hoy en localStorage; mañana, fetch a la API). */
const PROFILE_PREFIX = 'ppr.profile.';
export const PROFILE_VERSION = 1;

export function defaultProfile(displayName, opts = {}) {
  return {
    version: PROFILE_VERSION,
    displayName,
    title: opts.guest ? 'Invitado' : 'Novato',
    level: 1, xp: 0,
    gold: 500, gems: 10,                       // valores de partida (marcador de posición hasta tener tienda)
    avatar: 'a1', unlockedAvatars: ['a1', 'a2', 'a3'],
    heroes: { owned: ['h1'], equipped: 'h1' },
    pets: { owned: [], equipped: null },
    stats: { games: 0, wins: 0, kills: 0, deaths: 0, cups: 0 },
    settings: { music: 0.6, sfx: 0.8 }
  };
}
/* Completa con valores por defecto lo que falte (perfiles guardados con una versión anterior). */
function mergeDefaults(base, saved) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return saved === undefined ? base : saved;
  const out = {};
  for (const k of Object.keys(base)) out[k] = mergeDefaults(base[k], saved && typeof saved === 'object' ? saved[k] : undefined);
  if (saved && typeof saved === 'object') for (const k of Object.keys(saved)) if (!(k in out)) out[k] = saved[k];
  return out;
}
export function createPlayerService(storage) {
  return {
    load(userId) {
      try {
        const raw = storage.getItem(PROFILE_PREFIX + userId); if (!raw) return null;
        const saved = JSON.parse(raw); if (!saved || typeof saved !== 'object') return null;
        return mergeDefaults(defaultProfile(saved.displayName || 'Jugador'), saved);
      } catch (e) { return null; }
    },
    save(userId, profile) { storage.setItem(PROFILE_PREFIX + userId, JSON.stringify(profile)); },
    remove(userId) { storage.removeItem(PROFILE_PREFIX + userId); }
  };
}
