import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Icon } from './Icon';

export interface ToastOptions {
  tone?: 'neutral' | 'success' | 'danger';
  /** e.g. { label: 'Ongedaan maken', onClick: undo } */
  action?: { label: string; onClick: () => void };
  /** ms, default 4000 (6000 with an action). */
  duration?: number;
}
interface ToastItem extends ToastOptions {
  id: number;
  message: ReactNode;
}
export interface ToastApi {
  show(message: ReactNode, opts?: ToastOptions): void;
}

const ToastCtx = createContext<ToastApi | null>(null);
let seq = 0;

/** Mounted once in App. Toasts appear bottom-center (above the tab bar on phones), aria-live polite. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const show = useCallback<ToastApi['show']>(
    (message, opts = {}) => {
      const id = ++seq;
      setItems((list) => [...list.slice(-2), { id, message, ...opts }]);
      timers.current.set(id, setTimeout(() => dismiss(id), opts.duration ?? (opts.action ? 6000 : 4000)));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {/* Portalled to <body> so toasts stay usable while a sheet makes the app inert. */}
      {createPortal(
      <div className="pf-toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('pf-toast', t.tone && `pf-toast--${t.tone}`)}>
            {t.tone === 'success' && <Icon name="check" size={18} />}
            {t.tone === 'danger' && <Icon name="alert" size={18} />}
            <span className="pf-toast__msg">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="pf-toast__action"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>,
      document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(ToastCtx);
  if (!c) throw new Error('useToast must be used inside <ToastProvider>');
  return c;
}
