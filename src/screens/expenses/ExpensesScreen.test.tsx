import { act, render, screen, within } from '@testing-library/react';
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
    const dialog = await screen.findByRole('dialog', { name: 'Nieuwe uitgave' });
    expect(window.location.hash).toBe('#/expenses');
    const user = userEvent.setup();
    await user.type(within(dialog).getByLabelText('Bedrag'), '12,50');
    await user.type(within(dialog).getByLabelText(/Omschrijving/), 'Deksels');
    await user.click(within(dialog).getByRole('radio', { name: /Verpakking/ }));
    // Smart default: last supplier used for this category.
    expect(within(dialog).getByLabelText(/Leverancier/)).toHaveValue('Verpakking Direct');
    await user.click(within(dialog).getByRole('switch', { name: /Al betaald/ }));
    expect(within(dialog).getByLabelText('Uiterlijk betalen op')).toHaveValue(addDays(today(), 30));
    await user.click(within(dialog).getByRole('button', { name: 'Bewaar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const row = (await screen.findByText('Deksels')).closest('button')!;
    expect(within(row).getByText('Nog te betalen')).toBeInTheDocument();
    expect(within(row).getByText(/12,50/)).toBeInTheDocument();
  });

  it('requires amount and category, creates a category inline, and filters unpaid', async () => {
    window.location.hash = '#/expenses';
    render(<App storage={new MemoryStorage(demoData())} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Uitgave' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Bewaar' }));
    expect(within(dialog).getAllByText('Vul dit in').length).toBe(2);
    await user.type(within(dialog).getByLabelText('Bedrag'), '5');
    await user.click(within(dialog).getByRole('button', { name: /Nieuwe categorie/ }));
    await user.type(within(dialog).getByLabelText('Nieuwe categorie'), 'Huur keuken{Enter}');
    // Enter created the category (did not submit the form).
    expect(within(dialog).getByRole('radio', { name: /Huur keuken/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Bewaar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {});
    expect(screen.getAllByText('Huur keuken').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('radio', { name: /Nog te betalen/ }));
    expect(screen.queryByRole('button', { name: /Huur keuken/ })).toBeNull();
    expect(screen.getByText('150 potten met deksel')).toBeInTheDocument();
  });

  it('opens an existing expense from ?edit=<id>', async () => {
    window.location.hash = '#/expenses?edit=demo-e-7';
    render(<App storage={new MemoryStorage(demoData())} />);
    const dialog = await screen.findByRole('dialog', { name: 'Uitgave wijzigen' });
    expect(within(dialog).getByLabelText(/Omschrijving/)).toHaveValue('Etiketten 500 st.');
    expect(window.location.hash).toBe('#/expenses');
  });
});
