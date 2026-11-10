import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoData } from '../domain/fixtures';
import { emptyData, serializeAppData } from '../domain/migrate';
import { MemoryStorage } from '../storage/memoryStorage';
import { isEmptyReplaceError, StoreProvider, useActions, useAppStatus, useData, useDerived, type Actions } from './store';

let actions!: Actions;
function Probe() {
  actions = useActions();
  const data = useData();
  const status = useAppStatus();
  const derived = useDerived('2026-03-31');
  return (
    <div>
      <span data-testid="status">{status.status}</span>
      <span data-testid="clients">{data.clients.length}</span>
      <span data-testid="owed">{derived.owedToYou}</span>
    </div>
  );
}
const renderWith = (storage: MemoryStorage) =>
  render(
    <StoreProvider storage={storage}>
      <Probe />
    </StoreProvider>,
  );

describe('StoreProvider', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('first run seeds and saves categories', async () => {
    const s = new MemoryStorage(null);
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(s.saves).toHaveLength(1);
    expect(s.saves[0]!.categories.length).toBe(8);
  });

  it('loads, edits and autosaves debounced', async () => {
    const s = new MemoryStorage(demoData('2026-03-31'));
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('clients').textContent).toBe('4'));
    expect(screen.getByTestId('owed').textContent).toBe(String(14900 + 7500 + 13200));
    act(() => {
      actions.upsert('clients', { id: 'x1', name: 'Nieuw', archived: false });
      actions.upsert('clients', { id: 'x2', name: 'Nieuw 2', archived: false });
    });
    expect(screen.getByTestId('clients').textContent).toBe('6');
    expect(s.saves).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(s.saves).toHaveLength(1);
    expect(s.saves[0]!.clients).toHaveLength(6);
  });

  it('flushes on close', async () => {
    const s = new MemoryStorage(demoData('2026-03-31'));
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    act(() => actions.updateSettings({ businessName: 'Heet' }));
    await act(async () => {
      await s.close();
    });
    expect(s.saves.at(-1)!.settings.businessName).toBe('Heet');
  });

  it('refuses to remove referenced items, allows archive', async () => {
    const s = new MemoryStorage(demoData('2026-03-31'));
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(actions.isReferenced('clients', 'demo-c-toko')).toBe(true);
    let ok = true;
    act(() => {
      ok = actions.remove('clients', 'demo-c-toko');
    });
    expect(ok).toBe(false);
    expect(screen.getByTestId('clients').textContent).toBe('4');
    act(() => actions.archive('clients', 'demo-c-toko', true));
    await act(async () => {
      await actions.flush();
    });
    expect(s.saves.at(-1)!.clients.find((c) => c.id === 'demo-c-toko')!.archived).toBe(true);
  });

  it('removing a sale unlinks its payments', async () => {
    const s = new MemoryStorage(demoData('2026-03-31'));
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    act(() => {
      actions.remove('sales', 'demo-sale-1');
    });
    await act(async () => {
      await actions.flush();
    });
    const saved = s.saves.at(-1)!;
    expect(saved.sales.some((x) => x.id === 'demo-sale-1')).toBe(false);
    expect(saved.payments.find((p) => p.id === 'demo-pay-1')!.saleId).toBeUndefined();
  });

  it('enters recovery mode on corrupt data and never saves', async () => {
    const corrupt = '{"version":1,"clients":[{"id":';
    const s = new MemoryStorage(corrupt);
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('recovery'));
    act(() => actions.upsert('clients', { id: 'x', name: 'x', archived: false }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await actions.flush();
    });
    expect(s.saves).toHaveLength(0);
    expect(s.text).toBe(corrupt);
  });

  it('replaceAll backs up first (raw), saves and leaves recovery', async () => {
    const corrupt = 'garbage';
    const s = new MemoryStorage(corrupt);
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('recovery'));
    await act(async () => {
      await actions.replaceAll(demoData('2026-03-31'), { backupReason: 'pre-restore' });
    });
    expect(screen.getByTestId('status').textContent).toBe('ready');
    expect(s.backups[0]).toMatchObject({ reason: 'pre-restore', text: corrupt });
    expect(s.text).toBe(serializeAppData(demoData('2026-03-31')));
  });

  it('close reports failure when the flush cannot save (review #5)', async () => {
    const s = new MemoryStorage(demoData('2026-03-31'));
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    act(() => actions.updateSettings({ businessName: 'Heet' }));
    s.failSaves = new Error('EPERM: locked');
    let flushed: boolean | undefined;
    await act(async () => {
      await expect(s.close()).rejects.toThrow('EPERM');
      flushed = await actions.flush();
    });
    expect(flushed).toBe(false);
    s.failSaves = null;
    await act(async () => {
      await expect(s.close()).resolves.toBeUndefined();
    });
    expect(s.saves.at(-1)!.settings.businessName).toBe('Heet');
  });

  it('replaceAll refuses an empty dataset over existing data unless allowEmpty (review #1)', async () => {
    const s = new MemoryStorage(demoData('2026-03-31'));
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    let err: unknown;
    await act(async () => {
      await actions.replaceAll(emptyData()).catch((e: unknown) => (err = e));
    });
    expect(isEmptyReplaceError(err)).toBe(true);
    expect(screen.getByTestId('clients').textContent).toBe('4');
    expect(s.backups).toHaveLength(0);
    await act(async () => {
      await actions.replaceAll(emptyData(), { allowEmpty: true });
    });
    expect(screen.getByTestId('clients').textContent).toBe('0');
  });

  it('replaceAll refuses an empty dataset over unreadable data in recovery too (review #1)', async () => {
    const s = new MemoryStorage('{"version":1,"clients":[');
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('recovery'));
    await act(async () => {
      await expect(actions.replaceAll(emptyData(), { backupReason: 'pre-restore' })).rejects.toSatisfy(isEmptyReplaceError);
    });
    expect(s.text).toBe('{"version":1,"clients":[');
  });

  it('replaceAll saves pending edits before the backup and autosave never writes the old data in between (review #10)', async () => {
    const s = new MemoryStorage(demoData('2026-03-31'));
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    act(() => actions.upsert('clients', { id: 'pending', name: 'Pending', archived: false }));
    const replacement = demoData('2026-03-31');
    replacement.clients = replacement.clients.slice(0, 1);
    let flushDuring: Promise<boolean> | undefined;
    await act(async () => {
      const p = actions.replaceAll(replacement);
      flushDuring = actions.flush();
      await p;
      await flushDuring;
    });
    expect(s.backups[0]!.text).toContain('"pending"');
    expect(s.saves.at(-1)!.clients).toHaveLength(1);
    expect(s.text).toBe(serializeAppData(replacement));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(s.text).toBe(serializeAppData(replacement));
  });

  it('removeWithUndo restores the item and its import-row link (review #8)', async () => {
    const d = demoData('2026-03-31');
    d.importRows[1] = { ...d.importRows[1]!, status: 'done', linkedId: 'demo-e-10', linkedCollection: 'expenses', linkCreated: true };
    const s = new MemoryStorage(d);
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    let undo: (() => void) | null = null;
    act(() => {
      undo = actions.removeWithUndo('expenses', 'demo-e-10');
    });
    await act(async () => {
      await actions.flush();
    });
    expect(s.saves.at(-1)!.importRows[1]).toMatchObject({ status: 'todo' });
    act(() => undo!());
    await act(async () => {
      await actions.flush();
    });
    const saved = s.saves.at(-1)!;
    expect(saved.expenses.some((e) => e.id === 'demo-e-10')).toBe(true);
    expect(saved.importRows[1]).toEqual(d.importRows[1]);
    // A sale's payments get their saleId back; protected items are refused.
    act(() => {
      undo = actions.removeWithUndo('sales', 'demo-sale-1');
    });
    act(() => undo!());
    await act(async () => {
      await actions.flush();
    });
    expect(s.saves.at(-1)!.payments.find((p) => p.id === 'demo-pay-1')!.saleId).toBe('demo-sale-1');
    let refused: unknown = 'x';
    act(() => {
      refused = actions.removeWithUndo('clients', 'demo-c-toko');
    });
    expect(refused).toBeNull();
  });

  it('replaceAll rejects invalid data', async () => {
    const s = new MemoryStorage(demoData('2026-03-31'));
    renderWith(s);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    await expect(actions.replaceAll({ version: 1 } as never)).rejects.toThrow('Invalid data');
  });
});
