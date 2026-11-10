import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import { demoData } from '../../domain/fixtures';
import { today } from '../../domain/dates';
import { MemoryStorage } from '../../storage/memoryStorage';

async function lastSave(storage: MemoryStorage) {
  await waitFor(() => expect(storage.saves.length).toBeGreaterThan(0), { timeout: 2000 });
  return storage.saves[storage.saves.length - 1]!;
}

describe('sales flows', () => {
  it('overview first run explains three steps', async () => {
    window.location.hash = '#/overview';
    render(<App storage={new MemoryStorage(null)} />);
    expect(await screen.findByText('Welkom bij Pittig Finances')).toBeInTheDocument();
    expect(screen.getByText('Leg een verkoop vast')).toBeInTheDocument();
  });

  it('overview with data shows owed-to-you and recent activity; + Verkoop opens the sale sheet', async () => {
    window.location.hash = '#/overview';
    const user = userEvent.setup();
    render(<App storage={new MemoryStorage(demoData())} />);
    expect(await screen.findByText('Jij krijgt nog')).toBeInTheDocument();
    expect(screen.getByText('Recent')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verkoop' }));
    expect(await screen.findByRole('dialog', { name: 'Nieuwe verkoop' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/sales');
  });

  it('adds a paid sale for a new client: creates client, sale and payment', async () => {
    window.location.hash = '#/sales';
    const storage = new MemoryStorage(demoData());
    const user = userEvent.setup();
    render(<App storage={storage} />);
    await user.click(await screen.findByRole('button', { name: 'Verkoop' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nieuwe verkoop' });
    const d = within(dialog);
    await user.type(d.getByRole('combobox', { name: /Klant/ }), 'Nieuwe Winkel');
    await user.click(d.getByRole('option', { name: /Nieuwe Winkel/ }));
    await user.type(d.getByRole('combobox', { name: /^Product/ }), 'Sambal');
    await user.click(d.getByRole('option', { name: /Sambal Pittig/ }));
    const qty = d.getByLabelText(/Aantal/);
    await user.clear(qty);
    await user.type(qty, '4');
    await user.click(d.getByRole('switch', { name: /Al betaald/ }));
    await user.click(d.getByRole('button', { name: 'Bewaar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    const saved = await lastSave(storage);
    const client = saved.clients.find((c) => c.name === 'Nieuwe Winkel')!;
    expect(client).toBeTruthy();
    const sale = saved.sales.find((s) => s.clientId === client.id)!;
    expect(sale.date).toBe(today());
    expect(sale.items).toEqual([{ productId: 'demo-p-sambal', batchId: 'demo-b-s2', quantity: 4, unitPrice: 650 }]);
    const pay = saved.payments.filter((p) => p.saleId === sale.id);
    expect(pay).toEqual([expect.objectContaining({ clientId: client.id, amount: 2600, date: sale.date })]);
    expect(saved.settings.lastUsed).toMatchObject({ clientId: client.id, productId: 'demo-p-sambal' });
  });

  it('client detail shows summary and records a payment', async () => {
    window.location.hash = '#/clients/demo-c-toko';
    const storage = new MemoryStorage(demoData());
    const user = userEvent.setup();
    render(<App storage={storage} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Toko Sari' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Betaling ontvangen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Betaling ontvangen' });
    const amount = within(dialog).getByLabelText('Bedrag') as HTMLInputElement;
    expect(amount.value).not.toBe('');
    await user.click(within(dialog).getByRole('button', { name: 'Bewaar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    const saved = await lastSave(storage);
    expect(saved.payments.length).toBe(demoData().payments.length + 1);
  });
});
