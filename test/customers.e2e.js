// Browser e2e (Playwright library + node:test). Requires a built web app: `npm run web:build`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../helpers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const webDir = join(root, 'web', 'dist');
const shots = join(root, 'docs', 'screenshots');
let s, browser, page, dialogs;

before(async () => {
  assert.ok(existsSync(join(webDir, 'index.html')), 'web/dist missing: run `npm run web:build` first');
  mkdirSync(shots, { recursive: true });
  s = await startServer({ seed: true, webDir });
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await s?.close(); });

async function openApp(viewport = { width: 1280, height: 800 }) {
  await page?.close();
  page = await browser.newPage({ viewport });
  dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await page.goto(s.base + '/');
  await page.getByRole('navigation', { name: 'Customer list' }).waitFor();
}


/** Search, wait for the debounced result to settle on exactly one row, then open it. */
async function pick(query) {
  await page.getByLabel('Search customers').fill(query);
  await page.getByText('1 customer', { exact: true }).waitFor();
  assert.equal(await page.locator('.row').count(), 1);
  await page.locator('.row').first().click();
}

test('list loads all seeded customers and shows a count', async () => {
  await openApp();
  await page.getByText('12 customers').waitFor();
  assert.equal(await page.locator('.row').count(), 12);
  await page.screenshot({ path: join(shots, '01-customer-list.png') });
});

test('search narrows the list; empty search result explains itself', async () => {
  await openApp();
  await page.getByLabel('Search customers').fill('okafor');
  await page.getByText('1 customer', { exact: true }).waitFor();
  assert.equal(await page.locator('.row').count(), 1);
  await page.getByLabel('Search customers').fill('zzzzqq');
  await page.getByText(/No customers match/).waitFor();
});

test('opening a customer shows profile, summary, follow-ups, notes and order history', async () => {
  await openApp();
  await pick('okafor');
  await page.getByRole('heading', { name: 'Amara Okafor' }).waitFor();
  await page.getByRole('heading', { name: 'Order history' }).waitFor();
  assert.match(await page.locator('.stats').innerText(), /\$48\.00/);
  assert.ok(await page.getByText('Offer free shipping on next order').isVisible());
  assert.ok(await page.getByText('Asked whether the pour-over set ships to Canada.').isVisible());
  assert.ok(await page.locator('table tbody tr').count() >= 1);
  await page.screenshot({ path: join(shots, '02-customer-profile.png'), fullPage: true });
});

test('create customer: inline validation, success, then duplicate email is refused', async () => {
  await openApp();
  await page.getByRole('button', { name: 'Add customer' }).click();
  await page.getByLabel('First name').fill('Zoe');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByRole('button', { name: 'Create customer' }).click();
  await page.getByText('Email must be a valid email address').waitFor();

  await page.getByLabel('Email').fill('zoe.test@example.com');
  await page.getByRole('button', { name: 'Create customer' }).click();
  await page.getByRole('heading', { name: 'Zoe' }).waitFor();
  await page.getByText('This customer has not placed an order yet.').waitFor();

  await page.getByRole('button', { name: 'Add customer' }).click();
  await page.getByLabel('First name').fill('Zoe Again');
  await page.getByLabel('Email').fill('ZOE.TEST@example.com');
  await page.getByRole('button', { name: 'Create customer' }).click();
  await page.getByText('A customer with this email already exists').waitFor();
});

test('edit details persists', async () => {
  await openApp();
  await pick('zoe.test');
  await page.getByRole('button', { name: 'Edit details' }).click();
  await page.getByLabel('Phone').fill('+1 555 777 8888');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText(/\+1 555 777 8888/).waitFor();
});

test('follow-ups can be added and completed; notes are logged', async () => {
  await openApp();
  await pick('zoe.test');
  await page.getByLabel('Follow-up title').fill('Send welcome offer');
  await page.getByLabel('Due date').fill('2020-01-01');
  await page.getByRole('button', { name: 'Add follow-up' }).click();
  await page.getByText('Overdue').waitFor();
  await page.getByLabel('Send welcome offer').click(); // state flips after the server confirms
  await page.locator('.tasks li.done').waitFor();
  await page.getByLabel('Note', { exact: true }).fill('Prefers phone calls in the morning');
  await page.getByRole('button', { name: 'Save note' }).click();
  await page.getByText('Prefers phone calls in the morning').waitFor();
});

test('markup in notes is shown as text, never executed', async () => {
  await openApp();
  await pick('zoe.test');
  await page.getByLabel('Note', { exact: true }).fill('<img src=x onerror="alert(1)"><b>bold</b>');
  await page.getByRole('button', { name: 'Save note' }).click();
  await page.getByText('<b>bold</b>', { exact: false }).waitFor();
  assert.equal(await page.locator('.notes img').count(), 0);
  await page.waitForTimeout(300);
  assert.deepEqual(dialogs, []);
});

test('server failure shows a readable error instead of a blank screen', async () => {
  await openApp();
  await page.route('**/api/customers?*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: 'Unexpected server error' } }) }));
  await page.getByLabel('Search customers').fill('amara');
  await page.getByRole('alert').getByText('Unexpected server error').waitFor();
  await page.unroute('**/api/customers?*');
});

test('mobile layout: list first, detail replaces it, back returns', async () => {
  await openApp({ width: 390, height: 800 });
  await page.screenshot({ path: join(shots, '03-mobile-list.png') });
  await page.locator('.row').first().click();
  await page.getByRole('button', { name: 'Back to customers' }).waitFor();
  assert.equal(await page.locator('.list').isVisible(), false);
  await page.screenshot({ path: join(shots, '04-mobile-profile.png') });
  await page.getByRole('button', { name: 'Back to customers' }).click();
  await page.locator('.list').waitFor();
});
