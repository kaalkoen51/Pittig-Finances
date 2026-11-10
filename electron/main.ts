/**
 * Electron main process for Pittig Finances.
 *
 * - One window, one instance (a second launch focuses the existing window).
 * - Secure renderer: contextIsolation, no nodeIntegration, sandbox; external links open in the browser.
 * - Implements the IPC contract of src/storage/electronApi.ts. All file logic lives in ./fsStore.
 * - Close handshake: asks the renderer to flush pending saves and waits (max 3 s) before closing.
 * - electron-updater (GitHub Releases): silent check on startup in packaged builds; errors swallowed.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, session, shell, type IpcMainInvokeEvent } from 'electron';
import { autoUpdater } from 'electron-updater';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseAppData } from '../src/domain/migrate';
import { IPC, type PittigBridgeInfo } from '../src/storage/electronApi';
import type { BackupInfo, UpdateCheckResult } from '../src/storage/types';
import {
  DATA_FILE_NAME,
  assertJson,
  atomicWrite,
  hasDailyBackup,
  isBackupReason,
  listBackups,
  makeBackup,
  readBackup,
  readLive,
  withRetry,
} from './fsStore';
import { CLOSE_TIMEOUT_RESULT, readCloseReady, unsavedDialog, type CloseReadyPayload } from './closeGuard';
import { DEFAULT_SIZE, MIN_SIZE, readWindowState, restoreBounds, writeWindowState } from './windowState';

const APP_NAME = 'Pittig Finances';

/** Same parse + migrate + validate as the renderer. */
const isValidData = (text: string) => parseAppData(text).ok;
const CLOSE_TIMEOUT_MS = 3000;

const devServerUrl = process.argv.find((a) => a.startsWith('--dev-server-url='))?.slice('--dev-server-url='.length);
const isDev = !!devServerUrl;

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('nl.pittig.finances');

// ---------- paths ----------
const userData = () => app.getPath('userData');
const dataPath = () => path.join(userData(), DATA_FILE_NAME);
const docsDir = () => path.join(app.getPath('documents'), APP_NAME);
const backupDir = () => path.join(docsDir(), 'Backups');
const windowStatePath = () => path.join(userData(), 'window-state.json');

/**
 * App language as saved in Settings: English unless the saved data says Dutch. Read straight from
 * the data file (sync, tolerant of a missing/damaged file) and refreshed on every save.
 */
function readSavedLanguage(): 'nl' | 'en' {
  try {
    const parsed = JSON.parse(readFileSync(dataPath(), 'utf8')) as { settings?: { language?: unknown } };
    return parsed?.settings?.language === 'nl' ? 'nl' : 'en';
  } catch {
    return 'en';
  }
}
let uiLanguage: 'nl' | 'en' = readSavedLanguage();
function noteSavedLanguage(text: string): void {
  const m = /"language"\s*:\s*"(nl|en)"/.exec(text);
  if (m) uiLanguage = m[1] as 'nl' | 'en';
}
// Chromium UI locale follows the app language, so native date fields read dd/mm/yyyy (English) or
// dd-mm-jjjj (Dutch) whatever the Windows language is. Must be set before the app is ready, so a
// language change in Settings reaches the date picker after the next start.
app.commandLine.appendSwitch('lang', uiLanguage === 'nl' ? 'nl' : 'en-GB');

/** Dialog language: follows the app language (English by default). */
const tr = (dutch: string, english: string) => (uiLanguage === 'nl' ? dutch : english);

// ---------- single instance ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = mainWindow;
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  void app.whenReady().then(start);
}

let mainWindow: BrowserWindow | null = null;

// Serialise all writes to the data/backup folders.
let fileChain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = fileChain.then(fn, fn);
  fileChain = next.catch(() => undefined);
  return next;
}

async function ensureDailyBackup(): Promise<void> {
  try {
    // Only a file that passes the app's own validation may become "the latest backup" (review #4).
    if (!(await hasDailyBackup(backupDir()))) await makeBackup(dataPath(), backupDir(), 'daily', new Date(), { validate: isValidData, onInvalid: 'skip' });
  } catch (e) {
    console.error('daily backup failed', e);
  }
}

async function start(): Promise<void> {
  // Deny every permission request (camera, notifications, …); the app needs none.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  setupMenu();
  registerIpc();
  await serial(ensureDailyBackup);
  createWindow();
  setupUpdater();
}

// ---------- window ----------
function setupMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  } else if (!isDev) {
    Menu.setApplicationMenu(null);
  }
}

function isAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (devServerUrl) return u.origin === new URL(devServerUrl).origin;
    return u.protocol === 'file:';
  } catch {
    return false;
  }
}

function openExternalSafe(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'mailto:') void shell.openExternal(u.toString());
  } catch {
    /* ignore malformed */
  }
}

function createWindow(): void {
  const state = readWindowState(windowStatePath());
  const bounds = restoreBounds(
    state,
    screen.getAllDisplays().map((d) => d.workArea),
  );

  const win = new BrowserWindow({
    ...(bounds ?? DEFAULT_SIZE),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: APP_NAME,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#f2f2f7',
    // Packaged: the window uses the .exe icon. Dev: use the source icon.
    ...(app.isPackaged ? {} : { icon: path.join(__dirname, '..', 'build', 'icon.png') }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow = win;
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  // Keep the HTML <title> from renaming the window.
  win.on('page-title-updated', (e) => e.preventDefault());

  // Navigation: stay inside the app; https/mailto links open in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return;
    e.preventDefault();
    openExternalSafe(url);
  });
  win.webContents.on('will-redirect', (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });

  // Close handshake: flush pending saves first.
  let allowClose = false;
  let closing = false;
  win.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    if (closing) return;
    closing = true;
    void writeWindowState(windowStatePath(), { bounds: win.getNormalBounds(), maximized: win.isMaximized() });
    void requestRendererFlush(win)
      .then(async (r) => {
        // Unsaved changes: ask instead of silently losing them.
        if (!r.saved && !win.isDestroyed() && !(await confirmCloseUnsaved(win, r))) {
          closing = false;
          return;
        }
        allowClose = true;
        if (!win.isDestroyed()) win.close();
      })
      .catch(() => {
        allowClose = true;
        if (!win.isDestroyed()) win.close();
      });
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (devServerUrl) void win.loadURL(devServerUrl);
  else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

/** true = close anyway. */
async function confirmCloseUnsaved(win: BrowserWindow, r: CloseReadyPayload): Promise<boolean> {
  const { response } = await dialog.showMessageBox(win, unsavedDialog(tr, r));
  return response === 1;
}

/** Ask the renderer to flush pending saves; resolves on 'close-ready' (with its result) or after 3 s. */
function requestRendererFlush(win: BrowserWindow): Promise<CloseReadyPayload> {
  if (win.isDestroyed() || win.webContents.isCrashed()) return Promise.resolve({ saved: true });
  return new Promise<CloseReadyPayload>((resolve) => {
    const onReady = (e: Electron.IpcMainEvent, payload?: unknown) => {
      if (e.sender === win.webContents) done(readCloseReady(payload));
    };
    const timer = setTimeout(() => done(CLOSE_TIMEOUT_RESULT), CLOSE_TIMEOUT_MS);
    let finished = false;
    function done(result: CloseReadyPayload) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      ipcMain.removeListener(IPC.closeReady, onReady);
      // Wait for in-flight main-side writes too.
      void fileChain.then(() => resolve(result));
    }
    ipcMain.on(IPC.closeReady, onReady);
    try {
      win.webContents.send(IPC.beforeClose);
    } catch {
      done({ saved: true });
    }
  });
}

app.on('window-all-closed', () => {
  app.quit();
});

// ---------- IPC ----------
function fromOurWindow(e: IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  return !!mainWindow && e.sender === mainWindow.webContents && isAppUrl(e.senderFrame?.url ?? e.sender.getURL());
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R): void {
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromOurWindow(e)) throw new Error('Forbidden');
    return fn(...(args as A));
  });
}

function registerIpc(): void {
  ipcMain.on(IPC.info, (e) => {
    const info: PittigBridgeInfo = {
      dataPath: dataPath(),
      backupDir: backupDir(),
      appVersion: app.getVersion(),
      platform: process.platform,
    };
    e.returnValue = info;
  });

  handle(IPC.readData, () => readLive(dataPath()));

  handle(IPC.writeData, (text: unknown) =>
    serial(async () => {
      assertJson(text);
      // App left open past midnight: still make the day's backup (of the previous version) first.
      await ensureDailyBackup();
      await atomicWrite(dataPath(), text);
      noteSavedLanguage(text);
      return { savedAt: new Date().toISOString() };
    }),
  );

  handle(IPC.backupNow, (reason: unknown) =>
    serial(async (): Promise<BackupInfo> => {
      const r = isBackupReason(reason) ? reason : 'manual';
      // An invalid live file (e.g. before restoring in recovery mode) is kept as "damaged", not as a backup.
      const info = await makeBackup(dataPath(), backupDir(), r, new Date(), { validate: isValidData });
      // No live file yet (first run): nothing to back up.
      return info ?? { id: '', createdAt: new Date().toISOString(), reason: r, sizeBytes: 0 };
    }),
  );

  handle(IPC.listBackups, () => listBackups(backupDir()));

  handle(IPC.readBackup, (id: unknown) => {
    if (typeof id !== 'string') throw new Error('Unknown backup');
    return readBackup(backupDir(), id);
  });

  handle(IPC.exportBackupFile, async (text: unknown, suggestedName: unknown) => {
    assertJson(text);
    await fs.mkdir(docsDir(), { recursive: true });
    const r = await dialog.showSaveDialog(mainWindow!, {
      title: tr('Back-up opslaan', 'Save backup'),
      defaultPath: path.join(docsDir(), safeName(suggestedName, 'pittig-backup.json')),
      filters: [{ name: tr('Pittig back-up', 'Pittig backup'), extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { saved: false };
    await atomicWrite(r.filePath, text, { keepBak: false });
    return { saved: true, path: r.filePath };
  });

  handle(IPC.importBackupFile, async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: tr('Back-up openen', 'Open backup'),
      defaultPath: backupDir(),
      properties: ['openFile'],
      filters: [{ name: tr('Pittig back-up', 'Pittig backup'), extensions: ['json'] }],
    });
    const file = r.filePaths[0];
    if (r.canceled || !file) return { canceled: true as const };
    const text = await withRetry(() => fs.readFile(file, 'utf8'));
    return { canceled: false as const, text, path: file };
  });

  handle(IPC.saveFile, async (bytes: unknown, suggestedName: unknown, filters: unknown) => {
    if (!(bytes instanceof Uint8Array)) throw new Error('Invalid data');
    const r = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: path.join(app.getPath('documents'), safeName(suggestedName, 'export')),
      filters: Array.isArray(filters) ? (filters as Electron.FileFilter[]) : undefined,
    });
    if (r.canceled || !r.filePath) return { saved: false };
    await atomicWrite(r.filePath, bytes, { keepBak: false });
    return { saved: true, path: r.filePath };
  });

  handle(IPC.openDataFolder, async () => {
    await fs.mkdir(backupDir(), { recursive: true });
    await shell.openPath(backupDir());
  });

  handle(IPC.checkForUpdates, () => checkForUpdates());
}

function safeName(name: unknown, fallback: string): string {
  if (typeof name !== 'string' || !name.trim()) return fallback;
  return path.basename(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
}

// ---------- updates ----------
let downloadedVersion: string | undefined;
let promptShown = false;

function setupUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', () => undefined); // never bother the user
  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version;
    void promptRestart(info.version);
  });
  setTimeout(() => void checkForUpdates(), 5000);
}

async function checkForUpdates(): Promise<UpdateCheckResult> {
  if (!app.isPackaged) return { status: 'unsupported' };
  if (downloadedVersion) return { status: 'downloaded', version: downloadedVersion };
  try {
    const r = await autoUpdater.checkForUpdates();
    if (!r) return { status: 'unsupported' };
    r.downloadPromise?.catch(() => undefined);
    if (r.isUpdateAvailable) return { status: 'available', version: r.updateInfo.version };
    return { status: 'up-to-date', version: app.getVersion() };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

async function promptRestart(version: string): Promise<void> {
  const win = mainWindow;
  if (promptShown || !win) return;
  promptShown = true;
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    buttons: [tr('Nu herstarten', 'Restart now'), tr('Later', 'Later')],
    defaultId: 0,
    cancelId: 1,
    title: APP_NAME,
    message: tr(`Versie ${version} staat klaar.`, `Version ${version} is ready.`),
    detail: tr(
      'Herstart de app om bij te werken. Je gegevens blijven gewoon bewaard. Kies je "Later", dan wordt de update geïnstalleerd als je de app sluit.',
      'Restart the app to update. Your data is kept. If you choose "Later", the update installs when you close the app.',
    ),
  });
  if (response !== 0) return;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const r = await requestRendererFlush(mainWindow);
      if (!r.saved && !(await confirmCloseUnsaved(mainWindow, r))) return; // installs on next quit
    }
    // Skip the close handshake (already flushed) and install silently, then relaunch.
    mainWindow?.removeAllListeners('close');
    autoUpdater.quitAndInstall(true, true);
  } catch {
    /* ignore – installs on next quit */
  }
}
