import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';
import { demoData } from './domain/fixtures';
import { emptyData, serializeAppData } from './domain/migrate';
import { MemoryStorage } from './storage/memoryStorage';

describe('App shell', () => {
  it('renders overview with navigation and the To sort item when there are todo rows', async () => {
    window.location.hash = '#/';
    render(<App storage={new MemoryStorage(demoData())} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Sales/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /To sort/ }).length).toBeGreaterThan(0);
    expect(window.location.hash).toBe('#/overview');
  });

  it('saved data in Dutch stays Dutch; new data starts in English', async () => {
    window.location.hash = '#/';
    const nl = demoData();
    nl.settings = { ...nl.settings, language: 'nl' };
    const { unmount } = render(<App storage={new MemoryStorage(nl)} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Overzicht' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Verkopen/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('Jij krijgt nog')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('nl');
    unmount();
    window.location.hash = '#/';
    const s = new MemoryStorage(null);
    render(<App storage={s} />);
    expect(await screen.findByText('Welcome to Pittig Finances')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('hides To sort when nothing to sort, and routes detail paths to the owning screen', async () => {
    window.location.hash = '#/clients/abc';
    render(<App storage={new MemoryStorage(null)} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Clients' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /To sort/ })).toBeNull();
  });

  it('shows the recovery screen for corrupt data', async () => {
    window.location.hash = '#/';
    render(<App storage={new MemoryStorage('{oops')} />);
    expect(await screen.findByText('Your data could not be read')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No backups were found on this device.')).toBeInTheDocument());
  });

  it('recovery offers the newest backup that passes validation, not a damaged one (review #4)', async () => {
    window.location.hash = '#/';
    const s = new MemoryStorage('{oops');
    const good = demoData('2026-03-31');
    s.backups = [
      { id: 'b-damaged', createdAt: '2026-03-12T10:00:00.000Z', reason: 'pre-restore', text: '{oops' },
      { id: 'b-good', createdAt: '2026-03-11T09:00:00.000Z', reason: 'daily', text: serializeAppData(good) },
    ];
    const user = userEvent.setup();
    render(<App storage={s} />);
    const btn = await screen.findByRole('button', { name: /Restore latest backup \(.*11.*\)/ });
    await user.click(btn);
    await waitFor(() => expect(s.text).toBe(serializeAppData(good)));
  });

  it('recovery asks before restoring a file, and again before restoring an empty dataset (review #1)', async () => {
    window.location.hash = '#/';
    const s = new MemoryStorage('{oops');
    const user = userEvent.setup();
    const { container } = render(<App storage={s} />);
    await screen.findByText('Your data could not be read');
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File([serializeAppData(emptyData())], 'leeg.json', { type: 'application/json' }));
    const first = await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    await user.click(within(first).getByRole('button', { name: 'Restore' }));
    const second = await screen.findByRole('alertdialog', { name: 'This backup is empty' });
    await user.click(within(second).getByRole('button', { name: 'Cancel' }));
    expect(s.text).toBe('{oops');
    expect(screen.getByText('Your data could not be read')).toBeInTheDocument();
  });
});
