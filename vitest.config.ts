import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**', 'out/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  // App components use the automatic JSX runtime (Next.js compiles them);
  // without this esbuild emits React.createElement and .tsx tests crash.
  esbuild: {
    jsx: 'automatic',
  },
});
