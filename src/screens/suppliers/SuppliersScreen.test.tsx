import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import { demoData } from '../../domain/fixtures';
import { MemoryStorage } from '../../storage/memoryStorage';

describe('Suppliers screen', () => {
  it('shows total owed and suppliers with overdue badge', async () => {
    window.location.hash = '#/suppliers';
    render(<App storage={new MemoryStorage(demoData())} />);
    expect(await screen.findByText('Totaal nog te betalen')).toBeInTheDocument();
    const row = screen.getByRole('link', { name: /Verpakking Direct/ });
    expect(within(row).getByText('Te laat')).toBeInTheDocument();
    expect(within(row).getByText(/120,00/)).toBeInTheDocument();
  });

  it('marks an expense as paid with undo', async () => {
    window.location.hash = '#/suppliers/demo-s-jars';
    render(<App storage={new MemoryStorage(demoData())} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Zet op betaald: 150 potten met deksel' }));
    expect(screen.getByText('Alles is betaald.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ongedaan maken' }));
    expect(screen.getByRole('button', { name: 'Zet op betaald: 150 potten met deksel' })).toBeInTheDocument();
  });

  it('adds a supplier and offers archive instead of delete when it is used', async () => {
    window.location.hash = '#/suppliers';
    render(<App storage={new MemoryStorage(demoData())} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Leverancier' }));
    const dialog = screen.getByRole('dialog', { name: 'Nieuwe leverancier' });
    await user.type(within(dialog).getByLabelText('Naam'), 'Groothandel Jansen{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Groothandel Jansen' })).toBeInTheDocument();

    window.location.hash = '#/suppliers/demo-s-spice';
    await user.click(await screen.findByRole('button', { name: 'Wijzig' }));
    const edit = screen.getByRole('dialog', { name: 'Leverancier wijzigen' });
    expect(within(edit).getByRole('button', { name: 'Archiveer' })).toBeInTheDocument();
    expect(within(edit).queryByRole('button', { name: 'Verwijder' })).toBeNull();
  });
});
