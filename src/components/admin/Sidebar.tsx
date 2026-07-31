import { useEffect, useRef, useState } from 'react';
import { Link } from '../../lib/router';
import { Button } from '@fluentui/react-components';
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  ScrollText,
  Car,
  TrendingUp,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Sheet,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  handleLogout: () => void;
  isCollapsed: boolean;
  isOpen: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  setActiveTab: (tab: string) => void;
}

const menuItems = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
  { id: 'applications', icon: Users, label: 'Applications' },
  { id: 'rentals', icon: Car, label: 'Rentals' },
  { id: 'customers', icon: Users, label: 'Customers' },
  { id: 'invoices', icon: DollarSign, label: 'Invoices' },
  { id: 'financials', icon: TrendingUp, label: 'Financials' },
  { id: 'agreements', icon: FileText, label: 'Agreements' },
  { id: 'toll-notices', icon: ScrollText, label: 'Toll Notices' },
  { id: 'maintenance', icon: Settings, label: 'Maintenance' },
  { id: 'fleet-imports', icon: Sheet, label: 'Fleet Imports' },
];

export default function Sidebar({
  activeTab,
  handleLogout,
  isCollapsed,
  isOpen,
  onClose,
  onToggleCollapse,
  setActiveTab,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false,
  );
  const collapsedClass = isCollapsed ? 'lg:w-24' : 'lg:w-72';
  const isMobileSidebarHidden = !isDesktop && !isOpen;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleChange = () => setIsDesktop(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (isDesktop || !isOpen) {
      return;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sidebarRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();

    return () => {
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [isDesktop, isOpen]);

  useEffect(() => {
    if (isDesktop || !isOpen) {
      return;
    }

    const handleMobileKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        event.preventDefault();
        sidebarRef.current?.focus();
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleMobileKeyDown);
    return () => document.removeEventListener('keydown', handleMobileKeyDown);
  }, [isDesktop, isOpen, onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close admin navigation"
        aria-hidden={!isOpen}
        tabIndex={isOpen ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-brand-navy/70 backdrop-blur-sm transition-opacity lg:hidden ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        ref={sidebarRef}
        id="admin-navigation"
        role={isDesktop ? undefined : 'dialog'}
        aria-label={isDesktop ? undefined : 'Admin navigation'}
        aria-modal={!isDesktop && isOpen ? true : undefined}
        aria-hidden={isMobileSidebarHidden}
        inert={isMobileSidebarHidden}
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 max-w-[85vw] flex-col border-r border-white/10 bg-[#061425] shadow-[24px_0_80px_rgba(0,0,0,0.24)] transition-all duration-300 lg:z-20 lg:max-w-none lg:overflow-hidden ${collapsedClass} ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-5 lg:p-6">
          <Link to="/" className="flex min-w-0 items-center gap-3" onClick={onClose}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold">
              <Car className="h-6 w-6 text-brand-navy" />
            </div>
            <div className={`min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
              <h1 className="truncate font-bold tracking-tighter leading-none text-white">MAPLE</h1>
              <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-brand-gold">
                Rentals Admin
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Button
              appearance="subtle"
              type="button"
              onClick={onToggleCollapse}
              className="!hidden !h-11 !w-11 !min-w-11 lg:!inline-flex"
              icon={isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              aria-label={isCollapsed ? 'Expand admin sidebar' : 'Collapse admin sidebar'}
            />
            <Button
              appearance="subtle"
              type="button"
              onClick={onClose}
              className="!h-11 !w-11 !min-w-11 lg:!hidden"
              icon={<X className="h-5 w-5" />}
              aria-label="Close admin navigation"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 lg:p-4">
          <div className="space-y-2">
            {menuItems.map((item) => {
              const selected = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => {
                    setActiveTab(item.id);
                    onClose();
                  }}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold uppercase tracking-widest transition-all ${
                    selected
                      ? 'bg-brand-gold text-brand-navy shadow-lg shadow-brand-gold/20'
                      : 'text-brand-grey hover:bg-white/5 hover:text-white'
                  } ${isCollapsed ? 'lg:justify-center lg:px-3' : ''}`}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className={isCollapsed ? 'lg:hidden' : ''}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-white/10 p-4 lg:p-5">
          <Button
            appearance="subtle"
            onClick={handleLogout}
            className={`!w-full !justify-start !rounded-2xl !px-4 !py-3 !text-sm !font-bold !uppercase !tracking-widest !text-red-300 hover:!bg-red-500/10 ${
              isCollapsed ? 'lg:!justify-center' : ''
            }`}
            icon={<LogOut className="h-5 w-5" />}
          >
            <span className={isCollapsed ? 'lg:hidden' : ''}>Logout</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
