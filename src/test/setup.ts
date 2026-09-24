import '@testing-library/jest-dom/vitest';

/**
 * Browser APIs jsdom lacks, for component tests that opt into
 * `// @vitest-environment jsdom`. Library tests run in plain Node, so every
 * polyfill is guarded and nothing here touches `window` unless it exists.
 */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const { installDomPolyfills } = await import('./dom');
  installDomPolyfills();
  const { afterEach } = await import('vitest');
  const { cleanup } = await import('@testing-library/react');
  // Vitest has no globals here, so Testing Library can't register its own cleanup.
  afterEach(() => cleanup());
}
