// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { restoreBounds } from './windowState';

const screen = [{ x: 0, y: 0, width: 1920, height: 1040 }];

describe('restoreBounds', () => {
  it('ignores missing or invalid state', () => {
    expect(restoreBounds({}, screen)).toBeUndefined();
    expect(restoreBounds({ bounds: { x: 0, y: 0, width: NaN, height: 1 } }, screen)).toBeUndefined();
  });

  it('restores bounds on a visible display and enforces the minimum size', () => {
    expect(restoreBounds({ bounds: { x: 10, y: 20, width: 500, height: 400 } }, screen)).toEqual({ x: 10, y: 20, width: 900, height: 600 });
  });

  it('drops bounds on a display that is gone', () => {
    expect(restoreBounds({ bounds: { x: 3000, y: 0, width: 1200, height: 800 } }, screen)).toBeUndefined();
  });
});
