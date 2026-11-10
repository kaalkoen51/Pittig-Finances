import { expect, test, type Page } from '@playwright/test';

// Main flow from docs/PLAN.md "Acceptance", against the production web build (fresh IndexedDB per test).
// Runs in both projects (desktop + phone). Navigation uses hash URLs so it works with sidebar and tab bar.

/** Regex matching an accessible name that contains all parts, in any order. */
function all(...parts: string[]): RegExp {
  return new RegExp(parts.map((p) => `(?=.*${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join(''), 's');
}

async function go(page: Page, path: string, heading: string | RegExp) {
  await page.goto(`/#${path}`);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

async function save(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
}

/** Pick an existing option in a Combobox or create it ("Add “X”"). */
async function pickOrCreate(page: Page, label: RegExp, value: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: label }).fill(value);
  await dialog.getByRole('option', { name: new RegExp(value) }).first().click();
  await expect(dialog.getByRole('combobox', { name: label })).toHaveValue(value);
}

test('sale on account → client balance → payment → balance 0', async ({ page }) => {
  // 1. Product + batch
  await go(page, '/batches', 'Batches');
  await page.getByRole('button', { name: 'Add first product' }).click();
  let dialog = page.getByRole('dialog', { name: 'New product' });
  await dialog.getByLabel('Name').fill('Sambal Pittig');
  await dialog.getByLabel(/Default price/).fill('6.50');
  await save(page);

  const product = page.getByRole('region', { name: 'Sambal Pittig' });
  await expect(product).toBeVisible();
  await product.getByRole('button', { name: 'Add batch' }).click();
  dialog = page.getByRole('dialog', { name: 'New batch' });
  await dialog.getByLabel('Quantity made').fill('40');
  await save(page);
  await expect(product.getByRole('link', { name: /Left 40/ })).toBeVisible();

  // 2. Sale for a new client, not paid yet
  await go(page, '/sales', 'Sales');
  await page.getByRole('button', { name: 'New sale' }).click();
  dialog = page.getByRole('dialog', { name: 'New sale' });
  await pickOrCreate(page, /Client/, 'Toko Rasa');
  await expect(dialog.getByRole('combobox', { name: 'Product' })).toHaveValue('Sambal Pittig');
  await dialog.getByLabel(/^Quantity/).fill('4');
  await expect(dialog.getByLabel('Price each')).toHaveValue('6.50');
  await expect(dialog.getByRole('switch', { name: /Already paid/ })).not.toBeChecked();
  await save(page);
  await expect(page.getByRole('button', { name: all('Toko Rasa', '26.00', 'Open') })).toBeVisible();

  // Batch shows the units sold
  await go(page, '/batches', 'Batches');
  await expect(page.getByRole('link', { name: all('Sold 4', 'Left 36') })).toBeVisible();

  // 3. Client open balance shows it
  await go(page, '/clients', 'Clients');
  const clientRow = page.getByRole('link', { name: /Toko Rasa/ });
  await expect(clientRow).toContainText('26.00');
  await expect(clientRow).toContainText('Still open');
  await clientRow.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Toko Rasa' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main).toContainText(/Still open\s*€\s*26\.00/);

  // 4. Record payment (amount prefilled with the open balance)
  await main.getByRole('button', { name: 'Record payment' }).click();
  dialog = page.getByRole('dialog', { name: 'Record payment' });
  await expect(dialog.getByLabel('Amount')).toHaveValue('26.00');
  await save(page);

  // 5. Balance is 0
  await expect(main).toContainText(/Still open\s*€\s*0\.00/);
  await expect(main).toContainText(/Received\s*€\s*26\.00/);
  await go(page, '/sales', 'Sales');
  await expect(page.getByRole('button', { name: all('Toko Rasa', '26.00', 'Paid') })).toBeVisible();
});

test('unpaid expense with new supplier → "To pay" → mark paid', async ({ page }) => {
  await go(page, '/expenses', 'Expenses');
  await page.getByRole('button', { name: 'Add first expense' }).click();
  const dialog = page.getByRole('dialog', { name: 'New expense' });
  await dialog.getByLabel('Amount').fill('42.50');
  await dialog.getByLabel(/Description/).fill('Red chillies');
  await dialog.getByRole('radio', { name: 'Ingredients' }).click();
  await pickOrCreate(page, /Supplier/, 'Groothandel Peper');
  const paid = dialog.getByRole('switch', { name: /Already paid/ });
  await expect(paid).toBeChecked(); // default: paid
  await paid.click();
  await expect(paid).not.toBeChecked();
  await save(page);
  await expect(page.getByRole('button', { name: all('Red chillies', 'Unpaid', '42.50') })).toBeVisible();

  // Appears under suppliers owed
  await go(page, '/suppliers', 'To pay');
  const main = page.getByRole('main');
  await expect(main).toContainText(/Total still to pay\s*€\s*42\.50/);
  await main.getByRole('link', { name: /Groothandel Peper/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Groothandel Peper' })).toBeVisible();

  // Mark paid
  await main.getByRole('button', { name: /Mark as paid: Red chillies/ }).click();
  await expect(main).toContainText('Everything is paid.');
  await expect(main.getByRole('button', { name: all('Red chillies', 'paid') })).toBeVisible();

  await go(page, '/suppliers', 'To pay');
  await expect(main).not.toContainText('Total still to pay');
});

test('data survives a reload', async ({ page }) => {
  await go(page, '/clients', 'Clients');
  await page.getByRole('main').getByRole('button', { name: /Client/ }).first().click();
  await page.getByRole('dialog').getByLabel('Name').fill('Delicatessen De Kroon');
  await save(page);
  // Wait for the debounced autosave (300 ms) to reach IndexedDB, then reload.
  await page.waitForTimeout(1000);
  await go(page, '/clients', 'Clients');
  await page.reload();
  await expect(page.getByRole('link', { name: /Delicatessen De Kroon/ })).toBeVisible();
});

test('starts in English; Dutch can be chosen in Settings and is remembered', async ({ page }) => {
  await go(page, '/settings', 'Settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('radio', { name: 'Nederlands' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Instellingen' })).toBeVisible();
  await page.waitForTimeout(1000); // debounced autosave
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Instellingen' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await go(page, '/sales', 'Verkopen');
});
