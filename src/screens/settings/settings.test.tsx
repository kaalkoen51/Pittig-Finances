import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import { hasUserContent } from '../../domain/calc';
import { demoData } from '../../domain/fixtures';
import { emptyData, parseAppData, serializeAppData } from '../../domain/migrate';
import type { AppData } from '../../domain/types';
import { MemoryStorage } from '../../storage/memoryStorage';

function stored(s: MemoryStorage): AppData {
  const r = parseAppData(s.text!);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

async function setup(data: AppData | null) {
  window.location.hash = '#/settings';
  const storage = new MemoryStorage(data);
  const user = userEvent.setup();
  render(<App storage={storage} />);
  await screen.findByRole('heading', { level: 1, name: 'Settings' });
  return { storage, user };
}

async function confirmDialog(user: ReturnType<typeof userEvent.setup>, button: string) {
  const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
  await user.click(within(dialog).getByRole('button', { name: button }));
}

describe('Settings', () => {
  it('changes business name and language', async () => {
    const { storage, user } = await setup(demoData());
    const name = screen.getByLabelText('Business name');
    await user.clear(name);
    await user.type(name, 'Hete Kip{Enter}');
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Nederlands' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Instellingen' })).toBeInTheDocument();
    await waitFor(() => expect(stored(storage).settings).toMatchObject({ businessName: 'Hete Kip', language: 'nl' }));
    await user.click(screen.getByRole('radio', { name: 'English' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    await waitFor(() => expect(stored(storage).settings.language).toBe('en'));
  });

  it('shows the web-only note and no update button on web', async () => {
    await setup(demoData());
    expect(screen.getByRole('note')).toHaveTextContent(/Data is stored on this device only/);
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull();
  });

  it('offers demo data only when empty, and loads it after confirming', async () => {
    const { storage, user } = await setup(emptyData());
    await user.click(screen.getByRole('button', { name: 'Load demo data' }));
    await confirmDialog(user, 'Load demo data');
    await waitFor(() => expect(hasUserContent(stored(storage))).toBe(true));
    expect(screen.queryByRole('button', { name: 'Load demo data' })).toBeNull();
  });

  it('erases all data only after two confirmations, with a backup first', async () => {
    const { storage, user } = await setup(demoData());
    await user.click(screen.getByRole('button', { name: 'Erase all data' }));
    await confirmDialog(user, 'Yes, erase');
    await confirmDialog(user, 'Erase everything');
    await waitFor(() => expect(hasUserContent(stored(storage))).toBe(false));
    expect(storage.backups[0]?.reason).toBe('pre-replace');
    expect(stored(storage).categories.length).toBeGreaterThan(0);
  });

  it('cancelling the second erase confirmation keeps the data', async () => {
    const { storage, user } = await setup(demoData());
    await user.click(screen.getByRole('button', { name: 'Erase all data' }));
    await confirmDialog(user, 'Yes, erase');
    await confirmDialog(user, 'Cancel');
    expect(hasUserContent(stored(storage))).toBe(true);
    expect(storage.backups).toHaveLength(0);
  });

  it('makes a backup now, lists it and restores it', async () => {
    const data = demoData();
    const { storage, user } = await setup(data);
    expect(await screen.findByText('No backup made yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByText(/^Last backup:/)).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    // Change data, then restore the backup.
    storage.text = serializeAppData({ ...data, clients: [] });
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await confirmDialog(user, 'Restore');
    expect(await screen.findByText('Backup restored')).toBeInTheDocument();
    expect(stored(storage).clients).toHaveLength(data.clients.length);
    expect(storage.backups.some((b) => b.reason === 'pre-restore')).toBe(true);
  });

  it('restores from a JSON file', async () => {
    const { storage, user } = await setup(emptyData());
    const file = new File([serializeAppData(demoData())], 'backup.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('restore-file'), file);
    await confirmDialog(user, 'Restore');
    await waitFor(() => expect(hasUserContent(stored(storage))).toBe(true));
  });

  it('adds, renames and archives/deletes categories', async () => {
    const { storage, user } = await setup(demoData());
    await user.click(screen.getByRole('button', { name: /New category/ }));
    let sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByLabelText('Name'), 'Rent{Enter}');
    await waitFor(() => expect(stored(storage).categories.some((c) => c.name === 'Rent')).toBe(true));

    // Unused category can be deleted.
    await user.click(screen.getByRole('button', { name: /Rent/ }));
    sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Delete' }));
    await confirmDialog(user, 'Delete');
    await waitFor(() => expect(stored(storage).categories.some((c) => c.name === 'Rent')).toBe(false));

    // Used category only offers archive.
    await user.click(screen.getByRole('button', { name: /Transport/ }));
    sheet = await screen.findByRole('dialog');
    expect(within(sheet).queryByRole('button', { name: 'Delete' })).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(stored(storage).categories.find((c) => c.id === 'demo-cat-transport')?.archived).toBe(true));
  });

  it('exports to Excel through storage.saveFile', async () => {
    const { storage, user } = await setup(demoData());
    let saved: string | null = null;
    Object.assign(storage, {
      saveFile: async (_bytes: unknown, name: string) => {
        saved = name;
        return true;
      },
    });
    await user.click(screen.getByRole('button', { name: 'Export everything to Excel' }));
    expect(await screen.findByText('Excel file saved')).toBeInTheDocument();
    expect(saved).toMatch(/^Pittig Finances \d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
