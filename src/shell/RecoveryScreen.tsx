import { useEffect, useRef, useState } from 'react';
import type { BackupInfo, RestoreResult } from '../storage/types';
import { useFormat, useT } from '../i18n';
import { useActions, useAppStatus, useStorage } from '../state/store';
import { Button, Card, EmptyState, List, ListRow, useToast } from '../ui';

/** Shown when stored data is corrupt. Nothing is saved until a backup is restored. */
export function RecoveryScreen() {
  const tc = useT('common');
  const f = useFormat();
  const storage = useStorage();
  const { recoveryError } = useAppStatus();
  const { replaceAll } = useActions();
  const toast = useToast();
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storage
      .listBackups()
      .then(setBackups)
      .catch(() => setBackups([]));
  }, [storage]);

  const apply = async (get: () => Promise<RestoreResult | null>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await get();
      if (!r) return;
      if (!r.ok) throw new Error(r.error);
      await replaceAll(r.data, { backupReason: 'pre-restore' });
      toast.show(tc('restored'), { tone: 'success' });
    } catch (e) {
      setError(tc('recoveryFailed', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const when = (b: BackupInfo) => `${f.date(b.createdAt.slice(0, 10), 'medium')} ${b.createdAt.slice(11, 16)}`;
  const latest = backups?.[0];

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
          <Button variant="primary" size="lg" block disabled={busy} onClick={() => apply(() => storage.restoreBackup(latest.id))}>
            {tc('recoveryRestoreLatest', { date: when(latest) })}
          </Button>
        )}
        {backups && backups.length === 0 && <p className="muted pf-center">{tc('recoveryNoBackups')}</p>}
        <Button
          variant="secondary"
          size="lg"
          block
          disabled={busy}
          onClick={() => (storage.info().kind === 'electron' ? apply(() => storage.importBackupFile()) : fileInput.current?.click())}
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
            if (file) void apply(() => storage.importBackupFile(file));
          }}
        />
        {backups && backups.length > 1 && (
          <List header={tc('recoveryOtherBackups')}>
            {backups.slice(1, 15).map((b) => (
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
