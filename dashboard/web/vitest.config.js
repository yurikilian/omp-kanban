import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    // Process real CSS into jsdom so getComputedStyle() reflects stylesheet
    // rules. Without this, CSS imports are stubbed and a selector that matches
    // nothing is indistinguishable from one that matches — which is exactly how
    // the ~215px ActivityRail icon defect reached production.
    css: true
  }
});
