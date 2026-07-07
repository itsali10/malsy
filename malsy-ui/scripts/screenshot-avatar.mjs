import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'avatar-check.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.addInitScript(() => {
  localStorage.setItem('malsy_token', 'screenshot-test');
  localStorage.setItem('malsy_user', JSON.stringify({
    user_id: '1',
    first_name: 'sweidan',
    last_name: 'test',
    email: 'test@example.com',
    grade_level: 8,
    role: 'student',
  }));
});

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('.welcome-teacher-stage canvas', { timeout: 30000 });
await page.waitForTimeout(2500);

const stage = page.locator('.welcome-teacher-stage');
await stage.screenshot({ path: out });
console.log('Saved', out);

await browser.close();
