import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Same `~` alias as tsconfig. Vitest runs through Vite, so `import.meta.glob` in lib/cms.ts works as in the build.
export default defineConfig({
  resolve: { alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) } },
  // The tests assert on the committed fixtures, so they never read a locally pulled CMS export.
  test: { include: ['tests/**/*.test.ts'], environment: 'node', env: { SITE_CONTENT: 'fixtures' } },
});
