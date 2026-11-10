import { describe, expect, it, vi } from 'vitest';
import { demoData } from '../domain/fixtures';
import type { PittigBridge } from './electronApi';
import { ElectronStorage } from './electronStorage';

const V0_LISTS = { clients: [], suppliers: [], products: [], batches: [], sales: [], payments: [], expenses: [], categories: [] };

function bridge(text: string) {
  const api = {
    info: { dataPath: '/x/pittig-data.json', backupDir: '/x/Backups', appVersion: '0.0.0', platform: 'win32' },
    readData: vi.fn(async () => ({ exists: true as const, text })),
    writeData: vi.fn(async () => ({ savedAt: '' })),
    backupNow: vi.fn(async () => ({ id: 'b', createdAt: '', reason: 'pre-migration' as const })),
  };
  return api;
}

describe('ElectronStorage.load (review #1)', () => {
  it('does not auto-save a migration result without records over the existing file', async () => {
    const api = bridge(JSON.stringify({ ...V0_LISTS, settings: { businessName: 'X', currency: 'EUR' } }));
    const r = await new ElectronStorage(api as unknown as PittigBridge).load();
    expect(r.status === 'ok' && r.migratedFrom).toBe(0);
    expect(api.backupNow).toHaveBeenCalledWith('pre-migration');
    expect(api.writeData).not.toHaveBeenCalled();
  });

  it('saves a migrated dataset with records (after the pre-migration backup)', async () => {
    const d = demoData('2026-03-31') as unknown as Record<string, unknown>;
    delete d.version;
    const api = bridge(JSON.stringify(d));
    const s = new ElectronStorage(api as unknown as PittigBridge);
    expect((await s.load()).status).toBe('ok');
    await s.flush();
    expect(api.writeData).toHaveBeenCalledTimes(1);
  });

  it('reports a JSON file that is not Pittig data as corrupt and writes nothing', async () => {
    const api = bridge('{"name":"x"}');
    expect((await new ElectronStorage(api as unknown as PittigBridge).load()).status).toBe('corrupt');
    expect(api.writeData).not.toHaveBeenCalled();
    expect(api.backupNow).not.toHaveBeenCalled();
  });
});
