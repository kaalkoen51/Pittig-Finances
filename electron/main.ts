/**
 * Electron main process – STUB. The Electron agent (2d) implements the IPC handlers listed in
 * src/storage/electronApi.ts (IPC constants), atomic writes, backups, single-instance lock,
 * close handshake and electron-updater.
 */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';

const devServerArg = process.argv.find((a) => a.startsWith('--dev-server-url='));
const devServerUrl = devServerArg?.split('=')[1];

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 560,
    title: 'Pittig Finances',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (devServerUrl) void win.loadURL(devServerUrl);
  else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

void app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
