import type { AppData } from '../domain/types';
import type { TFunction } from '../i18n';
import { isEmptyReplaceError, type Actions } from '../state/store';
import type { BackupReason } from '../storage/types';
import type { ConfirmOptions } from '../ui';

/**
 * replaceAll() that, when it refuses to put a dataset without records over existing data, asks an
 * extra confirmation and only then retries with `allowEmpty`. Returns false when the user cancelled.
 */
export async function replaceAllConfirmingEmpty(
  replaceAll: Actions['replaceAll'],
  confirm: (o: ConfirmOptions) => Promise<boolean>,
  tc: TFunction<'common'>,
  data: AppData,
  backupReason: BackupReason | false,
): Promise<boolean> {
  try {
    await replaceAll(data, { backupReason });
    return true;
  } catch (e) {
    if (!isEmptyReplaceError(e)) throw e;
    const ok = await confirm({ title: tc('replaceEmptyTitle'), message: tc('replaceEmptyMessage'), confirmLabel: tc('replaceEmptyConfirm'), destructive: true });
    if (!ok) return false;
    await replaceAll(data, { backupReason, allowEmpty: true });
    return true;
  }
}
