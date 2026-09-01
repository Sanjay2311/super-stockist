import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**'],
    // Service tests share ONE local Postgres and each TRUNCATEs every table in
    // beforeEach; running test files in parallel makes them stomp each other.
    // Serialize files. The suite is small; the cost is a second or two.
    fileParallelism: false,
  },
});
