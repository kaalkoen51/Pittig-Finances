/**
 * Tiny hash router (no dependency). URLs look like `#/clients/123?tab=history`.
 *
 *   const { path, segments, query } = useRoute();
 *   const params = useMatch('/clients/:id');      // { id: '123' } or null
 *   navigate('/sales');                             // push
 *   navigate('/sales', { replace: true });
 *   <a href={href('/clients/' + id)}>…</a>           // or <Link to="/clients/123">
 *
 * Each top-level screen (src/routes.ts) owns every path under its base, e.g. the Clients screen
 * receives `/clients` and `/clients/:id` and decides itself what to show via useMatch().
 */
import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes } from 'react';

export interface Route {
  /** Path without '#', always starting with '/', without query. */
  path: string;
  /** Path split on '/', decoded, empty parts removed. */
  segments: string[];
  query: URLSearchParams;
}

function readHash(): string {
  return typeof window === 'undefined' ? '/' : window.location.hash.replace(/^#/, '') || '/';
}

export function parseLocation(raw: string): Route {
  const [p = '/', q = ''] = raw.split('?');
  const path = p.startsWith('/') ? p : `/${p}`;
  return {
    path,
    segments: path.split('/').filter(Boolean).map(safeDecode),
    query: new URLSearchParams(q),
  };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

/** Current route; re-renders on hash change. */
export function useRoute(): Route {
  const raw = useSyncExternalStore(subscribe, readHash, () => '/');
  return useMemo(() => parseLocation(raw), [raw]);
}

/** '#'-prefixed href for <a>. */
export function href(to: string): string {
  return `#${to.startsWith('/') ? to : `/${to}`}`;
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const target = href(to);
  if (opts.replace) {
    const url = new URL(window.location.href);
    url.hash = target;
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

/** Go back in history if there is something to go back to, else navigate to `fallback`. */
export function goBack(fallback: string): void {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback, { replace: true });
}

/**
 * Match a pattern against a path. Patterns: '/clients', '/clients/:id', '/batches/:id/edit',
 * '/import/*' (trailing * matches the rest, available as params['*']). Returns params or null.
 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean);
  const sp = path.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i]!;
    if (p === '*') {
      params['*'] = sp.slice(i).map(safeDecode).join('/');
      return params;
    }
    const s = sp[i];
    if (s === undefined) return null;
    if (p.startsWith(':')) params[p.slice(1)] = safeDecode(s);
    else if (p !== s) return null;
  }
  return sp.length === pp.length ? params : null;
}

/** Params of the current route for `pattern`, or null when it does not match. */
export function useMatch(pattern: string): Record<string, string> | null {
  const { path } = useRoute();
  return matchPath(pattern, path);
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
}

export function Link({ to, ...rest }: LinkProps) {
  return <a href={href(to)} {...rest} />;
}
