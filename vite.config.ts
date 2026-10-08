import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
    emptyOutDir: true,
  },
  test: {
    // Pure-logic suites only: the 12 required deterministic tests exercise
    // coordinate maths, generation, physics, persistence and meshing, none of
    // which touch the DOM (Constitution: test-first, no real timers).
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Phase 1 runs `npm test` on a project with zero test files, and the phase
    // checkpoint requires that command to succeed. The flag stops being
    // load-bearing once tests/coordinate.test.ts lands in Phase 2b.
    passWithNoTests: true,
    reporters: ['default'],
  },
})
