import { useEffect, useRef, useState } from 'react';
import type { AppData } from '../domain/types';
import type { BackupInfo, RestoreResult } from '../storage/types';
import { useFormat, useT } from '../i18n';
import { useActions, useAppStatus, useStorage } from '../state/store';
import { Button, Card, EmptyState, List, ListRow, useConfirm, useToast } from '../ui';
import { replaceAllConfirmingEmpty } from './confirmReplace';

/**
 * Shown when stored data is corrupt. Nothing is saved until a backup is restored.
 * "Restore latest backup" offers the newest backup that actually passes validation (a damaged copy
 * must never be the suggested one).
 */
export function RecoveryScreen() {
  const tc = useT('common');
  const f = useFormat();
  const storage = useStorage();
  const { recoveryError } = useAppStatus();
  const { replaceAll } = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [latest, setLatest] = useState<{ info: BackupInfo; data: AppData } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let list: BackupInfo[] = [];
      try {
        list = await storage.listBackups();
      } catch {
        /* none */
      }
      if (cancelled) return;
      setBackups(list);
      for (const b of list) {
        try {
          const r = await storage.restoreBackup(b.id);
          if (cancelled) return;
          if (r.ok) {
            setLatest({ info: b, data: r.data });
            return;
          }
        } catch {
          /* try the next one */
        }
      }
      if (!cancelled) setLatest(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const apply = async (get: () => Promise<RestoreResult | null>, askFirst = false) => {
    setBusy(true);
    setError(null);
    try {
      const r = await get();
      if (!r) return;
      if (!r.ok) throw new Error(r.error);
      if (askFirst && !(await confirm({ title: tc('recoveryFileTitle'), message: tc('recoveryFileMessage'), confirmLabel: tc('recoveryFileConfirm') }))) return;
      if (await replaceAllConfirmingEmpty(replaceAll, confirm, tc, r.data, 'pre-restore')) toast.show(tc('restored'), { tone: 'success' });
    } catch (e) {
      setError(tc('recoveryFailed', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const when = (b: BackupInfo) => `${f.date(b.createdAt.slice(0, 10), 'medium')} ${b.createdAt.slice(11, 16)}`;
  const others = (backups ?? []).filter((b) => b.id !== latest?.info.id);

  return (
    <div className="pf-recovery">
      <EmptyState icon="alert" title={tc('recoveryTitle')} message={tc('recoveryMessage')} />
      <div className="pf-stack">
        {error && (
          <p className="pf-recovery__error" role="alert">
            {error}
          </p>
        )}
        {latest && (
          <Button variant="primary" size="lg" block disabled={busy} onClick={() => apply(async () => ({ ok: true, data: latest.data }))}>
            {tc('recoveryRestoreLatest', { date: when(latest.info) })}
          </Button>
        )}
        {backups && backups.length === 0 && <p className="muted pf-center">{tc('recoveryNoBackups')}</p>}
        {backups && backups.length > 0 && latest === null && <p className="muted pf-center">{tc('recoveryNoValidBackups')}</p>}
        <Button
          variant="secondary"
          size="lg"
          block
          disabled={busy}
          onClick={() => (storage.info().kind === 'electron' ? apply(() => storage.importBackupFile(), true) : fileInput.current?.click())}
        >
          {tc('recoveryRestoreFromFile')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void apply(() => storage.importBackupFile(file), true);
          }}
        />
        {latest !== undefined && others.length > 0 && (
          <List header={tc('recoveryOtherBackups')}>
            {others.slice(0, 14).map((b) => (
              <ListRow key={b.id} title={when(b)} subtitle={b.reason} onClick={busy ? undefined : () => apply(() => storage.restoreBackup(b.id))} />
            ))}
          </List>
        )}
        {recoveryError && (
          <Card>
            <details>
              <summary>{tc('recoveryDetails')}</summary>
              <pre className="pf-recovery__details">{recoveryError}</pre>
            </details>
          </Card>
        )}
      </div>
    </div>
  );
}
