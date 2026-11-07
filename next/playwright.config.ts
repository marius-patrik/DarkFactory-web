import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',timeout:35000,expect:{timeout:12000},retries:0,
 use:{baseURL:'http://127.0.0.1:5173',...devices['Desktop Chrome'],trace:'retain-on-failure'},
 webServer:{command:'bun run dev --host 127.0.0.1',url:'http://127.0.0.1:5173/',reuseExistingServer:false,timeout:120000},
});
