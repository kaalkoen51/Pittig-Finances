import { ElectronStorage } from './electronStorage';
import { IdbStorage } from './idbStorage';
import type { Storage } from './types';

export type * from './types';
export { IdbStorage } from './idbStorage';
export { ElectronStorage } from './electronStorage';
export { downloadBlob } from './download';

let instance: Storage | null = null;

/** The storage for this runtime: Electron when `window.pittig` exists, else IndexedDB. */
export function getStorage(): Storage {
  if (!instance) instance = typeof window !== 'undefined' && window.pittig ? new ElectronStorage(window.pittig) : new IdbStorage();
  return instance;
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.pittig;
}
