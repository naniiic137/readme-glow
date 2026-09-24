import { describe, expect, it } from 'vitest';
import { forgetKeys, isRemembered, loadKey, saveKey, type KeyStorage, type StorageLike } from './keys';

class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

class BrokenStorage implements StorageLike {
  getItem(): string | null {
    throw new DOMException('denied', 'SecurityError');
  }
  setItem(): void {
    throw new DOMException('quota', 'QuotaExceededError');
  }
  removeItem(): void {
    throw new DOMException('denied', 'SecurityError');
  }
}

function stores(): KeyStorage & { session: FakeStorage; local: FakeStorage } {
  return { session: new FakeStorage(), local: new FakeStorage() };
}

describe('AI key storage', () => {
  it('keeps keys for this tab only by default', () => {
    const s = stores();
    saveKey('gemini', '  AIza-key  ', false, s);
    expect(loadKey('gemini', s)).toBe('AIza-key');
    expect(s.session.getItem('readme-glow:ai-key:gemini')).toBe('AIza-key');
    expect(s.local.data.size).toBe(0);
    expect(isRemembered('gemini', s)).toBe(false);
    expect(loadKey('openai', s)).toBeNull();
  });

  it('"Remember on this device" moves the key to localStorage, and back', () => {
    const s = stores();
    saveKey('openai', 'sk-1', false, s);
    saveKey('openai', 'sk-2', true, s);
    expect(s.session.data.size).toBe(0);
    expect(s.local.getItem('readme-glow:ai-key:openai')).toBe('sk-2');
    expect(isRemembered('openai', s)).toBe(true);
    expect(loadKey('openai', s)).toBe('sk-2');

    saveKey('openai', 'sk-3', false, s);
    expect(s.local.data.size).toBe(0);
    expect(isRemembered('openai', s)).toBe(false);
    expect(loadKey('openai', s)).toBe('sk-3');
  });

  it('forgets a key when saved empty, and forgets everything on request', () => {
    const s = stores();
    saveKey('gemini', 'g', true, s);
    saveKey('gemini', '   ', true, s);
    expect(loadKey('gemini', s)).toBeNull();

    saveKey('gemini', 'g', true, s);
    saveKey('openai', 'o', false, s);
    s.local.setItem('readme-glow:ai-key:old-provider', 'x');
    s.local.setItem('theme', 'aurora');
    forgetKeys(s);
    expect(loadKey('gemini', s)).toBeNull();
    expect(loadKey('openai', s)).toBeNull();
    expect([...s.local.data.keys()]).toEqual(['theme']);
    expect(s.session.data.size).toBe(0);
  });

  it('keeps the key for this tab when device storage is full or blocked', () => {
    const s = { session: new FakeStorage(), local: new BrokenStorage() };
    expect(() => saveKey('gemini', 'g', true, s)).not.toThrow();
    expect(loadKey('gemini', s)).toBe('g');
    expect(isRemembered('gemini', s)).toBe(false);
  });

  it('never throws when storage is unavailable', () => {
    const broken = { session: new BrokenStorage(), local: new BrokenStorage() };
    expect(() => saveKey('gemini', 'g', false, broken)).not.toThrow();
    expect(loadKey('gemini', broken)).toBeNull();
    expect(isRemembered('gemini', broken)).toBe(false);
    expect(() => forgetKeys(broken)).not.toThrow();
    // No browser storage at all (this test runs in Node).
    expect(() => saveKey('ollama', 'x', true)).not.toThrow();
    expect(loadKey('ollama')).toBeNull();
    expect(() => forgetKeys()).not.toThrow();
  });
});
