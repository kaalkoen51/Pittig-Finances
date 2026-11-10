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
    expect(await screen.findByText('Total still to pay')).toBeInTheDocument();
    const row = screen.getByRole('link', { name: /Packaging Direct/ });
    expect(within(row).getByText('Overdue')).toBeInTheDocument();
    expect(within(row).getByText(/120\.00/)).toBeInTheDocument();
  });

  it('marks an expense as paid with undo', async () => {
    window.location.hash = '#/suppliers/demo-s-jars';
    render(<App storage={new MemoryStorage(demoData())} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Mark as paid: 150 jars with lids' }));
    expect(screen.getByText('Everything is paid.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Mark as paid: 150 jars with lids' })).toBeInTheDocument();
  });

  it('adds a supplier and offers archive instead of delete when it is used', async () => {
    window.location.hash = '#/suppliers';
    render(<App storage={new MemoryStorage(demoData())} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Supplier' }));
    const dialog = screen.getByRole('dialog', { name: 'New supplier' });
    await user.type(within(dialog).getByLabelText('Name'), 'Groothandel Jansen{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Groothandel Jansen' })).toBeInTheDocument();

    window.location.hash = '#/suppliers/demo-s-spice';
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const edit = screen.getByRole('dialog', { name: 'Edit supplier' });
    expect(within(edit).getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(within(edit).queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});
