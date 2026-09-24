/// <reference types="vitest/config" />
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { contentSecurityPolicy } from './src/lib/csp.ts';

/**
 * Adds the Content-Security-Policy <meta> tag to the built index.html.
 * Build only: the dev server's hot reload needs inline scripts and websockets.
 */
function cspMeta(): Plugin {
  return {
    name: 'readme-glow-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /(<meta charset="[^"]*"\s*\/?>)/i,
          `$1\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy()}" />`,
        );
      },
    },
  };
}

/**
 * Pretty links (/readme-glow/owner/repo): GitHub Pages answers any unknown
 * path with 404.html, so 404.html is the app itself. Its asset URLs are
 * absolute (base /readme-glow/), the address keeps its query and hash, and
 * the app reads the repository from the path.
 */
function spaFallback(): Plugin {
  let outDir = 'dist';
  return {
    name: 'readme-glow-404',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const index = resolve(outDir, 'index.html');
      if (existsSync(index)) copyFileSync(index, resolve(outDir, '404.html'));
    },
  };
}

// Served from https://naniiic137.github.io/readme-glow/ on GitHub Pages.
export default defineConfig({
  base: '/readme-glow/',
  plugins: [react(), cspMeta(), spaFallback()],
  server: { port: 3751, strictPort: true },
  preview: { port: 3752, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  // ES module worker, so the renderer's heavy extras (highlighting, KaTeX,
  // emoji) stay separate lazy chunks inside the worker too.
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Component tests opt into jsdom with a `// @vitest-environment jsdom` comment.
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 20000,
  },
});
