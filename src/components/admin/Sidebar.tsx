import React from 'react';
import { Link } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Car, 
  Calendar, 
  TrendingUp,
  LogOut, 
  FileText, 
  Building2 
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  handleLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, handleLogout }) => {
  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'applications', icon: Users, label: 'Applications' },
    { id: 'rentals', icon: Calendar, label: 'Rentals' },
    { id: 'financials', icon: TrendingUp, label: 'Financials' },
    { id: 'cars', icon: Car, label: 'Fleet' },
    { id: 'agreements', icon: FileText, label: 'Agreements' },
    { id: 'saas', icon: Building2, label: 'SaaS Clients' },
  ];

  return (
    <div className="w-72 bg-brand-navy border-r border-white/10 flex flex-col fixed h-full z-20">
      <div className="p-8 border-b border-white/10">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-gold rounded-xl flex items-center justify-center">
            <Car className="w-6 h-6 text-brand-navy" />
          </div>
          <div>
            <h1 className="text-white font-bold tracking-tighter leading-none">MAPLE</h1>
            <p className="text-[8px] text-brand-gold font-bold tracking-[0.3em] uppercase">Rentals Admin</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-6 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-4 px-5 py-4 text-sm font-bold uppercase tracking-widest transition-all ${
              activeTab === item.id 
                ? 'bg-brand-gold text-brand-navy shadow-lg shadow-brand-gold/10' 
                : 'text-brand-grey hover:text-white hover:bg-white/5'
            }`}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-6 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 px-5 py-4 text-sm font-bold uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-all rounded-xl"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
