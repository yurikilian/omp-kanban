import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    // db.js resolves DASHBOARD_DB at import time; without this, tests would
    // open and write to the user's real ~/.omp/agent/dashboard.db. Each test
    // file's worker gets its own isolated in-memory database.
    env: {
      DASHBOARD_DB: ':memory:'
    }
  }
});
