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
  await dialog.getByRole('button', { name: 'Bewaar' }).click();
  await expect(dialog).toHaveCount(0);
}

/** Pick an existing option in a Combobox or create it ("“X” toevoegen"). */
async function pickOrCreate(page: Page, label: RegExp, value: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: label }).fill(value);
  await dialog.getByRole('option', { name: new RegExp(value) }).first().click();
  await expect(dialog.getByRole('combobox', { name: label })).toHaveValue(value);
}

test('sale on account → client balance → payment → balance 0', async ({ page }) => {
  // 1. Product + batch
  await go(page, '/batches', 'Batches');
  await page.getByRole('button', { name: 'Eerste product toevoegen' }).click();
  let dialog = page.getByRole('dialog', { name: 'Nieuw product' });
  await dialog.getByLabel('Naam').fill('Sambal Pittig');
  await dialog.getByLabel(/Standaardprijs/).fill('6,50');
  await save(page);

  const product = page.getByRole('region', { name: 'Sambal Pittig' });
  await expect(product).toBeVisible();
  await product.getByRole('button', { name: 'Batch toevoegen' }).click();
  dialog = page.getByRole('dialog', { name: 'Nieuwe batch' });
  await dialog.getByLabel('Aantal gemaakt').fill('40');
  await save(page);
  await expect(product.getByRole('link', { name: /Over 40/ })).toBeVisible();

  // 2. Sale for a new client, not paid yet
  await go(page, '/sales', 'Verkopen');
  await page.getByRole('button', { name: 'Nieuwe verkoop' }).click();
  dialog = page.getByRole('dialog', { name: 'Nieuwe verkoop' });
  await pickOrCreate(page, /Klant/, 'Toko Rasa');
  await expect(dialog.getByRole('combobox', { name: 'Product' })).toHaveValue('Sambal Pittig');
  await dialog.getByLabel(/^Aantal/).fill('4');
  await expect(dialog.getByLabel('Prijs per stuk')).toHaveValue('6,50');
  await expect(dialog.getByRole('switch', { name: /Al betaald/ })).not.toBeChecked();
  await save(page);
  await expect(page.getByRole('button', { name: all('Toko Rasa', '26,00', 'Open') })).toBeVisible();

  // Batch shows the units sold
  await go(page, '/batches', 'Batches');
  await expect(page.getByRole('link', { name: all('Verkocht 4', 'Over 36') })).toBeVisible();

  // 3. Client open balance shows it
  await go(page, '/clients', 'Klanten');
  const clientRow = page.getByRole('link', { name: /Toko Rasa/ });
  await expect(clientRow).toContainText('26,00');
  await expect(clientRow).toContainText('Nog open');
  await clientRow.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Toko Rasa' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main).toContainText(/Nog open\s*€\s*26,00/);

  // 4. Record payment (amount prefilled with the open balance)
  await main.getByRole('button', { name: 'Betaling ontvangen' }).click();
  dialog = page.getByRole('dialog', { name: 'Betaling ontvangen' });
  await expect(dialog.getByLabel('Bedrag')).toHaveValue('26,00');
  await save(page);

  // 5. Balance is 0
  await expect(main).toContainText(/Nog open\s*€\s*0,00/);
  await expect(main).toContainText(/Ontvangen\s*€\s*26,00/);
  await go(page, '/sales', 'Verkopen');
  await expect(page.getByRole('button', { name: all('Toko Rasa', '26,00', 'Betaald') })).toBeVisible();
});

test('unpaid expense with new supplier → "Te betalen" → mark paid', async ({ page }) => {
  await go(page, '/expenses', 'Uitgaven');
  await page.getByRole('button', { name: 'Eerste uitgave toevoegen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nieuwe uitgave' });
  await dialog.getByLabel('Bedrag').fill('42,50');
  await dialog.getByLabel(/Omschrijving/).fill('Rode pepers');
  await dialog.getByRole('radio', { name: 'Ingrediënten' }).click();
  await pickOrCreate(page, /Leverancier/, 'Groothandel Peper');
  const paid = dialog.getByRole('switch', { name: /Al betaald/ });
  await expect(paid).toBeChecked(); // default: paid
  await paid.click();
  await expect(paid).not.toBeChecked();
  await save(page);
  await expect(page.getByRole('button', { name: all('Rode pepers', 'Nog te betalen', '42,50') })).toBeVisible();

  // Appears under suppliers owed
  await go(page, '/suppliers', 'Te betalen');
  const main = page.getByRole('main');
  await expect(main).toContainText(/Totaal nog te betalen\s*€\s*42,50/);
  await main.getByRole('link', { name: /Groothandel Peper/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Groothandel Peper' })).toBeVisible();

  // Mark paid
  await main.getByRole('button', { name: /Zet op betaald: Rode pepers/ }).click();
  await expect(main).toContainText('Alles is betaald.');
  await expect(main.getByRole('button', { name: all('Rode pepers', 'betaald') })).toBeVisible();

  await go(page, '/suppliers', 'Te betalen');
  await expect(main).not.toContainText('Totaal nog te betalen');
});

test('data survives a reload', async ({ page }) => {
  await go(page, '/clients', 'Klanten');
  await page.getByRole('main').getByRole('button', { name: /Klant/ }).first().click();
  await page.getByRole('dialog').getByLabel('Naam').fill('Delicatessen De Kroon');
  await save(page);
  // Wait for the debounced autosave (300 ms) to reach IndexedDB, then reload.
  await page.waitForTimeout(1000);
  await go(page, '/clients', 'Klanten');
  await page.reload();
  await expect(page.getByRole('link', { name: /Delicatessen De Kroon/ })).toBeVisible();
});
