import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';

const LogoIcon = ({ className = "w-12 h-12" }) => (
  <div className={`relative ${className} rounded-full border-2 border-slate-400 bg-brand-navy shadow-lg flex items-center justify-center overflow-hidden`}>
    <svg viewBox="0 0 100 100" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path 
        d="M50 45 L55 35 L65 38 L60 28 L70 25 L60 20 L65 10 L50 15 L35 10 L40 20 L30 25 L40 28 L35 38 L45 35 Z" 
        fill="#D4AF37" 
      />
      <path 
        d="M20 55 C20 50 30 48 50 48 C70 48 80 50 80 55 L85 60 L15 60 Z" 
        fill="#E2E8F0" 
      />
      <text x="50" y="75" textAnchor="middle" fill="#D4AF37" fontSize="8" fontWeight="bold" fontFamily="serif">MAPLE</text>
      <text x="50" y="85" textAnchor="middle" fill="#D4AF37" fontSize="6" fontWeight="bold" fontFamily="serif">RENTALS</text>
    </svg>
  </div>
);

export default function Footer() {
  return (
    <footer className="bg-brand-navy text-gray-400 py-20 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          <div>
            <Link to="/" className="flex items-center gap-6 mb-8 group">
              <LogoIcon className="w-12 h-12" />
              <div className="flex flex-col">
                <span className="font-serif font-bold text-xl text-white tracking-[0.1em] uppercase leading-none">MAPLE</span>
                <span className="font-serif text-xs text-brand-gold tracking-[0.2em] uppercase">RENTALS</span>
              </div>
            </Link>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed font-light">
              Sydney's professional fleet company supplying Toyota Camry Hybrid vehicles exclusively for Uber drivers.
            </p>
          </div>
          
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-8">Quick Links</h3>
            <ul className="space-y-5">
              <li><Link to="/" className="text-sm hover:text-brand-gold transition-colors font-light">Home</Link></li>
              <li><Link to="/cars" className="text-sm hover:text-brand-gold transition-colors font-light">Our Fleet</Link></li>
              <li><Link to="/rewards" className="text-sm hover:text-brand-gold transition-colors font-light">Driver Rewards</Link></li>
              <li><Link to="/admin/login" className="text-sm hover:text-brand-gold transition-colors font-light opacity-50">Admin Login</Link></li>
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
