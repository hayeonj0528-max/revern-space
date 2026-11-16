import { defineConfig } from '@playwright/test';
export const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', timeout: 120000, expect: { timeout: 15000 }, workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:5174', viewport: { width: 1440, height: 1000 }, launchOptions: { executablePath: chromePath, args: ['--autoplay-policy=no-user-gesture-required'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  // Isolate automated sessions from anyone using the normal preview.
  webServer: process.env.TEST_BASE_URL ? undefined : [
    { command: 'node --import tsx server/index.ts', env: { PORT: '2568', HOST: '127.0.0.1', ALLOWED_ORIGINS: 'http://127.0.0.1:5174', MAX_CLIENTS: '24', RECONNECT_GRACE_MS: '15000' }, url: 'http://127.0.0.1:2568/api/health', reuseExistingServer: false },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174', env: { REVERN_SERVER_PORT: '2568' }, url: 'http://127.0.0.1:5174', reuseExistingServer: false }
  ]
});
