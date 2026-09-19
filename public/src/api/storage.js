/* Envoltorio seguro de localStorage/sessionStorage: si el navegador lo bloquea (modo privado, iframes, etc.)
   los datos viven en memoria durante la visita y nada se rompe. */
export function safeStorage(getStore) {
  const mem = new Map();
  let real = null;
  try {
    real = getStore();
    if (!real) throw new Error('sin almacenamiento');
    real.setItem('__ppr_probe__', '1'); real.removeItem('__ppr_probe__');
  } catch (e) { real = null; }
  return {
    persistent: !!real,
    getItem(k) { try { return real ? real.getItem(k) : (mem.has(k) ? mem.get(k) : null); } catch (e) { return mem.has(k) ? mem.get(k) : null; } },
    setItem(k, v) { try { if (real) real.setItem(k, String(v)); else mem.set(k, String(v)); } catch (e) { mem.set(k, String(v)); } },
    removeItem(k) { try { if (real) real.removeItem(k); } catch (e) { /* nada */ } mem.delete(k); }
  };
}
export function defaultStorages() {
  return { local: safeStorage(() => globalThis.localStorage), session: safeStorage(() => globalThis.sessionStorage) };
}
