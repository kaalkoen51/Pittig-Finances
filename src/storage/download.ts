/** Trigger a browser download of `blob` as `fileName`. Works in Electron too (shows a save dialog). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function toBlob(bytes: Uint8Array | ArrayBuffer | Blob, mimeType: string): Blob {
  if (bytes instanceof Blob) return bytes;
  return new Blob([bytes as BlobPart], { type: mimeType });
}

/** "pittig-backup-2026-03-12.json" */
export function backupFileName(date: string): string {
  return `pittig-backup-${date}.json`;
}
