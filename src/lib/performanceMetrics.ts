type MetricName = 'cls' | 'lcp' | 'ttfb';
type RouteCategory = 'home' | 'pricing' | 'apply' | 'checkout' | 'admin' | 'other';

type PerformanceMetric = {
  name: MetricName;
  value: number;
};

const metricLimits: Record<MetricName, number> = {
  cls: 10,
  lcp: 120_000,
  ttfb: 120_000,
};

export const categorizePerformanceRoute = (pathname: string): RouteCategory => {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/pricing')) return 'pricing';
  if (pathname.startsWith('/apply')) return 'apply';
  if (pathname.startsWith('/checkout')) return 'checkout';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'other';
};

const normalizeMetric = (name: MetricName, value: number): PerformanceMetric | null => {
  if (!Number.isFinite(value) || value < 0 || value > metricLimits[name]) {
    return null;
  }
  return { name, value };
};

export const buildPerformanceReport = (
  pathname: string,
  metrics: PerformanceMetric[]
) => {
  const deduplicated = new Map<MetricName, PerformanceMetric>();
  for (const metric of metrics) {
    const normalized = normalizeMetric(metric.name, metric.value);
    if (normalized) {
      deduplicated.set(metric.name, normalized);
    }
  }

  return {
    route: categorizePerformanceRoute(pathname),
    metrics: [...deduplicated.values()].slice(0, 3),
  };
};

export const initializePerformanceMetrics = () => {
  if (!import.meta.env.PROD || typeof PerformanceObserver === 'undefined') {
    return;
  }

  const metrics = new Map<MetricName, PerformanceMetric>();
  const initialPathname = location.pathname;
  let cumulativeLayoutShift = 0;
  let sent = false;

  const record = (name: MetricName, value: number) => {
    const metric = normalizeMetric(name, value);
    if (metric) metrics.set(name, metric);
  };

  const navigation = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (navigation) {
    record('ttfb', navigation.responseStart);
  }

  const observers: PerformanceObserver[] = [];
  const observe = (
    type: string,
    handler: (entries: PerformanceObserverEntryList) => void
  ) => {
    try {
      const observer = new PerformanceObserver((list) => handler(list));
      observer.observe({ type, buffered: true });
      observers.push(observer);
    } catch {
      // Unsupported entry types are expected on older browsers.
    }
  };

  observe('largest-contentful-paint', (list) => {
    const entry = list.getEntries().at(-1);
    if (entry) record('lcp', entry.startTime);
  });
  observe('layout-shift', (list) => {
    for (const entry of list.getEntries()) {
      const layoutShift = entry as PerformanceEntry & {
        hadRecentInput?: boolean;
        value?: number;
      };
      if (!layoutShift.hadRecentInput) {
        cumulativeLayoutShift += layoutShift.value || 0;
      }
    }
    record('cls', cumulativeLayoutShift);
  });

  const flush = () => {
    if (sent) return;
    const report = buildPerformanceReport(initialPathname, [...metrics.values()]);
    if (report.metrics.length === 0) return;

    sent = navigator.sendBeacon(
      '/api/performance',
      new Blob([JSON.stringify(report)], { type: 'application/json' })
    );
    if (sent) {
      observers.forEach((observer) => observer.disconnect());
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  }, { once: true });
  window.addEventListener('pagehide', flush, { once: true });
};
