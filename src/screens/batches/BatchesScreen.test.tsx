import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import { today } from '../../domain/dates';
import { demoData } from '../../domain/fixtures';
import { MemoryStorage } from '../../storage/memoryStorage';

describe('Batches screen', () => {
  it('shows batch cards with stats and the general costs', async () => {
    window.location.hash = '#/batches';
    render(<App storage={new MemoryStorage(demoData())} />);
    const card = await screen.findByRole('link', { name: /S-01/ });
    expect(within(card).getByText('Cost per unit')).toBeInTheDocument();
    expect(within(card).getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('General costs (not linked to a batch)')).toBeInTheDocument();
  });

  it('adds a batch with a suggested code', async () => {
    window.location.hash = '#/batches';
    render(<App storage={new MemoryStorage(demoData())} />);
    const user = userEvent.setup();
    const section = await screen.findByRole('region', { name: /Sambal Pittig/ });
    await user.click(screen.getByRole('button', { name: 'Batch' }));
    const dialog = screen.getByRole('dialog', { name: 'New batch' });
    await user.selectOptions(within(dialog).getByLabelText('Product'), 'Sambal Pittig');
    const t = today();
    expect(within(dialog).getByLabelText('Batch code')).toHaveValue(`SP-${t.slice(2, 4)}${t.slice(5, 7)}${t.slice(8, 10)}`);
    await user.type(within(dialog).getByLabelText('Quantity made'), '100{Enter}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(section).getByRole('link', { name: /SP-/ })).toBeInTheDocument();
  });

  it('adds a cost from the batch detail, prefilled with the batch', async () => {
    window.location.hash = '#/batches/demo-b-s2';
    render(<App storage={new MemoryStorage(demoData())} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Add cost to this batch/ }));
    const dialog = screen.getAllByRole('dialog').at(-1)!;
    expect(dialog).toHaveAccessibleName('Cost for batch S-02');
    expect(within(dialog).getByLabelText('Belongs to batch')).toHaveValue('demo-b-s2');
    await user.type(within(dialog).getByLabelText('Amount'), '20');
    await user.type(within(dialog).getByLabelText(/Description/), 'Palm sugar');
    await user.click(within(dialog).getByRole('radio', { name: /Ingredients/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: /Palm sugar/ })).toBeInTheDocument();
  });
});
