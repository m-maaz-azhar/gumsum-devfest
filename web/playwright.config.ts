import { defineConfig, devices } from '@playwright/test'

// E2E_API=real runs the whole suite against the Flask API + Supabase + OpenAI instead of the in-browser mock.
const REAL = process.env.E2E_API === 'real'
const port = REAL ? 5182 : 5180

export default defineConfig({
  testDir: './e2e',
  timeout: REAL ? 180_000 : 90_000,
  expect: { timeout: REAL ? 30_000 : 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: REAL ? './e2e/setup-real.ts' : undefined,
  globalTeardown: './e2e/teardown.ts',
  use: {
    baseURL: process.env.BASE_URL || `http://localhost:${port}`,
    ...devices['Pixel 7'],
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.BASE_URL
    ? undefined
    : REAL
      ? [
          {
            command: '../.venv/bin/python -m flask --app run.py run --port 5000',
            cwd: '../ai/api',
            env: { CORS_ORIGINS: `http://localhost:${port}`, FLASK_ENV: 'development' },
            url: 'http://localhost:5000/v1/health',
            reuseExistingServer: true,
            timeout: 60_000,
          },
          {
            command: `npm run dev -- --port ${port} --strictPort`,
            url: `http://localhost:${port}`,
            env: { VITE_API_URL: 'http://localhost:5000/v1' },
            reuseExistingServer: true,
            timeout: 60_000,
          },
        ]
      : {
          command: `npm run dev -- --port ${port} --strictPort`,
          url: `http://localhost:${port}`,
          reuseExistingServer: true,
          timeout: 60_000,
        },
})
