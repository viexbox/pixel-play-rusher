/* Bus de eventos mínimo: desacopla la interfaz, el estado y el motor de juego. */
export function createEventBus() {
  const map = new Map();
  const bus = {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => bus.off(evt, fn);
    },
    off(evt, fn) { const s = map.get(evt); if (s) s.delete(fn); },
    emit(evt, payload) {
      const s = map.get(evt); if (!s) return;
      for (const fn of [...s]) { try { fn(payload); } catch (e) { console.error('[bus] error en «' + evt + '»', e); } }
    }
  };
  return bus;
}
