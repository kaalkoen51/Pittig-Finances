import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { Button } from './Button';
import { cx } from './cx';
import { isTopLayer, popLayer, pushLayer, trapTab } from './layers';

export interface SheetProps {
  open: boolean;
  /** Called on Esc, scrim click and Cancel. */
  onClose: () => void;
  title: ReactNode;
  /**
   * When given, the sheet is a <form>: Enter in a field submits, and a primary submit button
   * (`submitLabel`, default "Save") appears top-right. Call e.preventDefault() is done for you.
   */
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  /** Label of the left "Cancel" button. */
  cancelLabel?: string;
  /** Extra content at the bottom (e.g. a destructive Delete button). */
  footer?: ReactNode;
  children: ReactNode;
  size?: 'md' | 'lg';
  className?: string;
}

/**
 * Modal sheet. Desktop: centered panel; phone (<760px): full-height, slides up.
 * Esc closes (top-most only), focus is trapped and restored on close.
 * Initial focus: the first element with [autofocus]/data-autofocus, else the first field.
 */
export function Sheet({ open, onClose, title, onSubmit, submitLabel, submitDisabled, cancelLabel, footer, children, size = 'md', className }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const tc = useT('common');

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const layer = pushLayer();
    const onKey = (e: KeyboardEvent) => {
      if (!isTopLayer(layer)) return;
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        onCloseRef.current();
      } else if (panel.current) trapTab(e, panel.current);
    };
    document.addEventListener('keydown', onKey);
    const t = requestAnimationFrame(() => {
      const root = panel.current;
      if (!root || root.contains(document.activeElement)) return;
      const target =
        root.querySelector<HTMLElement>('[data-autofocus], [autofocus]') ??
        root.querySelector<HTMLElement>('.pf-sheet__body input:not([type=hidden]):not([disabled]), .pf-sheet__body select, .pf-sheet__body textarea, .pf-sheet__body button') ??
        root;
      target.focus();
    });
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener('keydown', onKey);
      popLayer(layer);
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!submitDisabled) onSubmit?.();
  };

  const header = (
    <header className="pf-sheet__header">
      <Button variant="plain" onClick={onClose} className="pf-sheet__cancel">
        {cancelLabel ?? tc('cancel')}
      </Button>
      <h2 id={titleId} className="pf-sheet__title">
        {title}
      </h2>
      {onSubmit ? (
        <Button variant="primary" size="sm" type="submit" disabled={submitDisabled} className="pf-sheet__submit">
          {submitLabel ?? tc('save')}
        </Button>
      ) : (
        <span className="pf-sheet__spacer" />
      )}
    </header>
  );
  const inner = (
    <>
      {header}
      <div className="pf-sheet__body">{children}</div>
      {footer && <footer className="pf-sheet__footer">{footer}</footer>}
    </>
  );

  return createPortal(
    <div className="pf-sheet-root">
      <div className="pf-scrim" onMouseDown={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={cx('pf-sheet', `pf-sheet--${size}`, className)}>
        {onSubmit ? (
          <form className="pf-sheet__form" onSubmit={handleSubmit} noValidate>
            {inner}
          </form>
        ) : (
          inner
        )}
      </div>
    </div>,
    document.body,
  );
}
