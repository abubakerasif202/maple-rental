import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
  /loading chunk/i,
];

const CHUNK_RELOAD_FLAG = 'maple-rentals:chunk-reloaded';

const canUseSessionStorage = () =>
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

export const isChunkLoadError = (error: unknown) => {
  if (error instanceof Error) {
    const message = `${error.name}: ${error.message}`;
    return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
  }

  if (typeof error === 'string') {
    return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(error));
  }

  return false;
};

export const getErrorDetails = (error: Error, isDevelopment: boolean) =>
  isDevelopment && error.message ? error.message : null;

const hasReloadedChunkFailure = () => {
  if (!canUseSessionStorage()) {
    return false;
  }

  try {
    return window.sessionStorage.getItem(CHUNK_RELOAD_FLAG) === 'true';
  } catch {
    return false;
  }
};

const markChunkFailureReloaded = () => {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, 'true');
  } catch {
    // Ignore storage failures and continue with the fallback UI.
  }
};

const maybeReloadAfterChunkFailure = (error: unknown) => {
  if (!isChunkLoadError(error) || !canUseSessionStorage()) {
    return false;
  }

  if (hasReloadedChunkFailure()) {
    return false;
  }

  markChunkFailureReloaded();
  window.location.reload();
  return true;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    void errorInfo;

    if (maybeReloadAfterChunkFailure(error)) {
      return;
    }

    if (import.meta.env.DEV) {
      console.error('Route rendering error:', error);
      return;
    }

    console.error('Route rendering error');
  }

  handleRefresh = () => {
    if (canUseSessionStorage()) {
      try {
        window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
      } catch {
        // Ignore storage failures and continue with the reload.
      }
    }

    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const isChunkFailure = isChunkLoadError(this.state.error);
    const errorDetails = getErrorDetails(this.state.error, import.meta.env.DEV);

    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6 py-20">
        <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-brand-navy-light p-8 shadow-2xl sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(223,177,37,0.18),_transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.05),_transparent_35%)]" />
          <div className="relative space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-gold/25 bg-brand-gold/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.28em] text-brand-gold">
              Maple Rentals
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-serif italic text-white sm:text-4xl">
                Something interrupted the experience
              </h1>
              <p className="max-w-xl text-sm leading-7 text-white/70">
                {isChunkFailure
                  ? 'A required page bundle failed to load. Refreshing once usually clears a stale asset mismatch after a deployment.'
                  : 'The page hit an unexpected rendering error. Refresh to try again, or return to the homepage if the issue persists.'}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={this.handleRefresh}
                className="inline-flex items-center justify-center rounded-full bg-brand-gold px-6 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-navy transition-colors hover:bg-brand-gold-light"
              >
                Refresh
              </button>
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-white/10 px-6 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-white transition-colors hover:border-brand-gold/40 hover:text-brand-gold"
              >
                Home
              </a>
            </div>
            {errorDetails ? (
              <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-6 text-white/50">
                {errorDetails}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
