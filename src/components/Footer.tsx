import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import BrandMark from './BrandMark';

export default function Footer() {
  return (
    <footer className="bg-brand-charcoal text-gray-400 py-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          <div>
            <Link to="/" className="flex items-center gap-4 mb-8 group">
              <BrandMark className="w-14 h-14" />
              <span className="font-serif font-bold text-xl text-white tracking-[0.18em] uppercase">MAPLE RENTALS</span>
            </Link>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed font-light">
              Sydney's professional fleet company supplying Toyota Camry Hybrid vehicles exclusively for Uber drivers.
            </p>
          </div>
          
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-8">Quick Links</h3>
            <ul className="space-y-5">
              <li><Link to="/" className="text-sm hover:text-[#C6A94F] transition-colors font-light">Home</Link></li>
              <li><Link to="/cars" className="text-sm hover:text-[#C6A94F] transition-colors font-light">Our Fleet</Link></li>
              <li><Link to="/admin/login" className="text-sm hover:text-[#C6A94F] transition-colors font-light opacity-50">Admin Login</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-8">Contact Us</h3>
            <ul className="space-y-5">
              <li className="flex items-center gap-4">
                <Phone className="h-4 w-4 text-[#C6A94F]" />
                <a href="tel:0420550556" className="text-sm hover:text-[#C6A94F] transition-colors font-light tracking-wider">0420 550 556</a>
              </li>
              <li className="flex items-center gap-4">
                <Mail className="h-4 w-4 text-[#C6A94F]" />
                <a href="mailto:hello@maplerentals.com.au" className="text-sm hover:text-[#C6A94F] transition-colors font-light">hello@maplerentals.com.au</a>
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
        
        <div className="border-t border-white/5 mt-20 pt-8 text-center text-xs text-gray-600 uppercase tracking-widest font-light">
          &copy; {new Date().getFullYear()} MAPLE RENTALS. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
