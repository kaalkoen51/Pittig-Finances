import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Combobox, ConfirmProvider, Field, MoneyInput, Sheet, TextInput } from './index';

describe('MoneyInput', () => {
  it('emits cents for Dutch-style and English input and reformats on blur (English default)', async () => {
    const onChange = vi.fn();
    function T() {
      const [v, setV] = useState<number | null>(null);
      return (
        <Field label="Amount">
          <MoneyInput
            value={v}
            onChange={(c) => {
              setV(c);
              onChange(c);
            }}
          />
        </Field>
      );
    }
    render(<T />);
    const input = screen.getByLabelText('Amount');
    await userEvent.type(input, '1.234,5');
    expect(onChange).toHaveBeenLastCalledWith(123450);
    fireEvent.blur(input);
    expect(input).toHaveValue('1234.50');
    await userEvent.clear(input);
    fireEvent.focus(input);
    await userEvent.type(input, '1,234');
    expect(onChange).toHaveBeenLastCalledWith(123400);
    await userEvent.clear(input);
    await userEvent.type(input, '12,5');
    expect(onChange).toHaveBeenLastCalledWith(1250);
    await userEvent.clear(input);
    await userEvent.type(input, 'abc');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Combobox', () => {
  it('filters, picks with keyboard and offers create', async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn(() => 'new-id');
    render(
      <Field label="Client">
        <Combobox
          value={undefined}
          onChange={onChange}
          onCreate={onCreate}
          options={[
            { value: 'a', label: 'Toko Sari' },
            { value: 'b', label: 'Café Het Hoekje' },
          ]}
        />
      </Field>,
    );
    const input = screen.getByLabelText('Client');
    await userEvent.type(input, 'cafe');
    expect(screen.getAllByRole('option')).toHaveLength(2); // match + create
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('b');
    await userEvent.clear(input);
    await userEvent.type(input, 'New client');
    expect(screen.getByRole('option', { name: /New client/ })).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalledWith('New client');
    expect(onChange).toHaveBeenLastCalledWith('new-id');
  });
});

describe('Sheet', () => {
  it('submits on Enter and closes on Esc', async () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <Sheet open title="New sale" onClose={onClose} onSubmit={onSubmit}>
        <Field label="Name">
          <TextInput />
        </Field>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'New sale' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 'x{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding a dirty form and ignores backdrop clicks (UX review #1)', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmProvider>
        <Sheet open dirty title="New sale" onClose={onClose} onSubmit={() => {}}>
          <Field label="Name">
            <TextInput />
          </Field>
        </Sheet>
      </ConfirmProvider>,
    );
    fireEvent.mouseDown(document.querySelector('.pf-scrim')!);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    const ask = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
