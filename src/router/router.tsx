/** A ~90 line History API router. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type Ref,
} from 'react';

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

export interface NavigateOptions {
  readonly replace?: boolean;
}

interface RouterValue {
  readonly path: string;
  readonly search: string;
  readonly navigate: (to: string, options?: NavigateOptions) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

function stripBase(pathname: string): string {
  if (BASE.length > 0 && pathname.startsWith(BASE)) {
    const rest = pathname.slice(BASE.length);
    return rest.length === 0 ? '/' : rest;
  }
  return pathname.length === 0 ? '/' : pathname;
}

export function toHref(to: string): string {
  return `${BASE}${to.startsWith('/') ? to : `/${to}`}`;
}

export function RouterProvider({ children }: { children: ReactNode }): ReactNode {
  const [location, setLocation] = useState(() => ({
    path: stripBase(window.location.pathname),
    search: window.location.search,
  }));

  useEffect(() => {
    const onPopState = (): void => {
      setLocation({ path: stripBase(window.location.pathname), search: window.location.search });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string, options?: NavigateOptions) => {
    const [path = '/', query = ''] = to.split('?');
    const search = query.length > 0 ? `?${query}` : '';
    const href = `${toHref(path)}${search}`;

    if (href === `${window.location.pathname}${window.location.search}`) return;

    if (options?.replace === true) window.history.replaceState(null, '', href);
    else window.history.pushState(null, '', href);

    setLocation({ path, search });
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo<RouterValue>(
    () => ({ path: location.path, search: location.search, navigate }),
    [location.path, location.search, navigate],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (value === null) throw new Error('useRouter must be used inside RouterProvider');
  return value;
}

export interface LinkProps {
  readonly to: string;
  readonly className?: string;
  readonly title?: string;
  readonly ref?: Ref<HTMLAnchorElement>;
  readonly children: ReactNode;
}

export function Link({ to, className, title, ref, children }: LinkProps): ReactNode {
  const { navigate } = useRouter();
  return (
    <a
      ref={ref}
      href={toHref(to)}
      className={className}
      title={title}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
