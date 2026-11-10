// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CLOSE_TIMEOUT_RESULT, readCloseReady, runCloseCallbacks, unsavedDialog } from './closeGuard';

const tr = (nl: string) => nl;

describe('close handshake (review #5)', () => {
  it('reports saved when every callback resolves', async () => {
    expect(await runCloseCallbacks([() => undefined, async () => undefined])).toEqual({ saved: true });
    expect(await runCloseCallbacks([])).toEqual({ saved: true });
  });

  it('reports NOT saved (with the error) when a flush fails, and still waits for the others', async () => {
    let other = false;
    const r = await runCloseCallbacks([
      async () => {
        throw new Error('EPERM: disk locked');
      },
      async () => {
        await new Promise((res) => setTimeout(res, 5));
        other = true;
      },
    ]);
    expect(r).toEqual({ saved: false, error: 'EPERM: disk locked' });
    expect(other).toBe(true);
  });

  it('main reads the payload defensively', () => {
    expect(readCloseReady(undefined)).toEqual({ saved: true });
    expect(readCloseReady({ saved: true })).toEqual({ saved: true });
    expect(readCloseReady({ saved: false, error: 'x' })).toEqual({ saved: false, error: 'x' });
    expect(readCloseReady({ saved: false, error: 3 })).toEqual({ saved: false });
  });

  it('asks "Niet opgeslagen – toch sluiten?" with keep-open as the safe default', () => {
    const d = unsavedDialog(tr, { saved: false, error: 'EPERM' });
    expect(d.message).toBe('Niet opgeslagen – toch sluiten?');
    expect(d.buttons).toEqual(['Open laten', 'Toch sluiten']);
    expect(d.defaultId).toBe(0);
    expect(d.cancelId).toBe(0);
    expect(d.detail).toContain('EPERM');
    const en = unsavedDialog((_nl, en) => en, CLOSE_TIMEOUT_RESULT);
    expect(en.message).toBe('Not saved – close anyway?');
    expect(en.detail).toContain('too long');
  });
});
