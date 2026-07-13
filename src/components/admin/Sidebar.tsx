import { Link } from 'react-router-dom';
import { Button, Tab, TabList } from '@fluentui/react-components';
import {
  LayoutDashboard,
  Users,
  Car,
  Calendar,
  TrendingUp,
  DollarSign,
  LogOut,
  FileText,
  ScrollText,
  Settings,
  X
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  handleLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  handleLogout,
  isOpen,
  onClose,
}: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'applications', icon: Users, label: 'Applications' },
    { id: 'rentals', icon: Calendar, label: 'Rentals' },
    { id: 'customers', icon: Users, label: 'Customers' },
    { id: 'invoices', icon: DollarSign, label: 'Invoices' },
    { id: 'financials', icon: TrendingUp, label: 'Financials' },
    { id: 'agreements', icon: FileText, label: 'Agreements' },
    { id: 'toll-notices', icon: ScrollText, label: 'Toll Notices' },
    { id: 'maintenance', icon: Settings, label: 'Maintenance' },
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Close admin navigation"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-brand-navy/70 backdrop-blur-sm transition-opacity lg:hidden ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 max-w-[85vw] flex-col border-r border-white/10 bg-[#061425] shadow-[24px_0_80px_rgba(0,0,0,0.24)] transition-transform duration-300 lg:z-20 lg:max-w-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-6 lg:p-8">
          <Link to="/" className="flex items-center gap-3" onClick={onClose}>
            <div className="w-10 h-10 bg-brand-gold rounded-xl flex items-center justify-center">
              <Car className="w-6 h-6 text-brand-navy" />
            </div>
            <div>
              <h1 className="text-white font-bold tracking-tighter leading-none">MAPLE</h1>
              <p className="text-[8px] text-brand-gold font-bold tracking-[0.3em] uppercase">Rentals Admin</p>
            </div>
          </Link>
          <Button
            appearance="subtle"
            type="button"
            onClick={onClose}
            className="!h-11 !w-11 !min-w-11 lg:!hidden"
            icon={<X className="h-5 w-5" />}
            aria-label="Close admin navigation"
          />
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto p-4 lg:p-6">
          <TabList
            vertical
            selectedValue={activeTab}
            onTabSelect={(_, data) => {
              setActiveTab(String(data.value));
              onClose();
            }}
            className="!flex !w-full !gap-2"
          >
            {menuItems.map((item) => (
              <Tab
                key={item.id}
                value={item.id}
                icon={<item.icon className="w-5 h-5" />}
                className={`!justify-start !rounded-lg !px-5 !py-4 !text-sm !font-bold !uppercase !tracking-widest ${
                  activeTab === item.id
                    ? '!bg-brand-gold !text-brand-navy'
                    : '!text-brand-grey hover:!bg-white/5 hover:!text-white'
                }`}
              >
                {item.label}
              </Tab>
            ))}
          </TabList>
        </nav>

        <div className="border-t border-white/10 p-4 lg:p-6">
          <Button
            appearance="subtle"
            onClick={handleLogout}
            className="!w-full !justify-start !rounded-lg !px-5 !py-4 !text-sm !font-bold !uppercase !tracking-widest !text-red-400 hover:!bg-red-500/10"
            icon={<LogOut className="w-5 h-5" />}
          >
            Logout
          </Button>
        </div>
      </aside>
    </>
  );
}
