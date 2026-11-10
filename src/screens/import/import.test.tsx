import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { demoData } from '../../domain/fixtures';
import { parseAppData } from '../../domain/migrate';
import type { AppData } from '../../domain/types';
import { buildWorkbook, workbookBytes } from '../../excel/export';
import { MemoryStorage } from '../../storage/memoryStorage';

function stored(s: MemoryStorage): AppData {
  const r = parseAppData(s.text!);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

async function setup(hash = '#/import', data: AppData = demoData()) {
  window.location.hash = hash;
  const storage = new MemoryStorage(data);
  const user = userEvent.setup();
  render(<App storage={storage} />);
  await screen.findByRole('heading', { level: 1, name: 'To sort' });
  return { storage, user };
}

const card = (name: RegExp) => screen.getByRole('article', { name });

describe('To sort screen', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('turns a positive row into a payment with the exactly-matching client prefilled, and can undo', async () => {
    const { storage, user } = await setup();
    const row = card(/Café Het Hoekje/);
    expect(within(row).getByRole('combobox', { name: 'Client' })).toHaveValue('Café Het Hoekje');
    expect(within(row).getByText('Same name as at the bank')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Save as payment' }));
    expect(screen.queryByRole('article', { name: /Café Het Hoekje/ })).toBeNull();
    await waitFor(() => {
      const d = stored(storage);
      const imp = d.importRows.find((r) => r.id === 'demo-imp-1')!;
      expect(imp).toMatchObject({ status: 'done', linkedCollection: 'payments' });
      expect(d.payments.find((p) => p.id === imp.linkedId)).toMatchObject({ clientId: 'demo-c-hoekje', amount: 7500, method: 'bank' });
    });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('article', { name: /Café Het Hoekje/ })).toBeInTheDocument();
    await waitFor(() => expect(stored(storage).payments).toHaveLength(demoData().payments.length));
  });

  it('turns a negative row into a paid expense with a category', async () => {
    const { storage, user } = await setup();
    const row = card(/bol\.com/);
    const save = within(row).getByRole('button', { name: 'Save as expense' });
    expect(save).toBeDisabled();
    await user.click(within(row).getByRole('radio', { name: 'Other' }));
    await user.click(save);
    await waitFor(() => {
      const d = stored(storage);
      const imp = d.importRows.find((r) => r.id === 'demo-imp-2')!;
      expect(imp.status).toBe('done');
      const e = d.expenses.find((x) => x.id === imp.linkedId)!;
      expect(e).toMatchObject({ amount: 1899, categoryId: 'demo-cat-other', paidOn: imp.date, description: 'BOL.COM ORDER FUNNELS' });
      expect(e.supplierId).toBeUndefined();
    });
  });

  it('ignores a row, shows it under done/ignored and moves it back', async () => {
    const { user } = await setup();
    await user.click(within(card(/bol\.com/)).getByRole('button', { name: 'Ignore' }));
    expect(screen.queryByRole('article', { name: /bol\.com/ })).toBeNull();
    await user.click(screen.getByRole('switch', { name: /Show done and ignored/ }));
    expect(screen.getByText('Ignored', { selector: '.pf-badge' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move back' }));
    expect(await screen.findByRole('article', { name: /bol\.com/ })).toBeInTheDocument();
  });

  it('links a row to an existing payment via "Already in my books"', async () => {
    const data = demoData();
    const row = data.importRows[0]!;
    data.payments.push({ id: 'pay-x', date: row.date, clientId: 'demo-c-hoekje', amount: row.amount });
    const { storage, user } = await setup('#/import', data);
    const c = card(/Café Het Hoekje/);
    await user.click(within(c).getByRole('radio', { name: 'Already in my books (1)' }));
    expect(within(c).getByRole('radio', { name: /Payment Café Het Hoekje/ })).toBeChecked();
    await user.click(within(c).getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(stored(storage).importRows.find((r) => r.id === row.id)).toMatchObject({ status: 'done', linkedId: 'pay-x' }));
    expect(stored(storage).payments).toHaveLength(data.payments.length);
  });

  it('matching a bank row to an unpaid expense marks it paid on the bank date; undo restores it (review #6)', async () => {
    const data = demoData();
    const row = data.importRows[1]!; // bol.com −18,99
    data.expenses.push({ id: 'exp-open', date: row.date, categoryId: 'demo-cat-other', description: 'Funnels', amount: 1899, paidOn: null });
    const { storage, user } = await setup('#/import', data);
    const c = card(/bol\.com/);
    // An open bill with the same amount: the row starts on "Already in my books".
    expect(within(c).getByRole('radio', { name: 'Already in my books (1)' })).toBeChecked();
    await user.click(within(c).getByRole('button', { name: 'Mark bill as paid' }));
    await waitFor(() => {
      const d = stored(storage);
      expect(d.importRows.find((r) => r.id === row.id)).toMatchObject({ status: 'done', linkedId: 'exp-open' });
      expect(d.importRows.find((r) => r.id === row.id)!.linkCreated).toBeUndefined();
      expect(d.expenses.find((e) => e.id === 'exp-open')!.paidOn).toBe(row.date);
    });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      const d = stored(storage);
      expect(d.expenses.find((e) => e.id === 'exp-open')!.paidOn).toBeNull();
      expect(d.importRows.find((r) => r.id === row.id)!.status).toBe('todo');
    });
  });

  it('reopening a handled row offers to delete the payment it created (default on), with undo (review #9)', async () => {
    const { storage, user } = await setup();
    await user.click(within(card(/Café Het Hoekje/)).getByRole('button', { name: 'Save as payment' }));
    await waitFor(() => expect(stored(storage).importRows.find((r) => r.id === 'demo-imp-1')).toMatchObject({ status: 'done', linkCreated: true }));
    const paymentId = stored(storage).importRows.find((r) => r.id === 'demo-imp-1')!.linkedId!;
    await user.click(screen.getByRole('switch', { name: /Show done and ignored/ }));
    await user.click(screen.getByRole('button', { name: 'Move back' }));
    const dlg = await screen.findByRole('alertdialog', { name: 'Move back to “To sort”?' });
    expect(within(dlg).getByRole('switch', { name: /Also delete the linked payment/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(dlg).getByRole('button', { name: 'Move back' }));
    await waitFor(() => {
      const d = stored(storage);
      expect(d.payments.some((p) => p.id === paymentId)).toBe(false);
      expect(d.importRows.find((r) => r.id === 'demo-imp-1')).toMatchObject({ status: 'todo' });
    });
    await user.click(screen.getAllByRole('button', { name: 'Undo' }).at(-1)!);
    await waitFor(() => {
      const d = stored(storage);
      expect(d.payments.some((p) => p.id === paymentId)).toBe(true);
      expect(d.importRows.find((r) => r.id === 'demo-imp-1')).toMatchObject({ status: 'done', linkedId: paymentId });
    });
  });

  it('reopening a row that was matched to an existing payment keeps it by default (review #9)', async () => {
    const data = demoData();
    const row = data.importRows[0]!;
    data.payments.push({ id: 'pay-x', date: row.date, clientId: 'demo-c-hoekje', amount: row.amount, method: 'bank' });
    data.importRows[0] = { ...row, status: 'done', linkedId: 'pay-x', linkedCollection: 'payments' };
    const { storage, user } = await setup('#/import', data);
    await user.click(screen.getByRole('switch', { name: /Show done and ignored/ }));
    await user.click(screen.getByRole('button', { name: 'Move back' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByRole('switch', { name: /Also delete the linked payment/ })).toHaveAttribute('aria-checked', 'false');
    await user.click(within(dlg).getByRole('button', { name: 'Move back' }));
    await waitFor(() => expect(stored(storage).importRows.find((r) => r.id === row.id)!.status).toBe('todo'));
    expect(stored(storage).payments.some((p) => p.id === 'pay-x')).toBe(true);
  });
});

describe('Import wizard', () => {
  const csv = '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"\n' + '"20260312";"Toko Sari";"NL01";"NL02";"GT";"Bij";"125,00";"Online";"Factuur 12"\n' + '"20260313";"Verpakking Direct";"NL01";"NL03";"IC";"Af";"1.234,56";"Incasso";"Potten"\n';

  it('imports a bank CSV with auto-guessed columns, backs up first and skips duplicates next time', async () => {
    const { storage, user } = await setup('#/import?wizard=1');
    const dialog = await screen.findByRole('dialog');
    await user.upload(within(dialog).getByTestId('import-file'), new File([csv], 'ING.csv', { type: 'text/csv' }));
    expect(await within(dialog).findByText('Which column is what?')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Date')).toHaveDisplayValue('Column A: Datum');
    expect(within(dialog).getByLabelText('Debit / Credit')).toHaveDisplayValue('Column F: Af Bij');
    expect(within(dialog).getByText('Potten', { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText('2 rows found')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Import 2 rows' }));
    expect(await screen.findByText('2 rows added, 0 duplicates skipped')).toBeInTheDocument();
    expect(storage.backups[0]?.reason).toBe('pre-import');
    await waitFor(() => {
      const rows = stored(storage).importRows.filter((r) => r.source === 'ING.csv');
      expect(rows.map((r) => r.amount).sort((a, b) => a - b)).toEqual([-123456, 12500]);
    });

    await user.click(screen.getByRole('button', { name: 'Import bank statement' }));
    const again = await screen.findByRole('dialog');
    await user.upload(within(again).getByTestId('import-file'), new File([csv], 'ING (1).csv', { type: 'text/csv' }));
    await user.click(await within(again).findByRole('button', { name: 'Import 2 rows' }));
    expect(await screen.findByText('No new rows: 2 duplicates skipped')).toBeInTheDocument();
  });

  it('lets the user change the mapping and shows unreadable rows', async () => {
    const { user } = await setup('#/import?wizard=1');
    const dialog = await screen.findByRole('dialog');
    await user.upload(within(dialog).getByTestId('import-file'), new File([csv], 'ING.csv'));
    await within(dialog).findByText('Which column is what?');
    await user.selectOptions(within(dialog).getByLabelText('Date'), 'Column B: Naam / Omschrijving');
    expect(within(dialog).getAllByText('date unreadable')).toHaveLength(2);
    expect(within(dialog).getByRole('button', { name: 'Import 0 rows' })).toBeDisabled();
  });

  it('shows an error for unsupported files', async () => {
    const { user } = await setup('#/import?wizard=1');
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByTestId('import-file');
    input.removeAttribute('accept');
    await user.upload(input, new File(['x'], 'scan.pdf'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('not supported');
  });

  it('recognises our own export and updates clients without duplicates', async () => {
    const data = demoData();
    const wb = await buildWorkbook(data, 'en');
    wb.getWorksheet('Clients')!.addRow([null, 'New Shop']);
    const bytes = await workbookBytes(wb);
    const { storage, user } = await setup('#/import?wizard=1', data);
    const dialog = await screen.findByRole('dialog');
    await user.upload(within(dialog).getByTestId('import-file'), new File([bytes], 'export.xlsx'));
    expect(await within(dialog).findByText('Pittig Finances file')).toBeInTheDocument();
    expect(within(dialog).getByText('1 new · 0 updated · 4 unchanged')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Update' }));
    expect(await screen.findByText('1 added, 0 updated')).toBeInTheDocument();
    await waitFor(() => expect(stored(storage).clients.map((c) => c.name)).toContain('New Shop'));
    expect(stored(storage).clients).toHaveLength(data.clients.length + 1);
  });
});
