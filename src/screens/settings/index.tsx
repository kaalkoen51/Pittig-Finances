import { useCallback, useEffect, useRef, useState } from 'react';
import { hasUserContent } from '../../domain/calc';
import { demoData } from '../../domain/fixtures';
import { emptyData } from '../../domain/migrate';
import type { AppData, Category, Language, Theme } from '../../domain/types';
import { useLang, useT } from '../../i18n';
import { navigate } from '../../router';
import { useActions, useAppStatus, useData, useStorage } from '../../state/store';
import type { BackupInfo, RestoreResult, UpdateCheckResult } from '../../storage/types';
import { Badge, Button, Card, Field, Icon, List, ListRow, PageHeader, Segmented, TextInput, Toggle, useConfirm, useToast } from '../../ui';
import { version as pkgVersion } from '../../../package.json';
import { replaceAllConfirmingEmpty } from '../../shell/confirmReplace';
import { CategorySheet } from './CategorySheet';
import './settings.css';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useDateTime() {
  const lang = useLang();
  return useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return new Intl.DateTimeFormat(lang === 'nl' ? 'nl-NL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
    },
    [lang],
  );
}

export default function SettingsScreen() {
  const t = useT('settings');
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="pf-stack pf-stack--lg settings-screen">
        <GeneralSection />
        <CategoriesSection />
        <ExcelSection />
        <BackupSection />
        <AboutSection />
        <DataSection />
      </div>
    </>
  );
}

function GeneralSection() {
  const t = useT('settings');
  const data = useData();
  const actions = useActions();
  const [name, setName] = useState(data.settings.businessName);
  useEffect(() => setName(data.settings.businessName), [data.settings.businessName]);
  const commit = () => {
    const v = name.trim();
    if (v !== data.settings.businessName) actions.updateSettings({ businessName: v });
  };
  return (
    <Card title={t('general')}>
      <div className="pf-form-section settings-form">
        <Field label={t('businessName')}>
          <TextInput
            value={name}
            placeholder={t('businessNamePlaceholder')}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
        </Field>
        <Field label={t('language')}>
          <Segmented<Language>
            aria-label={t('language')}
            value={data.settings.language}
            onChange={(language) => actions.updateSettings({ language })}
            options={[
              { value: 'nl', label: 'Nederlands' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Field>
        <Field label={t('appearance')}>
          <Segmented<Theme>
            aria-label={t('appearance')}
            value={data.settings.theme ?? 'system'}
            onChange={(theme) => actions.updateSettings({ theme })}
            options={[
              { value: 'system', label: t('themeSystem') },
              { value: 'light', label: t('themeLight') },
              { value: 'dark', label: t('themeDark') },
            ]}
          />
        </Field>
      </div>
    </Card>
  );
}

function CategoriesSection() {
  const t = useT('settings');
  const tc = useT('common');
  const data = useData();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = data.categories.filter((c) => c.archived).length;
  const list = data.categories.filter((c) => showArchived || !c.archived);
  return (
    <section className="settings-section">
      <List
        header={t('categories')}
        footer={
          <div className="settings-list-footer">
            <span>{t('categoriesFooter')}</span>
            {archivedCount > 0 && <Toggle checked={showArchived} onChange={setShowArchived} label={tc('showArchived')} />}
          </div>
        }
      >
        {list.map((c) => (
          <ListRow
            key={c.id}
            title={c.name}
            leading={<span className="settings-dot" style={{ background: c.color }} aria-hidden="true" />}
            badge={c.archived ? <Badge>{tc('archived')}</Badge> : undefined}
            muted={c.archived}
            chevron
            onClick={() => setEditing(c)}
          />
        ))}
        <ListRow title={<span className="settings-add">{t('addCategory')}</span>} leading={<Icon name="plus" size={18} className="settings-add" />} onClick={() => setEditing('new')} />
      </List>
      <CategorySheet category={editing} onClose={() => setEditing(null)} count={data.categories.length} />
    </section>
  );
}

function ExcelSection() {
  const t = useT('settings');
  const data = useData();
  const storage = useStorage();
  const toast = useToast();
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    try {
      if (await fn()) toast.show(t('exported'), { tone: 'success' });
    } catch (e) {
      toast.show(t('exportFailed', { error: errText(e) }), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t('excel')}>
      <div className="pf-stack">
        <p className="muted settings-hint">{t('exportAllHint')}</p>
        <div className="pf-row-actions">
          <Button
            variant="secondary"
            icon={<Icon name="download" size={18} />}
            disabled={busy}
            onClick={() => run(async () => (await import('../../excel/export')).exportAll(data, storage, lang))}
          >
            {busy ? t('exporting') : t('exportAll')}
          </Button>
          <Button variant="secondary" icon={<Icon name="upload" size={18} />} onClick={() => navigate('/import?wizard=1')}>
            {t('importExcel')}
          </Button>
          <Button variant="plain" disabled={busy} onClick={() => run(async () => (await import('../../excel/export')).exportTemplate(lang, storage))}>
            {t('downloadTemplate')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function BackupSection() {
  const t = useT('settings');
  const tc = useT('common');
  const actions = useActions();
  const data = useData();
  const storage = useStorage();
  const toast = useToast();
  const confirm = useConfirm();
  const fmt = useDateTime();
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const electron = storage.info().kind === 'electron';

  const refresh = useCallback(() => {
    storage
      .listBackups()
      .then(setBackups)
      .catch(() => setBackups([]));
  }, [storage]);
  // Re-read after every save: replaceAll/imports make backups too.
  const { lastSavedAt } = useAppStatus();
  useEffect(refresh, [refresh, lastSavedAt]);

  const backupNow = async () => {
    setBusy(true);
    try {
      await actions.flush();
      await storage.backupNow('manual');
      toast.show(t('backupMade'), { tone: 'success' });
    } catch (e) {
      toast.show(t('backupFailed', { error: errText(e) }), { tone: 'danger' });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const applyRestore = async (r: RestoreResult | null, title: string) => {
    if (!r) return;
    if (!r.ok) {
      toast.show(t('restoreFailed', { error: r.error }), { tone: 'danger' });
      return;
    }
    if (!(await confirm({ title, message: t('restoreMessage'), confirmLabel: t('restore'), destructive: true }))) return;
    try {
      if (await replaceAllConfirmingEmpty(actions.replaceAll, confirm, tc, r.data, 'pre-restore')) toast.show(t('restored'), { tone: 'success' });
    } catch (e) {
      toast.show(t('restoreFailed', { error: errText(e) }), { tone: 'danger' });
    } finally {
      refresh();
    }
  };

  const restore = async (b: BackupInfo) => {
    try {
      await applyRestore(await storage.restoreBackup(b.id), t('restoreTitle', { date: fmt(b.createdAt) }));
    } catch (e) {
      toast.show(t('restoreFailed', { error: errText(e) }), { tone: 'danger' });
    }
  };

  const restoreFromFile = async (file?: File) => {
    try {
      await applyRestore(await storage.importBackupFile(file), t('restoreFileTitle'));
    } catch (e) {
      toast.show(t('restoreFailed', { error: errText(e) }), { tone: 'danger' });
    }
  };

  const saveFile = async () => {
    try {
      await actions.flush();
      if (await storage.exportBackupFile(data)) toast.show(t('backupFileSaved'), { tone: 'success' });
    } catch (e) {
      toast.show(t('backupFailed', { error: errText(e) }), { tone: 'danger' });
    }
  };

  const last = backups?.[0];
  const shown = backups ? (showAll ? backups : backups.slice(0, 5)) : [];
  return (
    <section className="settings-section">
      <Card title={t('backup')}>
        <div className="pf-stack">
          <p className="settings-last" data-testid="last-backup">
            {backups === null ? '…' : last ? t('lastBackup', { date: fmt(last.createdAt) }) : t('noBackupYet')}
          </p>
          <p className="muted settings-hint">{t('backupHint')}</p>
          <div className="pf-row-actions">
            <Button variant="secondary" icon={<Icon name="refresh" size={18} />} onClick={backupNow} disabled={busy}>
              {t('backupNow')}
            </Button>
            <Button variant="secondary" icon={<Icon name="download" size={18} />} onClick={saveFile}>
              {t('saveBackupFile')}
            </Button>
            <Button variant="secondary" icon={<Icon name="upload" size={18} />} onClick={() => (electron ? void restoreFromFile() : fileRef.current?.click())}>
              {t('restoreFromFile')}
            </Button>
            {electron && storage.openDataFolder && (
              <Button variant="plain" icon={<Icon name="folder" size={18} />} onClick={() => void storage.openDataFolder?.()}>
                {t('openBackupFolder')}
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            tabIndex={-1}
            aria-label={t('restoreFromFile')}
            data-testid="restore-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void restoreFromFile(f);
            }}
          />
        </div>
      </Card>
      {backups && backups.length > 0 && (
        <List
          header={t('backupsList')}
          footer={
            !showAll && backups.length > 5 ? (
              <Button variant="plain" size="sm" onClick={() => setShowAll(true)}>
                {t('showAllBackups', { count: backups.length })}
              </Button>
            ) : undefined
          }
        >
          {shown.map((b) => (
            <ListRow
              key={b.id}
              title={fmt(b.createdAt)}
              subtitle={t(`reason_${b.reason}` as 'reason_daily')}
              detail={
                <Button variant="plain" size="sm" onClick={() => void restore(b)}>
                  {t('restore')}
                </Button>
              }
            />
          ))}
        </List>
      )}
    </section>
  );
}

function AboutSection() {
  const t = useT('settings');
  const tc = useT('common');
  const storage = useStorage();
  const info = storage.info();
  const version = storage.appVersion?.() ?? pkgVersion;
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const check = async () => {
    if (!storage.checkForUpdates) return;
    setChecking(true);
    try {
      setResult(await storage.checkForUpdates());
    } catch (e) {
      setResult({ status: 'error', message: errText(e) });
    } finally {
      setChecking(false);
    }
  };
  const resultText = (r: UpdateCheckResult) =>
    r.status === 'up-to-date'
      ? t('upToDate', { version: r.version })
      : r.status === 'available'
        ? t('updateAvailable', { version: r.version })
        : r.status === 'downloaded'
          ? t('updateDownloaded', { version: r.version })
          : r.status === 'unsupported'
            ? t('updateUnsupported')
            : t('updateError');
  return (
    <Card title={t('about')}>
      <div className="pf-stack">
        <p className="settings-about">
          <strong>{tc('appName')}</strong>
          {version && <span className="muted"> · {t('version', { version })}</span>}
        </p>
        {info.kind === 'electron' ? (
          <>
            {info.dataPath && <p className="muted settings-hint settings-path">{t('dataLocation', { path: info.dataPath })}</p>}
            {storage.checkForUpdates && (
              <div className="pf-row-actions">
                <Button variant="secondary" icon={<Icon name="refresh" size={18} />} onClick={check} disabled={checking}>
                  {checking ? t('checking') : t('checkUpdates')}
                </Button>
              </div>
            )}
            {result && (
              <p className="settings-hint" role="status">
                {resultText(result)}
              </p>
            )}
          </>
        ) : (
          <p className="settings-note" role="note">
            <Icon name="alert" size={18} />
            <span>{t('webNote')}</span>
          </p>
        )}
      </div>
    </Card>
  );
}

function DataSection() {
  const t = useT('settings');
  const data = useData();
  const actions = useActions();
  const confirm = useConfirm();
  const toast = useToast();
  const lang = useLang();
  const empty = !hasUserContent(data);

  const loadDemo = async () => {
    if (!(await confirm({ title: t('loadDemoTitle'), message: t('loadDemoMessage'), confirmLabel: t('loadDemoData') }))) return;
    try {
      const demo = demoData();
      await actions.replaceAll({ ...demo, settings: { ...demo.settings, language: lang } });
      toast.show(t('demoLoaded'), { tone: 'success' });
    } catch (e) {
      toast.show(t('failed', { error: errText(e) }), { tone: 'danger' });
    }
  };

  const erase = async () => {
    if (!(await confirm({ title: t('eraseTitle'), message: t('eraseMessage'), confirmLabel: t('eraseConfirm'), destructive: true }))) return;
    if (!(await confirm({ title: t('eraseTitle2'), message: t('eraseMessage2'), confirmLabel: t('eraseConfirm2'), destructive: true }))) return;
    try {
      const fresh: AppData = emptyData(lang);
      fresh.settings = { ...fresh.settings, businessName: data.settings.businessName, language: lang, firstRunDone: true };
      // Erasing is explicitly double-confirmed above.
      await actions.replaceAll(fresh, { backupReason: 'pre-replace', allowEmpty: true });
      toast.show(t('erased'), { tone: 'success' });
    } catch (e) {
      toast.show(t('failed', { error: errText(e) }), { tone: 'danger' });
    }
  };

  return (
    <Card title={t('data')}>
      <div className="pf-stack">
        {empty && (
          <div className="settings-data-row">
            <div>
              <div>{t('loadDemoData')}</div>
              <div className="muted settings-hint">{t('loadDemoHint')}</div>
            </div>
            <Button variant="secondary" onClick={loadDemo}>
              {t('loadDemoData')}
            </Button>
          </div>
        )}
        <div className="settings-data-row">
          <div>
            <div>{t('eraseAll')}</div>
            <div className="muted settings-hint">{t('eraseHint')}</div>
          </div>
          <Button variant="destructive" icon={<Icon name="trash" size={18} />} onClick={erase}>
            {t('eraseAll')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
