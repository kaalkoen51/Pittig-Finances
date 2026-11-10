import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import { addDays, today } from '../../domain/dates';
import { demoData } from '../../domain/fixtures';
import { MemoryStorage } from '../../storage/memoryStorage';

describe('Expenses screen', () => {
  it('opens the add sheet from ?new=1 and saves an unpaid expense', async () => {
    window.location.hash = '#/expenses?new=1';
    render(<App storage={new MemoryStorage(demoData())} />);
    const dialog = await screen.findByRole('dialog', { name: 'New expense' });
    expect(window.location.hash).toBe('#/expenses');
    const user = userEvent.setup();
    await user.type(within(dialog).getByLabelText('Amount'), '12.50');
    await user.type(within(dialog).getByLabelText(/Description/), 'Lids');
    await user.click(within(dialog).getByRole('radio', { name: /Packaging/ }));
    // Smart default: last supplier used for this category.
    expect(within(dialog).getByLabelText(/Supplier/)).toHaveValue('Packaging Direct');
    await user.click(within(dialog).getByRole('switch', { name: /Already paid/ }));
    expect(within(dialog).getByLabelText('Due date')).toHaveValue(addDays(today(), 30));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const row = (await screen.findByText('Lids')).closest('button')!;
    expect(within(row).getByText('Unpaid')).toBeInTheDocument();
    expect(within(row).getByText(/12\.50/)).toBeInTheDocument();
  });

  it('requires amount and category, creates a category inline, and filters unpaid', async () => {
    window.location.hash = '#/expenses';
    render(<App storage={new MemoryStorage(demoData())} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Expense' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getAllByText('Please fill this in').length).toBe(2);
    await user.type(within(dialog).getByLabelText('Amount'), '5');
    await user.click(within(dialog).getByRole('button', { name: /New category/ }));
    await user.type(within(dialog).getByLabelText('New category'), 'Kitchen rent{Enter}');
    // Enter created the category (did not submit the form).
    expect(within(dialog).getByRole('radio', { name: /Kitchen rent/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {});
    expect(screen.getAllByText('Kitchen rent').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('radio', { name: /Unpaid/ }));
    expect(screen.queryByRole('button', { name: /Kitchen rent/ })).toBeNull();
    expect(screen.getByText('150 jars with lids')).toBeInTheDocument();
  });

  it('undo of a delete also restores the import row link (review #8)', async () => {
    const data = demoData();
    const imp = data.importRows[1]!;
    data.importRows[1] = { ...imp, status: 'done', linkedId: 'demo-e-10', linkedCollection: 'expenses', linkCreated: true };
    const storage = new MemoryStorage(data);
    window.location.hash = '#/expenses?edit=demo-e-10';
    const user = userEvent.setup();
    render(<App storage={storage} />);
    const dialog = await screen.findByRole('dialog', { name: 'Edit expense' });
    await user.click(within(dialog).getByRole('button', { name: /Delete/ }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    const read = () => JSON.parse(storage.text!) as typeof data;
    await waitFor(() => expect(read().importRows.find((r) => r.id === imp.id)!.status).toBe('todo'));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      const d = read();
      expect(d.expenses.some((e) => e.id === 'demo-e-10')).toBe(true);
      expect(d.importRows.find((r) => r.id === imp.id)).toMatchObject({ status: 'done', linkedId: 'demo-e-10', linkedCollection: 'expenses', linkCreated: true });
    });
  });

  it('opens an existing expense from ?edit=<id>', async () => {
    window.location.hash = '#/expenses?edit=demo-e-7';
    render(<App storage={new MemoryStorage(demoData())} />);
    const dialog = await screen.findByRole('dialog', { name: 'Edit expense' });
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue('500 labels');
    expect(window.location.hash).toBe('#/expenses');
  });
});
