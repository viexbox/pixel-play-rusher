/* Raíz de composición: crea los servicios y los conecta entre sí (facilita las pruebas: se le pasan almacenes falsos). */
import { createEventBus } from './state/eventBus.js';
import { createAuthService } from './api/authService.js';
import { createPlayerService } from './api/playerService.js';
import { createPlayerState } from './state/playerState.js';
import { createUIManager } from './ui/UIManager.js';

export function createApp({ storages, root, cryptoApi, now }) {
  const bus = createEventBus();
  const auth = createAuthService({ local: storages.local, session: storages.session, cryptoApi: cryptoApi || globalThis.crypto, now });
  const service = createPlayerService(storages.local);
  const state = createPlayerState({ service, bus });
  const ui = createUIManager({ root, bus });
  return { bus, auth, state, ui };
}
