import { AI_PROVIDERS, type AiProviderId } from './providers';

/**
 * API keys for the optional AI mode. By default a key lives in sessionStorage
 * (gone when the tab closes); "Remember on this device" moves it to
 * localStorage. Every storage call is wrapped: private browsing, disabled
 * storage or a full quota never throw.
 */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>;

export interface KeyStorage {
  session: StorageLike;
  local: StorageLike;
}

const PREFIX = 'readme-glow:ai-key:';
const keyName = (provider: AiProviderId) => `${PREFIX}${provider}`;

function browserStorage(): Partial<KeyStorage> {
  const out: Partial<KeyStorage> = {};
  try {
    if (typeof sessionStorage !== 'undefined') out.session = sessionStorage;
  } catch {
    // Access denied (e.g. storage disabled).
  }
  try {
    if (typeof localStorage !== 'undefined') out.local = localStorage;
  } catch {
    // Access denied.
  }
  return out;
}

function read(store: StorageLike | undefined, name: string): string | null {
  try {
    const value = store?.getItem(name);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function write(store: StorageLike | undefined, name: string, value: string): boolean {
  if (!store) return false;
  try {
    store.setItem(name, value);
    return true;
  } catch {
    return false;
  }
}

function remove(store: StorageLike | undefined, name: string): void {
  try {
    store?.removeItem(name);
  } catch {
    // Nothing to do.
  }
}

/** The saved key for a provider (this tab's first, then the remembered one), or null. */
export function loadKey(provider: AiProviderId, storage: Partial<KeyStorage> = browserStorage()): string | null {
  return read(storage.session, keyName(provider)) ?? read(storage.local, keyName(provider));
}

/**
 * Saves a key for this tab, or on this device when `remember` is set, and removes
 * it from the other storage. An empty key forgets it. If the device storage is
 * unavailable, the key is kept for this tab instead.
 */
export function saveKey(provider: AiProviderId, key: string, remember: boolean, storage: Partial<KeyStorage> = browserStorage()): void {
  const name = keyName(provider);
  const value = key.trim();
  if (!value) {
    remove(storage.session, name);
    remove(storage.local, name);
    return;
  }
  if (remember && write(storage.local, name, value)) {
    remove(storage.session, name);
    return;
  }
  write(storage.session, name, value);
  remove(storage.local, name);
}

/** Forgets every saved AI key, in this tab and on this device. */
export function forgetKeys(storage: Partial<KeyStorage> = browserStorage()): void {
  for (const store of [storage.session, storage.local]) {
    const names = new Set(AI_PROVIDERS.map((p) => keyName(p.id)));
    try {
      const length = typeof store?.length === 'number' ? store.length : 0;
      for (let i = 0; i < length; i++) {
        const name = store?.key?.(i);
        if (name?.startsWith(PREFIX)) names.add(name);
      }
    } catch {
      // Could not list keys; the known names are still removed.
    }
    for (const name of names) remove(store, name);
  }
}

/** Whether the provider's key is remembered on this device (localStorage). */
export function isRemembered(provider: AiProviderId, storage: Partial<KeyStorage> = browserStorage()): boolean {
  return read(storage.local, keyName(provider)) !== null;
}
