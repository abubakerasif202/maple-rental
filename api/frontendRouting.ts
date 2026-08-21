export type RequestLike = {
  method: string;
  path: string;
  get: (name: string) => string | undefined;
};

const SPA_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/pricing\/?$/,
  /^\/cars\/?$/,
  /^\/cars\/[^/]+\/?$/,
  /^\/checkout\/[^/]+\/?$/,
  /^\/apply\/?$/,
  /^\/success\/?$/,
  /^\/admin\/?$/,
  /^\/admin\/login\/?$/,
  /^\/admin\/dashboard\/?$/,
  /^\/admin\/applications\/?$/,
  /^\/admin\/rentals\/?$/,
  /^\/admin\/customers\/?$/,
  /^\/admin\/invoices\/?$/,
  /^\/admin\/financials\/?$/,
  /^\/admin\/agreements\/?$/,
  /^\/admin\/toll-notices\/?$/,
  /^\/admin\/maintenance\/?$/,
  /^\/admin\/fleet-imports\/?$/,
];

const SAFE_SPA_FALLBACK_PATTERN =
  /^\/[a-zA-Z0-9][a-zA-Z0-9/_-]*\/?$/;

export const isKnownSpaRoute = (path: string) =>
  SPA_ROUTE_PATTERNS.some((pattern) => pattern.test(path));

const ROUTE_HTML_FILES: Readonly<Record<string, string>> = {
  '/apply': 'apply/index.html',
  '/apply/': 'apply/index.html',
  '/pricing': 'pricing/index.html',
  '/pricing/': 'pricing/index.html',
};

export const getSpaHtmlFile = (path: string) =>
  ROUTE_HTML_FILES[path] || 'index.html';

const acceptsHtmlNavigation = (req: RequestLike) => {
  if (req.method === 'HEAD') {
    return true;
  }

  const acceptHeader = req.get('accept') || '';
  return acceptHeader.includes('text/html');
};

export const shouldServeSpaEntry = (req: RequestLike) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    return false;
  }

  if (req.path.startsWith('/api/')) {
    return false;
  }

  if (req.path === '/') {
    return true;
  }

  if (!acceptsHtmlNavigation(req)) {
    return false;
  }

  return isKnownSpaRoute(req.path) || SAFE_SPA_FALLBACK_PATTERN.test(req.path);
};
