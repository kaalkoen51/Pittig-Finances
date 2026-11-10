import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Modal layer stack: only the top-most Sheet/Dialog reacts to Esc, and body scroll is locked
 * while any layer is open.
 */
const stack: symbol[] = [];

export function pushLayer(): symbol {
  const id = Symbol('layer');
  stack.push(id);
  if (stack.length === 1) document.body.style.overflow = 'hidden';
  return id;
}

export function popLayer(id: symbol): void {
  const i = stack.indexOf(id);
  if (i >= 0) stack.splice(i, 1);
  if (stack.length === 0) document.body.style.overflow = '';
}

export function isTopLayer(id: symbol): boolean {
  return stack[stack.length - 1] === id;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep Tab focus inside `root`. Call from a keydown handler. */
export function trapTab(e: KeyboardEvent | ReactKeyboardEvent, root: HTMLElement): void {
  if (e.key !== 'Tab') return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (!items.length) {
    e.preventDefault();
    return;
  }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !root.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !root.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}
