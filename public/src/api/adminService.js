/* Cliente del servidor para el acceso del administrador desde el propio juego.
   El rol de administrador solo lo concede el servidor: aquí únicamente se envían las credenciales y se guarda el token. */
export function createAdminClient({ fetchFn = globalThis.fetch, base = '' }) {
  const url = p => base + 'api/admin' + p;
  async function post(path, body, token) {
    const r = await fetchFn(url(path), { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify(body), cache: 'no-store' });
    let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
    return { status: r.status, ok: r.ok, j };
  }
  return {
    /* null si no hay servidor (versión sin servidor); {ok:false,…} si el servidor rechaza las credenciales */
    async login(identifier, password) {
      try {
        const r = await post('/login', { user: identifier, password });
        if (!r.ok) return { ok: false, status: r.status, error: r.j.error || '' };
        return { ok: true, token: r.j.token, user: r.j.user, mustChange: !!r.j.mustChange };
      } catch (e) { return null; }
    },
    async changePassword(token, current, next) {
      try { const r = await post('/password', { current, next }, token); return r.ok ? { ok: true } : { ok: false, error: r.j.error || 'No se pudo cambiar la contraseña.' }; }
      catch (e) { return { ok: false, error: 'No se pudo conectar con el servidor.' }; }
    }
  };
}
