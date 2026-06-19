import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';

const quickLinks = [
  { label: 'Home', path: '/' },
  { label: 'Fleet', path: '/fleet' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'Apply', path: '/apply' },
  { label: 'FAQ', path: '/faq' },
  { label: 'Contact', path: '/contact' },
  { label: 'Admin Login', path: '/admin/login' },
];

export default function Footer() {
  return (
    <footer id="contact" className="bg-brand-navy text-gray-400 py-20 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          <div>
            <Link to="/" className="flex items-center mb-8 group">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-gold/30 bg-brand-gold/10 text-sm font-bold tracking-[0.2em] text-brand-gold">
                  AR
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-brand-gold">
                    Gala Rentals
                  </p>
                  <p className="text-[11px] text-gray-500">Luxury fleet subscriptions</p>
                </div>
              </div>
            </Link>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed font-light">
              Premium car rental and subscription programs for Australian drivers who want clean approvals,
              clear pricing, and a polished handover process.
            </p>
            <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-gray-600 font-light max-w-sm">
              Service areas: Sydney, Parramatta, Liverpool, Blacktown, and the greater metro area
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-8">Rental Links</h3>
            <ul className="space-y-5">
              {quickLinks.map((link) => (
                <li key={link.path}>
                  <Link to={link.path} className="text-sm hover:text-brand-gold transition-colors font-light">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-8">Contact Us</h3>
            <ul className="space-y-5">
              <li className="flex items-center gap-4">
                <Phone className="h-4 w-4 text-brand-gold" />
                <a href="tel:1300555828" className="text-sm hover:text-brand-gold transition-colors font-light tracking-wider">1300 555 828</a>
              </li>
              <li className="flex items-center gap-4">
                <Mail className="h-4 w-4 text-brand-gold" />
                <a href="mailto:hello@galarentals.com.au" className="text-sm hover:text-brand-gold transition-colors font-light">hello@galarentals.com.au</a>
              </li>
              <li className="flex items-start gap-4">
                <MapPin className="h-4 w-4 text-brand-gold mt-0.5" />
                <span className="text-sm font-light leading-relaxed">
                  Sydney CBD service hub
                  <br />
                  Australia
                </span>
              </li>
              <li className="text-xs text-gray-600 mt-8 space-y-2 font-light">
                <p>Premium rental operations</p>
                <p>ABN and licence details supplied in customer paperwork</p>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-20 pt-8 text-center text-xs text-gray-600 uppercase tracking-widest font-light">
          &copy; {new Date().getFullYear()} Gala Rentals. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
