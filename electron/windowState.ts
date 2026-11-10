/** Remembered window bounds (pure helpers + tiny JSON persistence, no electron import). */
import { promises as fs, readFileSync } from 'node:fs';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface WindowState {
  bounds?: Rect;
  maximized?: boolean;
}

export const DEFAULT_SIZE = { width: 1200, height: 800 };
export const MIN_SIZE = { width: 900, height: 600 };

export function readWindowState(file: string): WindowState {
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as WindowState;
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

export async function writeWindowState(file: string, state: WindowState): Promise<void> {
  try {
    await fs.writeFile(file, JSON.stringify(state));
  } catch {
    /* not important */
  }
}

const isRect = (r: unknown): r is Rect =>
  !!r && typeof r === 'object' && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite((r as Record<string, unknown>)[k]));

/**
 * Bounds to restore: the saved bounds when they still overlap a display work area (≥ 100×100 px
 * visible), clamped to the minimum size; otherwise undefined (let Electron centre the default size).
 */
export function restoreBounds(state: WindowState, workAreas: Rect[]): Rect | undefined {
  const b = state.bounds;
  if (!isRect(b)) return undefined;
  const rect = { ...b, width: Math.max(b.width, MIN_SIZE.width), height: Math.max(b.height, MIN_SIZE.height) };
  const visible = workAreas.some((a) => {
    const w = Math.min(rect.x + rect.width, a.x + a.width) - Math.max(rect.x, a.x);
    const h = Math.min(rect.y + rect.height, a.y + a.height) - Math.max(rect.y, a.y);
    return w >= 100 && h >= 100;
  });
  return visible ? rect : undefined;
}
