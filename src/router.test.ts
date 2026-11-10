import { describe, expect, it } from 'vitest';
import { matchPath, parseLocation } from './router';

describe('router', () => {
  it('parses locations', () => {
    const r = parseLocation('/clients/abc%20d?tab=history');
    expect(r.path).toBe('/clients/abc%20d');
    expect(r.segments).toEqual(['clients', 'abc d']);
    expect(r.query.get('tab')).toBe('history');
    expect(parseLocation('').path).toBe('/');
  });
  it('matches patterns', () => {
    expect(matchPath('/clients', '/clients')).toEqual({});
    expect(matchPath('/clients', '/clients/1')).toBeNull();
    expect(matchPath('/clients/:id', '/clients/1')).toEqual({ id: '1' });
    expect(matchPath('/clients/:id', '/clients')).toBeNull();
    expect(matchPath('/batches/:id/edit', '/batches/x/edit')).toEqual({ id: 'x' });
    expect(matchPath('/import/*', '/import/a/b')).toEqual({ '*': 'a/b' });
    expect(matchPath('/import/*', '/import')).toEqual({ '*': '' });
  });
});
