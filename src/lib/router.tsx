import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

type NavigationOptions = {
  replace?: boolean;
  state?: unknown;
};

type RouterLocation = {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
};

type RouterContextValue = {
  location: RouterLocation;
  navigate: (to: string, options?: NavigationOptions) => void;
};

type RouteMatchContextValue = Record<string, string>;

const RouterContext = createContext<RouterContextValue | null>(null);
const RouteMatchContext = createContext<RouteMatchContextValue>({});

const readBrowserLocation = (): RouterLocation => ({
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
  state: window.history.state,
});

const parseLocation = (entry: string, state?: unknown): RouterLocation => {
  const parsed = new URL(entry, 'http://localhost');
  return {
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    state,
  };
};

const useRouterContext = () => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('Router components must be rendered inside a router.');
  }
  return context;
};

export function BrowserRouter({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(readBrowserLocation);

  useEffect(() => {
    const handleLocationChange = () => setLocation(readBrowserLocation());
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigate = useCallback((to: string, options: NavigationOptions = {}) => {
    const method = options.replace ? 'replaceState' : 'pushState';
    window.history[method](options.state ?? null, '', to);
    setLocation(readBrowserLocation());
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function MemoryRouter({
  children,
  initialEntries = ['/'],
}: {
  children: ReactNode;
  initialEntries?: string[];
}) {
  const initialEntry = initialEntries[initialEntries.length - 1] ?? '/';
  const [location, setLocation] = useState(() => parseLocation(initialEntry));

  const navigate = useCallback((to: string, options: NavigationOptions = {}) => {
    setLocation(parseLocation(to, options.state));
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export type RouteProps = {
  path: string;
  element: ReactElement;
};

export function Route(_props: RouteProps) {
  return null;
}

const matchRoute = (pattern: string, pathname: string): RouteMatchContextValue | null => {
  if (pattern === '*') {
    return {};
  }

  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = pathname.split('/').filter(Boolean);
  if (patternSegments.length !== pathSegments.length) {
    return null;
  }

  const params: RouteMatchContextValue = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const pathSegment = pathSegments[index];

    if (patternSegment.startsWith(':')) {
      try {
        params[patternSegment.slice(1)] = decodeURIComponent(pathSegment);
      } catch {
        return null;
      }
    } else if (patternSegment !== pathSegment) {
      return null;
    }
  }

  return params;
};

export function Routes({ children }: { children: ReactNode }) {
  const { location } = useRouterContext();

  for (const child of Children.toArray(children)) {
    if (!isValidElement<RouteProps>(child)) {
      continue;
    }

    const params = matchRoute(child.props.path, location.pathname);
    if (params) {
      return (
        <RouteMatchContext.Provider value={params}>
          {child.props.element}
        </RouteMatchContext.Provider>
      );
    }
  }

  return null;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
};

export function Link({ to, onClick, target, children, ...props }: LinkProps) {
  const { navigate } = useRouterContext();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target === '_blank' ||
      props.download
    ) {
      return;
    }

    event.preventDefault();
    navigate(to);
  };

  return (
    <a {...props} href={to} target={target} onClick={handleClick}>
      {children}
    </a>
  );
}

export function Navigate({
  to,
  replace = false,
}: {
  to: string;
  replace?: boolean;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, replace, to]);

  return null;
}

export const useLocation = () => useRouterContext().location;

export const useNavigate = () => useRouterContext().navigate;

export const useParams = <T extends Record<string, string | undefined> = Record<string, string>>() =>
  useContext(RouteMatchContext) as T;

export const useSearchParams = (): [URLSearchParams] => {
  const { location } = useRouterContext();
  return [useMemo(() => new URLSearchParams(location.search), [location.search])];
};
