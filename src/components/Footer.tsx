import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';

const quickLinks = [
  { label: 'Home', path: '/' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'Our Fleet', path: '/cars' },
  { label: 'Apply', path: '/apply' },
  { label: 'Admin Login', path: '/admin/login' },
];

export default function Footer() {
  return (
    <footer id="contact" className="bg-brand-navy text-gray-400 py-20 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          <div>
            <Link to="/" className="flex items-center mb-8 group">
              <img
                src="/maple-logo.webp"
                alt="Maple Rentals Logo"
                className="h-20 md:h-24 object-contain rounded-lg"
              />
            </Link>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed font-light">
              Sydney's professional fleet company supplying Toyota Camry Hybrid vehicles exclusively for Uber drivers.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-8">Quick Links</h3>
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
                <a href="tel:0420550556" className="text-sm hover:text-brand-gold transition-colors font-light tracking-wider">0420 550 556</a>
              </li>
              <li className="flex items-center gap-4">
                <Mail className="h-4 w-4 text-brand-gold" />
                <a href="mailto:hello@maplerentals.com.au" className="text-sm hover:text-brand-gold transition-colors font-light">hello@maplerentals.com.au</a>
              </li>
              <li className="text-xs text-gray-600 mt-8 space-y-2 font-light">
                <p>Sarfaraz Rajabi</p>
                <p>Licence No: 317786C</p>
                <p>ABN No: 16623061941</p>
                <p>ACN No: 623061941</p>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-20 pt-8 text-center text-xs text-gray-600 uppercase tracking-widest font-light">
          &copy; {new Date().getFullYear()} Maple Rentals. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
