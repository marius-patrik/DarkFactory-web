import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const url = process.env.WRKBENCH_SITE_URL || 'https://marius-patrik.github.io/Wrkbench/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];

page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('response', response => {
  if (response.status() >= 400 && ['script', 'stylesheet', 'document'].includes(response.request().resourceType())) {
    errors.push('HTTP ' + response.status() + ' ' + response.url());
  }
});

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (!response || !response.ok()) throw new Error('HTTP navigation failed: ' + response?.status());

  await page.locator('.app').waitFor({ state: 'visible', timeout: 25000 });
  await page.getByRole('navigation', { name: 'Workbenches' }).waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('.dv-groupview').first().waitFor({ state: 'visible', timeout: 25000 });

  await page.getByTitle('Open tool palette (⌘/Ctrl+K)').click();
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10000 });
  await page.keyboard.press('Escape');

  await page.getByTitle('Open display manager').click();
  await page.getByRole('menu').waitFor({ state: 'visible', timeout: 10000 });
  await page.keyboard.press('Escape');

  const switcher = page.getByTitle(/Switch to (light|dark) mode/);
  await switcher.click();
  await page.locator('.app').waitFor({ state: 'visible' });

  if (errors.length) throw new Error('Browser errors: ' + errors.join('\n'));
  console.log('PASS: Real published Pages URL loaded and the Cordis/Dockview shell, palette, display menu and theme toggle work.');
  console.log('URL:', page.url());
} catch (error) {
  console.error('Published-site smoke failed:', error);
  console.error('Browser errors:', errors);
  console.error('Body:', (await page.locator('body').innerText().catch(() => '')).slice(0, 4000));
  process.exitCode = 1;
} finally {
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/pages-smoke.png', fullPage: true }).catch(() => {});
  await browser.close();
}
