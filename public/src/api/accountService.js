/* Cuentas online: registro con nombre de usuario único, acceso y cierre de sesión contra el servidor del juego.
   Si no hay servidor (versión sin servidor), available() devuelve false y se usan las cuentas locales del navegador. */
export function createAccountClient({ fetchFn = globalThis.fetch, base = '', storage = null }) {
  const url = p => base + 'api/' + p;
  let known = null; // ¿el servidor tiene cuentas? (se pregunta una vez)
  async function post(path, body, token) {
    const r = await fetchFn(url(path), { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify(body || {}), cache: 'no-store' });
    let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
    return { ok: r.ok, status: r.status, j };
  }
  return {
    async available() {
      if (known !== null) return known;
      try { const r = await fetchFn(url('status'), { cache: 'no-store' }); const j = await r.json(); known = !!j.accounts; } catch (e) { return false; }
      return known;
    },
    /* {ok, token, profile} · {ok:false, status, error} · null si no hay conexión */
    async register(username, email, password) {
      try { const r = await post('auth/register', { username, email, password }); return r.ok ? { ok: true, token: r.j.token, profile: r.j.profile } : { ok: false, status: r.status, error: r.j.error || 'No se pudo crear la cuenta.' }; } catch (e) { return null; }
    },
    async login(identifier, password) {
      try { const r = await post('auth/login', { identifier, password }); return r.ok ? { ok: true, token: r.j.token, profile: r.j.profile } : { ok: false, status: r.status, error: r.j.error || 'No se pudo entrar.' }; } catch (e) { return null; }
    },
    async logout() {
      const token = storage ? storage.getItem('ppr.acct') : null; if (!token) return;
      try { await post('auth/logout', {}, token); } catch (e) { /* sin conexión: el token caduca solo */ }
    }
  };
}
