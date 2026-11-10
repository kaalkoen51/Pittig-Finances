import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';
import { demoData } from './domain/fixtures';
import { MemoryStorage } from './storage/memoryStorage';

describe('App shell', () => {
  it('renders overview with navigation and the To sort item when there are todo rows', async () => {
    window.location.hash = '#/';
    render(<App storage={new MemoryStorage(demoData())} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Overzicht' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Verkopen/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Te sorteren/ }).length).toBeGreaterThan(0);
    expect(window.location.hash).toBe('#/overview');
  });

  it('hides To sort when nothing to sort, and routes detail paths to the owning screen', async () => {
    window.location.hash = '#/clients/abc';
    render(<App storage={new MemoryStorage(null)} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Klanten' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Te sorteren/ })).toBeNull();
  });

  it('shows the recovery screen for corrupt data', async () => {
    window.location.hash = '#/';
    render(<App storage={new MemoryStorage('{oops')} />);
    expect(await screen.findByText('Je gegevens konden niet worden gelezen')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Er zijn geen back-ups gevonden op dit apparaat.')).toBeInTheDocument());
  });
});
