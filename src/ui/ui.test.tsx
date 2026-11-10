import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Combobox, Field, MoneyInput, Sheet, TextInput } from './index';

describe('MoneyInput', () => {
  it('emits cents for Dutch input and reformats on blur', async () => {
    const onChange = vi.fn();
    function T() {
      const [v, setV] = useState<number | null>(null);
      return (
        <Field label="Bedrag">
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
    const input = screen.getByLabelText('Bedrag');
    await userEvent.type(input, '1.234,5');
    expect(onChange).toHaveBeenLastCalledWith(123450);
    fireEvent.blur(input);
    expect(input).toHaveValue('1234,50');
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
      <Field label="Klant">
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
    const input = screen.getByLabelText('Klant');
    await userEvent.type(input, 'cafe');
    expect(screen.getAllByRole('option')).toHaveLength(2); // match + create
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('b');
    await userEvent.clear(input);
    await userEvent.type(input, 'Nieuwe klant');
    expect(screen.getByRole('option', { name: /Nieuwe klant/ })).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalledWith('Nieuwe klant');
    expect(onChange).toHaveBeenLastCalledWith('new-id');
  });
});

describe('Sheet', () => {
  it('submits on Enter and closes on Esc', async () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <Sheet open title="Nieuwe verkoop" onClose={onClose} onSubmit={onSubmit}>
        <Field label="Naam">
          <TextInput />
        </Field>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Nieuwe verkoop' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Naam'), 'x{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
