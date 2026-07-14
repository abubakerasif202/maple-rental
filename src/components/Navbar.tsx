import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, Phone, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const navLinks = [
  { name: 'Home', path: '/' },
  { name: 'Pricing', path: '/pricing' },
  { name: 'Apply', path: '/apply' },
  { name: 'Contact', path: '/#contact' },
];

export const isNavigationPathActive = (path: string, pathname: string, hash: string) => {
  if (path === '/') {
    return pathname === '/' && hash !== '#contact';
  }

  if (path === '/#contact') {
    return pathname === '/' && hash === '#contact';
  }

  return pathname.startsWith(path.split('#')[0]);
};

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const mobileNavigationRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const mobileMenuWasOpenRef = useRef(false);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      if (mobileMenuWasOpenRef.current) {
        mobileToggleRef.current?.focus();
      }
      mobileMenuWasOpenRef.current = false;
      return;
    }

    mobileMenuWasOpenRef.current = true;
    const menu = mobileNavigationRef.current;
    const getFocusableElements = () =>
      Array.from(
        menu?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );

    getFocusableElements()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const isActive = (path: string) =>
    isNavigationPathActive(path, location.pathname, location.hash);

  return (
    <nav aria-label="Primary navigation" className="sticky top-0 z-50 border-b border-white/10 bg-brand-navy/88 backdrop-blur-xl">
      <div className="maple-container">
        <div className="flex h-[76px] items-center justify-between md:h-[88px]">
          <div className="flex flex-1 justify-start">
            <Link to="/" aria-label="Maple Rentals home" className="flex items-center rounded-lg">
              <img
                src="/maple-logo.webp"
                alt="Maple Rentals Sydney car rentals logo"
                className="h-14 w-auto object-contain drop-shadow-2xl md:h-[68px]"
              />
            </Link>
          </div>

          <div className="hidden flex-[2] items-center justify-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                aria-current={isActive(link.path) ? 'page' : undefined}
                className={`rounded-full px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.19em] transition-colors ${
                  isActive(link.path)
                    ? 'bg-white/[0.07] text-white'
                    : 'text-brand-grey hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="hidden flex-1 items-center justify-end gap-3 md:flex">
            <Link
              to="/apply"
              className="inline-flex items-center gap-2 rounded-full bg-brand-gold px-5 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-charcoal shadow-[0_10px_30px_rgba(223,177,37,0.18)] transition hover:-translate-y-0.5 hover:bg-brand-gold-light"
            >
              Apply now <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex items-center md:hidden">
            <button
              ref={mobileToggleRef}
              type="button"
              onClick={() => setIsOpen((open) => !open)}
              aria-expanded={isOpen}
              aria-controls="mobile-navigation"
              aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-white transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div
          ref={mobileNavigationRef}
          id="mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          className="fixed inset-x-0 top-[76px] h-[calc(100dvh-76px)] overflow-y-auto border-t border-white/10 bg-brand-charcoal/98 md:hidden"
        >
          <div className="maple-container flex min-h-full flex-col py-8">
            <p className="maple-eyebrow mb-5">Navigation</p>
            <div className="grid gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                aria-current={isActive(link.path) ? 'page' : undefined}
                className={`flex items-center justify-between rounded-2xl border px-5 py-4 text-sm font-bold uppercase tracking-[0.18em] ${
                  isActive(link.path)
                    ? 'border-brand-gold/30 bg-brand-gold/10 text-brand-gold'
                    : 'border-white/8 bg-white/[0.03] text-white'
                }`}
              >
                {link.name}<ArrowUpRight className="h-4 w-4" />
              </Link>
            ))}
            </div>
            <div className="mt-auto space-y-3 border-t border-white/10 pt-7">
              <Link
                to="/apply"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-gold px-6 py-4 text-xs font-extrabold uppercase tracking-[0.2em] text-brand-charcoal"
              >
                Start application <ArrowUpRight className="h-4 w-4" />
              </Link>
              <a
                href="tel:0420550556"
                className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-4 text-xs font-bold uppercase tracking-[0.18em] text-white"
              >
                <Phone className="h-4 w-4 text-brand-gold" /> 0420 550 556
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
