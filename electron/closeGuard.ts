/**
 * Close handshake helpers shared by preload.ts and main.ts (no `electron` imports → unit-testable).
 *
 * The renderer answers 'pittig:before-close' with 'pittig:close-ready' + CloseReadyPayload. When the
 * pending changes could not be written, main asks "Niet opgeslagen – toch sluiten?" instead of
 * closing silently.
 */

export interface CloseReadyPayload {
  saved: boolean;
  error?: string;
}

/** Run every before-close callback; a rejecting callback means "not saved". Never rejects. */
export async function runCloseCallbacks(cbs: Iterable<() => Promise<void> | void>): Promise<CloseReadyPayload> {
  const results = await Promise.allSettled([...cbs].map(async (cb) => cb()));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (!failed) return { saved: true };
  const reason = failed.reason as unknown;
  return { saved: false, error: reason instanceof Error ? reason.message : String(reason) };
}

/** Interpret what main received (older renderers sent nothing = saved; timeout = unknown → not saved). */
export function readCloseReady(payload: unknown): CloseReadyPayload {
  if (payload === undefined || payload === null) return { saved: true };
  if (typeof payload === 'object' && 'saved' in payload) {
    const p = payload as { saved: unknown; error?: unknown };
    return p.saved === false ? { saved: false, ...(typeof p.error === 'string' ? { error: p.error } : {}) } : { saved: true };
  }
  return { saved: true };
}

export const CLOSE_TIMEOUT_RESULT: CloseReadyPayload = { saved: false, error: 'timeout' };

type Tr = (dutch: string, english: string) => string;

/** Message box for "changes were not saved". Button 0 = keep the app open (default), 1 = close anyway. */
export function unsavedDialog(tr: Tr, r: CloseReadyPayload) {
  const detail =
    r.error === 'timeout'
      ? tr('Het opslaan duurde te lang. Je laatste wijzigingen zijn misschien niet bewaard.', 'Saving took too long. Your latest changes may not have been saved.')
      : tr('Je laatste wijzigingen konden niet worden opgeslagen.', 'Your latest changes could not be saved.');
  return {
    type: 'warning' as const,
    buttons: [tr('Open laten', 'Keep open'), tr('Toch sluiten', 'Close anyway')],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Pittig Finances',
    message: tr('Niet opgeslagen – toch sluiten?', 'Not saved – close anyway?'),
    detail: r.error && r.error !== 'timeout' ? `${detail}\n\n${r.error}` : detail,
  };
}
