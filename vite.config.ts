/// <reference types="vitest/config" />
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

// Served from https://naniiic137.github.io/readme-glow/ on GitHub Pages.
export default defineConfig({
  base: '/readme-glow/',
  plugins: [react(), cspMeta()],
  server: { port: 3751, strictPort: true },
  preview: { port: 3752, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Component tests opt into jsdom with a `// @vitest-environment jsdom` comment.
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 20000,
  },
});
