/* Controla qué pantalla está abierta. Cada pantalla es un objeto con { mount(root, ctx), show(params), hide() }. */
export function createUIManager({ root, bus }) {
  const screens = new Map();
  let current = null;
  const ui = {
    register(name, screen) { screens.set(name, { screen, mounted: false }); return ui; },
    current: () => current,
    show(name, params) {
      const target = screens.get(name); if (!target) throw new Error('Pantalla desconocida: ' + name);
      if (current && current !== name) { const prev = screens.get(current); prev.screen.hide(); }
      if (!target.mounted) { target.screen.mount(root, ui); target.mounted = true; }
      current = name; target.screen.show(params);
      if (bus) bus.emit('ui:screen', { name });
    },
    hideAll() { if (current) screens.get(current).screen.hide(); current = null; }
  };
  return ui;
}
