import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { Button } from './Button';
import { isTopLayer, popLayer, pushLayer, trapTab } from './layers';

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  /** Default "Confirm" (or "Delete" when destructive). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small centered alert. Esc / scrim = cancel. Focus starts on Cancel for destructive dialogs. */
export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, destructive, onConfirm, onCancel }: ConfirmDialogProps) {
  const tc = useT('common');
  const panel = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const msgId = useId();
  const cancelCb = useRef(onCancel);
  cancelCb.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const layer = pushLayer();
    const onKey = (e: KeyboardEvent) => {
      if (!isTopLayer(layer)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelCb.current();
      } else if (panel.current) trapTab(e, panel.current);
    };
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => (destructive ? cancelRef.current : confirmRef.current)?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      popLayer(layer);
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [open, destructive]);

  if (!open) return null;
  return createPortal(
    <div className="pf-dialog-root">
      <div className="pf-scrim" onMouseDown={onCancel} aria-hidden="true" />
      <div ref={panel} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={message ? msgId : undefined} className="pf-dialog">
        <h2 id={titleId} className="pf-dialog__title">
          {title}
        </h2>
        {message && (
          <div id={msgId} className="pf-dialog__message">
            {message}
          </div>
        )}
        <div className="pf-dialog__actions">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelLabel ?? tc('cancel')}
          </Button>
          <Button ref={confirmRef} variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>
            {confirmLabel ?? (destructive ? tc('delete') : tc('confirm'))}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export type ConfirmOptions = Omit<ConfirmDialogProps, 'open' | 'onConfirm' | 'onCancel'>;
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn | null>(null);

/** Mounted once in App. Enables `const confirm = useConfirm(); if (await confirm({...})) …`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>((opts) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })), []);
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && <ConfirmDialog {...state} open onConfirm={() => done(true)} onCancel={() => done(false)} />}
    </ConfirmCtx.Provider>
  );
}

/** Like useConfirm, but returns null outside a <ConfirmProvider> (for low-level components). */
export function useOptionalConfirm(): ConfirmFn | null {
  return useContext(ConfirmCtx);
}

export function useConfirm(): ConfirmFn {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return c;
}
